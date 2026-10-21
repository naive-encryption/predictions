// In-browser fake backend so the UI runs without the Go server.
// Everything (teams, tournaments, picks) persists in localStorage.
// Scoring here is a stand-in for the real one.
import { gradeMatch, hasResults } from '../picks'
import { doubleElim8, groupsOf4, singleElim8, swiss } from '../templates'
import { validateTournament } from '../validate'
import type { AdminApi, Api } from './client'
import type {
  ID, Leaderboard, LeaderboardEntry, Phase, PhasePicks, Team, Tournament, TournamentInput, TournamentPicks,
  TournamentSummary, User,
} from './types'

const wait = (ms = 180) => new Promise((r) => setTimeout(r, ms + Math.random() * 120))
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---- Fixtures ------------------------------------------------------------

const TEAMS: Team[] = [
  ['spirit', 'Team Spirit', 'Spirit', '#1f2937'],
  ['liquid', 'Team Liquid', 'Liquid', '#0e3b5c'],
  ['tundra', 'Tundra Esports', 'Tundra', '#2e6b4f'],
  ['gg', 'Gaimin Gladiators', 'GG', '#c2410c'],
  ['falcons', 'Team Falcons', 'Falcons', '#0f766e'],
  ['betboom', 'BetBoom Team', 'BB', '#b91c1c'],
  ['xg', 'Xtreme Gaming', 'XG', '#7c2d12'],
  ['parivision', 'PARIVISION', 'PARI', '#4338ca'],
  ['aurora', 'Aurora Gaming', 'Aurora', '#9d174d'],
  ['nigma', 'Nigma Galaxy', 'Nigma', '#334155'],
  ['og', 'OG', 'OG', '#0a0a0a'],
  ['tidebound', 'Team Tidebound', 'Tide', '#155e75'],
  ['heroic', 'HEROIC', 'Heroic', '#a16207'],
  ['navi', 'Natus Vincere', 'NAVI', '#ca8a04'],
  ['talon', 'Talon Esports', 'Talon', '#be123c'],
  ['shopify', 'Shopify Rebellion', 'SR', '#4d7c0f'],
].map(([id, name, tag, color]) => ({ id, name, tag, color }))

const ALL = TEAMS.map((t) => t.id)

function fixtures(): TournamentInput[] {
  const tiGroups = swiss('groups', 'Group Stage', ALL)
  tiGroups.status = 'completed'
  tiGroups.locksAt = '2026-08-07T10:00:00Z'
  tiGroups.standings = {
    swiss: {
      '3-0': ['falcons', 'spirit'],
      '3-1': ['xg', 'tundra', 'parivision'],
      '3-2': ['liquid', 'gg', 'betboom'],
      '2-3': ['aurora', 'navi', 'heroic'],
      '1-3': ['nigma', 'og', 'tidebound'],
      '0-3': ['talon', 'shopify'],
    },
  }
  const tiPlayoffs = doubleElim8('playoffs', 'Playoffs', ['falcons', 'spirit', 'xg', 'tundra', 'parivision', 'liquid', 'gg', 'betboom'])
  tiPlayoffs.status = 'open'
  tiPlayoffs.locksAt = '2026-10-29T09:00:00Z'

  const playin = groupsOf4('playin', 'Play-in', ['aurora', 'nigma', 'og', 'tidebound', 'heroic', 'navi', 'talon', 'shopify'])
  playin.status = 'open'
  playin.locksAt = '2026-11-20T10:00:00Z'
  const majorGroups = swiss('groups', 'Group Stage', ALL)
  majorGroups.status = 'open'
  majorGroups.locksAt = '2026-11-24T10:00:00Z'
  const majorPlayoffs = singleElim8('playoffs', 'Playoffs')
  majorPlayoffs.opensAt = '2026-12-01T10:00:00Z'

  return [
    {
      id: 'ti-2026',
      name: 'The International 2026',
      subtitle: 'Hamburg · Barclays Arena',
      startsAt: '2026-08-07T10:00:00Z',
      endsAt: '2026-11-01T20:00:00Z',
      status: 'live',
      teamIds: ALL,
      phases: [tiGroups, tiPlayoffs],
    },
    {
      id: 'winter-major-2026',
      name: 'Winter Major 2026',
      subtitle: 'Online qualifiers into LAN',
      startsAt: '2026-11-20T10:00:00Z',
      endsAt: '2026-12-14T20:00:00Z',
      status: 'upcoming',
      teamIds: ALL,
      phases: [playin, majorGroups, majorPlayoffs],
    },
  ]
}

const ME: User = { id: 'me', name: 'you', admin: true }

// Pre-seeded picks so the completed TI group stage has something to grade.
const SEED_PICKS: Record<ID, TournamentPicks> = {
  'ti-2026': {
    phases: {
      groups: {
        kind: 'groups',
        groups: {
          swiss: {
            '3-0': ['spirit', 'falcons'],
            '3-1': ['tundra', 'gg', 'liquid'],
            '3-2': ['xg', 'betboom', 'aurora'],
            '2-3': ['parivision', 'navi', 'heroic'],
            '1-3': ['og', 'nigma', 'talon'],
            '0-3': ['tidebound', 'shopify'],
          },
        },
      },
    },
  },
}

