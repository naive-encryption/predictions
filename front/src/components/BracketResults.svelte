<script lang="ts">
  // Admin: enter actual winners/scores and fill TBD seeds for a bracket phase.
  import type { BracketPhase, ID, Match, Results, Seeds, Slot, Team } from '../lib/api'
  import { pruneBracket, resolveSlot } from '../lib/picks'
  import TeamChip from './TeamChip.svelte'

  let {
    phase,
    teams,
    results = $bindable(),
    seeds = $bindable(),
  }: { phase: BracketPhase; teams: Team[]; results: Results; seeds: Seeds } = $props()

  const teamMap = $derived(new Map(teams.map((t) => [t.id, t])))

  // The phase as it would look with the draft seeds applied.
  const seeded = $derived.by(() => {
    const p: BracketPhase = JSON.parse(JSON.stringify(phase))
    for (const m of p.matches)
      for (const side of ['a', 'b'] as const) {
        const s = m[side]
        if ('tbd' in s) {
          const t = seeds[m.id]?.[side]
          if (t) s.teamId = t
          else delete s.teamId
        }
      }
    return p
  })
  const byId = $derived(new Map(seeded.matches.map((m) => [m.id, m])))
  const winners = $derived(Object.fromEntries(Object.entries(results).map(([k, r]) => [k, r.winner])))
  const rounds = $derived(phase.rounds.map((r) => ({ ...r, matches: seeded.matches.filter((m) => m.roundId === r.id) })))
  const seededIds = $derived(new Set(Object.values(seeds).flatMap((s) => [s.a, s.b]).filter(Boolean)))

  function setWinner(m: Match, team: ID | null) {
    if (!team) return
    const next: Results = { ...results }
    if (next[m.id]?.winner === team) delete next[m.id]
    else next[m.id] = { ...next[m.id], winner: team }
    prune(next)
  }

  // Drop results that no longer fit after an upstream change.
  function prune(next: Results) {
    const kept = pruneBracket(seeded, { kind: 'bracket', winners: Object.fromEntries(Object.entries(next).map(([k, r]) => [k, r.winner])) })
    results = Object.fromEntries(Object.entries(next).filter(([k]) => kept.winners[k]))
  }

  function setScore(m: Match, score: string) {
    if (results[m.id]) results[m.id] = { ...results[m.id], score: score || undefined }
  }

  function setSeed(m: Match, side: 'a' | 'b', team: string) {
    const cur = { ...seeds[m.id] }
    if (team) cur[side] = team
    else delete cur[side]
    seeds = { ...seeds, [m.id]: cur }
    queueMicrotask(() => prune({ ...results }))
  }

  function label(s: Slot) {
    if ('tbd' in s) return s.label ?? 'TBD'
    if ('from' in s) return `${s.take === 'winner' ? 'Winner' : 'Loser'} ${byId.get(s.from)?.label ?? s.from}`
    return 'TBD'
  }
</script>

{#each rounds as r (r.id)}
  <section class="round">
    <h3 class="eyebrow">{r.section} · {r.name}</h3>
    {#each r.matches as m (m.id)}
      {@const orig = phase.matches.find((x) => x.id === m.id)!}
      {@const ready = !!resolveSlot(m.a, winners, byId) && !!resolveSlot(m.b, winners, byId)}
      <div class="match" class:done={!!results[m.id]}>
        <span class="mono label">{m.label ?? m.id} <span class="muted">Bo{m.bestOf}</span></span>
        {#each ['a', 'b'] as const as side (side)}
          {@const team = resolveSlot(m[side], winners, byId)}
          {@const isTbd = 'tbd' in orig[side]}
          <div class="side">
            {#if isTbd}
              <select class="input seed" value={seeds[m.id]?.[side] ?? ''} onchange={(e) => setSeed(m, side, e.currentTarget.value)}>
                <option value="">{label(orig[side])}</option>
                {#each teams as t (t.id)}
                  <option value={t.id} disabled={seededIds.has(t.id) && seeds[m.id]?.[side] !== t.id}>{t.name}</option>
                {/each}
              </select>
            {/if}
            <button class="pick" class:win={!!team && results[m.id]?.winner === team} disabled={!team || !ready} title={ready ? '' : 'Both teams must be known'} onclick={() => setWinner(m, team)}>
              {#if team}<TeamChip team={teamMap.get(team) ?? { id: team, name: team, tag: team }} />{:else}<span class="muted">{label(m[side])}</span>{/if}
            </button>
          </div>
          {#if side === 'a'}<span class="vs muted">vs</span>{/if}
        {/each}
        <input
          class="input mono score"
          placeholder={results[m.id] ? 'Score' : ''}
          value={results[m.id]?.score ?? ''}
          disabled={!results[m.id]}
          onchange={(e) => setScore(m, e.currentTarget.value)}
          aria-label="Score"
        />
      </div>
    {/each}
  </section>
{/each}

<style>
  .round + .round {
    margin-top: 24px;
  }
  h3 {
    margin-bottom: 8px;
  }
  .match {
    display: grid;
    grid-template-columns: 90px 1fr 24px 1fr 80px;
    align-items: center;
    gap: 8px;
    padding: 8px 0;
    border-bottom: 1px solid var(--line);
  }
  @media (max-width: 640px) {
    .match {
      grid-template-columns: 1fr 1fr;
    }
    .label {
      grid-column: 1 / -1;
    }
    .vs {
      display: none;
    }
  }
  .label {
    font-size: 13px;
  }
  .side {
    display: grid;
    gap: 4px;
    min-width: 0;
  }
  .seed {
    height: 30px;
    font-size: 13px;
  }
  .pick {
    display: flex;
    align-items: center;
    height: 40px;
    padding: 0 10px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--surface);
    text-align: left;
    font-size: 14px;
    min-width: 0;
  }
  .pick:not(:disabled):hover {
    border-color: var(--ink);
  }
  .pick:disabled {
    cursor: default;
    background: var(--bg);
  }
  .pick.win {
    background: var(--good);
    border-color: var(--good);
    color: #fff;
  }
  .vs {
    text-align: center;
    font-size: 12px;
  }
  .score {
    height: 40px;
  }
</style>
