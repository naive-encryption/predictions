// Structural checks for a tournament definition. The backend should run the
// same checks before saving (see API.md). Returns human-readable problems.
import type { ID, Slot, TournamentInput } from './api/types'

const SLUG = /^[a-z0-9][a-z0-9-_]*$/

export function validateTournament(t: TournamentInput, knownTeams: Set<ID>): string[] {
  const errs: string[] = []
  const dupes = (ids: ID[]) => ids.filter((id, i) => ids.indexOf(id) !== i)

  if (!SLUG.test(t.id)) errs.push('Tournament id must be a lowercase slug, e.g. "ti-2026".')
  if (!t.name.trim()) errs.push('Tournament needs a name.')
  if (isNaN(Date.parse(t.startsAt)) || isNaN(Date.parse(t.endsAt))) errs.push('Start and end dates must be valid.')
  else if (Date.parse(t.endsAt) < Date.parse(t.startsAt)) errs.push('End date is before the start date.')
  for (const d of dupes(t.teamIds)) errs.push(`Team "${d}" is listed twice.`)
  for (const id of t.teamIds) if (!knownTeams.has(id)) errs.push(`Unknown team "${id}". Create it under Teams first.`)
  const inTournament = new Set(t.teamIds)

  for (const d of dupes(t.phases.map((p) => p.id))) errs.push(`Phase id "${d}" is used twice.`)
  for (const p of t.phases) {
    const at = `${p.name || p.id}:`
    if (!SLUG.test(p.id)) errs.push(`${at} phase id must be a lowercase slug.`)
    if (p.kind === 'groups') {
      if (!p.groups?.length) errs.push(`${at} needs at least one group.`)
      for (const d of dupes(p.groups.map((g) => g.id))) errs.push(`${at} group id "${d}" is used twice.`)
      for (const g of p.groups ?? []) {
        for (const d of dupes(g.teamIds)) errs.push(`${at} ${g.name} lists "${d}" twice.`)
        for (const id of g.teamIds) if (!inTournament.has(id)) errs.push(`${at} ${g.name} has "${id}", which isn't in the tournament's teams.`)
        for (const d of dupes(g.buckets.map((b) => b.id))) errs.push(`${at} ${g.name} bucket id "${d}" is used twice.`)
        const slots = g.buckets.reduce((n, b) => n + b.slots, 0)
        if (slots !== g.teamIds.length) errs.push(`${at} ${g.name} has ${g.teamIds.length} teams but ${slots} slots.`)
      }
    } else if (p.kind === 'bracket') {
      const rounds = new Set(p.rounds.map((r) => r.id))
      for (const d of dupes(p.rounds.map((r) => r.id))) errs.push(`${at} round id "${d}" is used twice.`)
      for (const d of dupes(p.matches.map((m) => m.id))) errs.push(`${at} match id "${d}" is used twice.`)
      const seen = new Set<ID>()
      const fed = new Map<string, ID>() // "ub1:winner" -> match it feeds
      for (const m of p.matches) {
        if (!rounds.has(m.roundId)) errs.push(`${at} ${m.id} is in unknown round "${m.roundId}".`)
        if (!(m.bestOf > 0)) errs.push(`${at} ${m.id} needs bestOf ≥ 1.`)
        for (const s of [m.a, m.b] as Slot[]) {
          if ('from' in s) {
            if (!seen.has(s.from)) errs.push(`${at} ${m.id} takes from "${s.from}", which must be listed before it.`)
            const key = `${s.from}:${s.take}`
            if (fed.has(key)) errs.push(`${at} the ${s.take} of ${s.from} feeds both ${fed.get(key)} and ${m.id}.`)
            fed.set(key, m.id)
          } else if ('teamId' in s && s.teamId && !inTournament.has(s.teamId)) {
            errs.push(`${at} ${m.id} has "${s.teamId}", which isn't in the tournament's teams.`)
          }
        }
        seen.add(m.id)
      }
    } else {
      errs.push(`${at} unknown kind "${(p as { kind: string }).kind}".`)
    }
  }
  return errs
}