// ---- Mock scoring (stand-in for the backend) -----------------------------

function scorePhase(phase: Phase | undefined, picks?: PhasePicks): number {
  if (!phase || !picks) return 0
  let pts = 0
  if (phase.kind === 'groups' && picks.kind === 'groups') {
    for (const [gid, buckets] of Object.entries(phase.standings ?? {}))
      for (const [bid, actual] of Object.entries(buckets))
        for (const team of picks.groups[gid]?.[bid] ?? []) if (team && actual.includes(team)) pts++
  }
  if (phase.kind === 'bracket' && picks.kind === 'bracket') {
    const roundIdx = new Map(phase.rounds.map((r, i) => [r.id, i]))
    for (const m of phase.matches) {
      if (gradeMatch(phase, picks, m.id) === 'good') pts += 2 ** Math.min(3, roundIdx.get(m.roundId) ?? 0)
    }
  }
  return pts
}

// ---- Fake leaderboard ----------------------------------------------------

const ADJ = ['quiet', 'rapid', 'lucky', 'salty', 'brave', 'midnight', 'iron', 'paper', 'silent', 'golden', 'lazy', 'arcane']
const NOUN = ['roshan', 'courier', 'ward', 'tango', 'aegis', 'rapier', 'creep', 'tower', 'blink', 'smoke', 'shrine', 'gem']

function fakePlayers(t: Tournament): LeaderboardEntry[] {
  const r = rng(t.id.length * 7919)
  return Array.from({ length: 240 }, (_, i) => {
    const phases: Record<ID, number> = {}
    for (const p of t.phases) {
      if (!hasResults(p)) continue
      const max = p.kind === 'groups' ? p.groups.reduce((n, g) => n + g.teamIds.length, 0) : 20
      phases[p.id] = Math.round(max * (0.15 + 0.6 * r() ** 1.4))
    }
    const name = `${ADJ[Math.floor(r() * ADJ.length)]}_${NOUN[Math.floor(r() * NOUN.length)]}${i % 7 ? Math.floor(r() * 99) : ''}`
    return { rank: 0, user: { id: `u${i}`, name }, points: 0, phases }
  })
}

// ---- Api implementation --------------------------------------------------

const KEY = 'pickem.mock.v2'

interface Store {
  teams: Team[]
  tournaments: TournamentInput[]
  picks: Record<ID, TournamentPicks>
}

export class MockApi implements Api {
  private db: Store

  constructor() {
    let saved: Store | null = null
    try {
      saved = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    } catch {}
    this.db = saved ?? { teams: clone(TEAMS), tournaments: fixtures(), picks: clone(SEED_PICKS) }
  }

