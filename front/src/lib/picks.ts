import type { BracketPhase, BracketPicks, GroupPhase, GroupPicks, ID, Match, Phase, Slot } from './api/types'

export const hasResults = (p: Phase) =>
  p.status === 'completed' || !!(p.kind === 'groups' ? p.standings : p.results)

// ---- Groups --------------------------------------------------------------

// Shape picks to exactly match the phase definition (bucket sizes, known teams).
export function normalizeGroupPicks(phase: GroupPhase, picks?: GroupPicks): GroupPicks {
  const out: GroupPicks = { kind: 'groups', groups: {} }
  for (const g of phase.groups) {
    const seen = new Set<ID>()
    out.groups[g.id] = {}
    for (const b of g.buckets) {
      const prev = picks?.groups[g.id]?.[b.id] ?? []
      out.groups[g.id][b.id] = Array.from({ length: b.slots }, (_, i) => {
        const t = prev[i]
        if (!t || seen.has(t) || !g.teamIds.includes(t)) return null
        seen.add(t)
        return t
      })
    }
  }
  return out
}

export function placedTeams(picks: GroupPicks, groupId: ID): Set<ID> {
  return new Set(Object.values(picks.groups[groupId] ?? {}).flat().filter((t): t is ID => !!t))
}

function locate(picks: GroupPicks, groupId: ID, team: ID): [ID, number] | null {
  for (const [bid, slots] of Object.entries(picks.groups[groupId])) {
    const i = slots.indexOf(team)
    if (i >= 0) return [bid, i]
  }
  return null
}

// Put `team` into bucket/slot. If slot is omitted, use the first empty one.
// An occupant is swapped into the team's old slot, or back to the pool.
export function placeTeam(picks: GroupPicks, groupId: ID, team: ID, bucketId: ID, slot?: number): GroupPicks {
  const next: GroupPicks = JSON.parse(JSON.stringify(picks)) // picks may be a reactive proxy
  const g = next.groups[groupId]
  const from = locate(next, groupId, team)
  if (slot === undefined) {
    if (from && from[0] === bucketId) return picks
    slot = g[bucketId].indexOf(null)
    if (slot < 0) slot = g[bucketId].length - 1 // full: replace the last one
  }
  const occupant = g[bucketId][slot]
  if (from) g[from[0]][from[1]] = occupant ?? null
  g[bucketId][slot] = team
  return next
}

export function removeTeam(picks: GroupPicks, groupId: ID, team: ID): GroupPicks {
  const next: GroupPicks = JSON.parse(JSON.stringify(picks)) // picks may be a reactive proxy
  const at = locate(next, groupId, team)
  if (at) next.groups[groupId][at[0]][at[1]] = null
  return next
}

export function groupComplete(phase: GroupPhase, picks: GroupPicks) {
  return phase.groups.every((g) => Object.values(picks.groups[g.id]).every((s) => s.every(Boolean)))
}

// ---- Bracket -------------------------------------------------------------

// A winner carries forward as soon as it's picked, even if the opponent isn't
// known yet. A loser needs both sides known.
export function resolveSlot(slot: Slot, winners: Record<ID, ID>, byId: Map<ID, Match>): ID | null {
  if ('tbd' in slot) return slot.teamId ?? null
  if ('teamId' in slot) return slot.teamId
  const m = byId.get(slot.from)
  if (!m) return null
  const [a, b] = [resolveSlot(m.a, winners, byId), resolveSlot(m.b, winners, byId)]
  const w = winners[m.id]
  if (!w || (w !== a && w !== b)) return null
  if (slot.take === 'winner') return w
  return w === a ? b : a
}

export type Side = 'a' | 'b'

// Which side of the match `winners` says won, if that side resolves to the winner.
export function winningSide(m: Match, winners: Record<ID, ID>, byId: Map<ID, Match>): Side | null {
  const w = winners[m.id]
  if (!w) return null
  if (resolveSlot(m.a, winners, byId) === w) return 'a'
  if (resolveSlot(m.b, winners, byId) === w) return 'b'
  return null
}

// Grade by slot, not by team: picking the side fed by "winner of UB1" is correct
// if that side wins, even when a different team than predicted came through it.
export function gradeMatch(phase: BracketPhase, picks: BracketPicks, matchId: ID): 'good' | 'bad' | null {
  const res = phase.results?.[matchId]
  const m = phase.matches.find((m) => m.id === matchId)
  if (!res || !m || !picks.winners[matchId]) return null
  const byId = new Map(phase.matches.map((m) => [m.id, m]))
  const actual = Object.fromEntries(Object.entries(phase.results ?? {}).map(([id, r]) => [id, r.winner]))
  const actualSide = winningSide(m, actual, byId)
  const pickedSide = winningSide(m, picks.winners, byId)
  if (!actualSide || !pickedSide) return picks.winners[matchId] === res.winner ? 'good' : 'bad'
  return actualSide === pickedSide ? 'good' : 'bad'
}

// Drop picks that no longer make sense after an upstream change.
export function pruneBracket(phase: BracketPhase, picks: BracketPicks): BracketPicks {
  const byId = new Map(phase.matches.map((m) => [m.id, m]))
  const winners = { ...picks.winners }
  let changed = true
  while (changed) {
    changed = false
    for (const m of phase.matches) {
      const w = winners[m.id]
      if (!w) continue
      const a = resolveSlot(m.a, winners, byId)
      const b = resolveSlot(m.b, winners, byId)
      if (w !== a && w !== b) {
        delete winners[m.id]
        changed = true
      }
    }
  }
  return { kind: 'bracket', winners }
}

export function bracketComplete(phase: BracketPhase, picks: BracketPicks) {
  return phase.matches.every((m) => picks.winners[m.id])
}
