// Starting points for common formats. Admins add one, then tweak.
import type { BracketPhase, GroupPhase, ID, Match, Phase, Slot, TournamentInput } from './api/types'

const tbd = (label: string): Slot => ({ tbd: true, label })
const w = (from: ID): Slot => ({ from, take: 'winner' })
const l = (from: ID): Slot => ({ from, take: 'loser' })
const m = (id: ID, roundId: ID, a: Slot, b: Slot, bestOf = 3): Match => ({ id, roundId, label: id.toUpperCase(), bestOf, a, b })

export function swiss(id: ID, name: string, teamIds: ID[]): GroupPhase {
  return {
    id,
    name,
    kind: 'groups',
    status: 'upcoming',
    scoring: '1 point for each team placed on its exact record.',
    groups: [
      {
        id: 'swiss',
        name: 'Swiss',
        teamIds,
        buckets: [
          { id: '3-0', label: '3–0', slots: 2, tone: 'advance', hint: 'Upper bracket' },
          { id: '3-1', label: '3–1', slots: 3, tone: 'advance', hint: 'Advance' },
          { id: '3-2', label: '3–2', slots: 3, tone: 'advance', hint: 'Advance' },
          { id: '2-3', label: '2–3', slots: 3, tone: 'eliminate', hint: 'Eliminated' },
          { id: '1-3', label: '1–3', slots: 3, tone: 'eliminate', hint: 'Eliminated' },
          { id: '0-3', label: '0–3', slots: 2, tone: 'eliminate', hint: 'Eliminated' },
        ],
      },
    ],
  }
}

// Groups of four, top two advance.
export function groupsOf4(id: ID, name: string, teamIds: ID[]): GroupPhase {
  const groups = []
  for (let i = 0; i < teamIds.length; i += 4) {
    const letter = String.fromCharCode(65 + i / 4)
    groups.push({
      id: letter.toLowerCase(),
      name: `Group ${letter}`,
      teamIds: teamIds.slice(i, i + 4),
      buckets: [
        { id: 'adv', label: 'Advance', slots: 2, tone: 'advance' as const, hint: 'Top two' },
        { id: 'out', label: 'Out', slots: Math.max(0, Math.min(4, teamIds.length - i) - 2), tone: 'eliminate' as const, hint: 'Eliminated' },
      ],
    })
  }
  return { id, name, kind: 'groups', status: 'upcoming', scoring: '2 points per team in its correct placement.', groups }
}

export function singleElim8(id: ID, name: string): BracketPhase {
  return {
    id,
    name,
    kind: 'bracket',
    status: 'upcoming',
    scoring: 'Correct series winner: 1 pt, 2 pts, 4 pts by round.',
    rounds: [
      { id: 'qf', name: 'Quarterfinals', section: 'Bracket' },
      { id: 'sf', name: 'Semifinals', section: 'Bracket' },
      { id: 'f', name: 'Final', section: 'Bracket' },
    ],
    matches: [
      m('qf1', 'qf', tbd('Seed 1'), tbd('Seed 8')),
      m('qf2', 'qf', tbd('Seed 4'), tbd('Seed 5')),
      m('qf3', 'qf', tbd('Seed 2'), tbd('Seed 7')),
      m('qf4', 'qf', tbd('Seed 3'), tbd('Seed 6')),
      m('sf1', 'sf', w('qf1'), w('qf2')),
      m('sf2', 'sf', w('qf3'), w('qf4')),
      m('f', 'f', w('sf1'), w('sf2'), 5),
    ],
  }
}

export function doubleElim8(id: ID, name: string, seeds?: ID[]): BracketPhase {
  const s = (i: number): Slot => (seeds?.[i] ? { teamId: seeds[i] } : tbd(`Seed ${i + 1}`))
  return {
    id,
    name,
    kind: 'bracket',
    status: 'upcoming',
    scoring: 'Correct series winner: 1 pt in round one, doubling each round. Grand final: 8 pts.',
    rounds: [
      { id: 'ubq', name: 'Upper Quarterfinals', section: 'Upper bracket' },
      { id: 'ubs', name: 'Upper Semifinals', section: 'Upper bracket' },
      { id: 'ubf', name: 'Upper Final', section: 'Upper bracket' },
      { id: 'lb1', name: 'Lower Round 1', section: 'Lower bracket' },
      { id: 'lb2', name: 'Lower Quarterfinals', section: 'Lower bracket' },
      { id: 'lbs', name: 'Lower Semifinal', section: 'Lower bracket' },
      { id: 'lbf', name: 'Lower Final', section: 'Lower bracket' },
      { id: 'gf', name: 'Grand Final', section: 'Grand final' },
    ],
    matches: [
      m('ub1', 'ubq', s(0), s(7)), m('ub2', 'ubq', s(3), s(4)), m('ub3', 'ubq', s(1), s(6)), m('ub4', 'ubq', s(2), s(5)),
      m('ub5', 'ubs', w('ub1'), w('ub2')), m('ub6', 'ubs', w('ub3'), w('ub4')),
      m('ub7', 'ubf', w('ub5'), w('ub6')),
      m('lb1', 'lb1', l('ub1'), l('ub2'), 1), m('lb2', 'lb1', l('ub3'), l('ub4'), 1),
      m('lb3', 'lb2', l('ub6'), w('lb1')), m('lb4', 'lb2', l('ub5'), w('lb2')),
      m('lb5', 'lbs', w('lb3'), w('lb4')),
      m('lb6', 'lbf', l('ub7'), w('lb5')),
      m('gf', 'gf', w('ub7'), w('lb6'), 5),
    ],
  }
}

export const PHASE_TEMPLATES: { key: string; label: string; make: (id: ID, teamIds: ID[]) => Phase }[] = [
  { key: 'swiss', label: 'Swiss, 16 teams', make: (id, t) => swiss(id, 'Group Stage', t) },
  { key: 'groups4', label: 'Groups of 4', make: (id, t) => groupsOf4(id, 'Play-in', t) },
  { key: 'se8', label: 'Single elim, 8', make: (id) => singleElim8(id, 'Playoffs') },
  { key: 'de8', label: 'Double elim, 8', make: (id) => doubleElim8(id, 'Playoffs') },
]

export function blankTournament(): TournamentInput {
  const day = 86400_000
  return {
    id: '',
    name: '',
    status: 'upcoming',
    startsAt: new Date(Date.now() + 14 * day).toISOString(),
    endsAt: new Date(Date.now() + 28 * day).toISOString(),
    teamIds: [],
    phases: [],
  }
}