  private persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.db))
    } catch {
      throw new Error('Browser storage is full (big logos?). Use smaller images.')
    }
  }

  private def(id: ID) {
    const t = this.db.tournaments.find((t) => t.id === id)
    if (!t) throw new Error('Tournament not found')
    return t
  }

  private phase(tid: ID, pid: ID) {
    const p = this.def(tid).phases.find((p) => p.id === pid)
    if (!p) throw new Error('Phase not found')
    return p
  }

  // Join team ids to team objects, like the backend would.
  private full(def: TournamentInput): Tournament {
    const { teamIds, ...rest } = clone(def)
    const byId = new Map(this.db.teams.map((t) => [t.id, t]))
    return { ...rest, teams: teamIds.map((id) => byId.get(id)).filter((t): t is Team => !!t) }
  }

  async me() {
    await wait(60)
    return ME
  }
  loginUrl() {
    return '#'
  }
  async logout() {}

  async teams() {
    await wait()
    return clone(this.db.teams)
  }

  async tournaments(): Promise<TournamentSummary[]> {
    await wait()
    return this.db.tournaments.map(({ teamIds, phases, ...rest }) => ({ ...clone(rest), teamCount: teamIds.length, phaseCount: phases.length }))
  }

  async tournament(id: ID) {
    await wait()
    return this.full(this.def(id))
  }

  async picks(tid: ID): Promise<TournamentPicks> {
    await wait()
    const t = this.def(tid)
    const mine = clone(this.db.picks[tid] ?? { phases: {} })
    mine.points = Object.fromEntries(t.phases.map((p) => [p.id, scorePhase(p, mine.phases[p.id])]))
    return mine
  }

  async savePicks(tid: ID, pid: ID, picks: PhasePicks) {
    await wait(350)
    const phase = this.phase(tid, pid)
    if (phase.status !== 'open') throw new Error('This phase is locked')
    this.db.picks[tid] ??= { phases: {} }
    this.db.picks[tid].phases[pid] = clone(picks)
    this.db.picks[tid].updatedAt = new Date().toISOString()
    this.persist()
    return clone(picks)
  }

  async leaderboard(tid: ID, opts: { phase?: ID; offset?: number; limit?: number } = {}): Promise<Leaderboard> {
    await wait()
    const t = this.full(this.def(tid))
    const mine = await this.picks(tid)
    const rows = fakePlayers(t)
    rows.push({ rank: 0, user: ME, points: 0, phases: mine.points ?? {} })
    for (const row of rows)
      row.points = opts.phase ? (row.phases?.[opts.phase] ?? 0) : Object.values(row.phases ?? {}).reduce((a, b) => a + b, 0)
    rows.sort((a, b) => b.points - a.points || a.user.name.localeCompare(b.user.name))
    // competition ranking: ties share a rank
    rows.forEach((row, i) => (row.rank = i > 0 && rows[i - 1].points === row.points ? rows[i - 1].rank : i + 1))
    const offset = opts.offset ?? 0
    const limit = opts.limit ?? 50
    return { entries: rows.slice(offset, offset + limit), total: rows.length, me: rows.find((r) => r.user.id === ME.id) }
  }

  // ---- Admin ----

  admin: AdminApi = {
    createTeam: async (team) => {
      await wait()
      if (!/^[a-z0-9][a-z0-9-_]*$/.test(team.id)) throw new Error('Team id must be a lowercase slug')
      if (this.db.teams.some((t) => t.id === team.id)) throw new Error(`Team "${team.id}" already exists`)
      this.db.teams.push(clone(team))
      this.persist()
      return clone(team)
    },
    updateTeam: async (id, team) => {
      await wait()
      const i = this.db.teams.findIndex((t) => t.id === id)
      if (i < 0) throw new Error('Team not found')
      this.db.teams[i] = { ...clone(team), id } // ids are permanent
      this.persist()
      return clone(this.db.teams[i])
    },
    deleteTeam: async (id) => {
      await wait()
      const used = this.db.tournaments.filter((t) => t.teamIds.includes(id))
      if (used.length) throw new Error(`Used in ${used.map((t) => t.name).join(', ')}`)
      this.db.teams = this.db.teams.filter((t) => t.id !== id)
      this.persist()
    },
    upload: async (file) => {
      if (file.size > 300_000) throw new Error('Mock uploads are limited to 300 KB')
      const url = await new Promise<string>((res, rej) => {
        const r = new FileReader()
        r.onload = () => res(r.result as string)
        r.onerror = () => rej(new Error('Could not read file'))
        r.readAsDataURL(file)
      })
      return { url }
    },
    createTournament: async (t) => {
      await wait()
      if (this.db.tournaments.some((x) => x.id === t.id)) throw new Error(`Tournament "${t.id}" already exists`)
      this.check(t)
      this.db.tournaments.push(clone(t))
      this.persist()
      return this.full(t)
    },
    updateTournament: async (id, t) => {
      await wait()
      const i = this.db.tournaments.findIndex((x) => x.id === id)
      if (i < 0) throw new Error('Tournament not found')
      if (t.id !== id) throw new Error('Tournament ids are permanent')
      this.check(t)
      this.db.tournaments[i] = clone(t)
      this.persist()
      return this.full(t)
    },
    deleteTournament: async (id) => {
      await wait()
      this.db.tournaments = this.db.tournaments.filter((t) => t.id !== id)
      delete this.db.picks[id]
      this.persist()
    },
    patchPhase: async (tid, pid, patch) => {
      await wait()
      const p = this.phase(tid, pid)
      if (patch.status) p.status = patch.status
      if (patch.opensAt !== undefined) patch.opensAt === null ? delete p.opensAt : (p.opensAt = patch.opensAt)
      if (patch.locksAt !== undefined) patch.locksAt === null ? delete p.locksAt : (p.locksAt = patch.locksAt)
      this.persist()
      return this.full(this.def(tid))
    },
    saveStandings: async (tid, pid, standings) => {
      await wait()
      const p = this.phase(tid, pid)
      if (p.kind !== 'groups') throw new Error('Not a group phase')
      p.standings = clone(standings)
      this.persist()
      return this.full(this.def(tid))
    },
    saveResults: async (tid, pid, results) => {
      await wait()
      const p = this.phase(tid, pid)
      if (p.kind !== 'bracket') throw new Error('Not a bracket phase')
      p.results = clone(results)
      this.persist()
      return this.full(this.def(tid))
    },
    saveSeeds: async (tid, pid, seeds) => {
      await wait()
      const p = this.phase(tid, pid)
      if (p.kind !== 'bracket') throw new Error('Not a bracket phase')
      for (const m of p.matches) {
        for (const side of ['a', 'b'] as const) {
          const slot = m[side]
          if (!('tbd' in slot)) continue
          const team = seeds[m.id]?.[side]
          if (team) slot.teamId = team
          else delete slot.teamId
        }
      }
      this.persist()
      return this.full(this.def(tid))
    },
  }

  private check(t: TournamentInput) {
    const errs = validateTournament(t, new Set(this.db.teams.map((x) => x.id)))
    if (errs.length) throw new Error(errs[0])
  }
}
