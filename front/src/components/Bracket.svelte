<script lang="ts">
  import type { BracketPhase, BracketPicks, ID, Match, Slot, Team } from '../lib/api'
  import { gradeMatch, pruneBracket, resolveSlot } from '../lib/picks'
  import TeamChip from './TeamChip.svelte'

  let {
    phase,
    teams,
    picks = $bindable(),
    editable,
  }: { phase: BracketPhase; teams: Map<ID, Team>; picks: BracketPicks; editable: boolean } = $props()

  const byId = $derived(new Map(phase.matches.map((m) => [m.id, m])))

  const sections = $derived.by(() => {
    const out: { name: string; rounds: { id: ID; name: string; matches: Match[] }[] }[] = []
    for (const r of phase.rounds) {
      let s = out.find((s) => s.name === r.section)
      if (!s) out.push((s = { name: r.section, rounds: [] }))
      s.rounds.push({ id: r.id, name: r.name, matches: phase.matches.filter((m) => m.roundId === r.id) })
    }
    return out
  })

  // The match whose winner feeds nothing else is the final.
  const final = $derived.by(() => {
    const fed = new Set(phase.matches.flatMap((m) => [m.a, m.b]).filter((s) => 'from' in s && s.take === 'winner').map((s) => (s as { from: ID }).from))
    const roots = phase.matches.filter((m) => !fed.has(m.id))
    return roots.length === 1 ? roots[0] : null
  })
  const champion = $derived(final ? picks.winners[final.id] : undefined)

  function placeholder(s: Slot) {
    if ('tbd' in s) return s.label ?? 'TBD'
    if ('from' in s) return `${s.take === 'winner' ? 'Winner' : 'Loser'} ${byId.get(s.from)?.label ?? s.from}`
    return 'TBD'
  }

  function pick(m: Match, team: ID | null) {
    if (!editable || !team) return
    const winners = { ...picks.winners }
    if (winners[m.id] === team) delete winners[m.id]
    else winners[m.id] = team
    picks = pruneBracket(phase, { kind: 'bracket', winners })
  }
</script>

{#if champion}
  <div class="champ">
    <span class="eyebrow">Your champion</span>
    <TeamChip team={teams.get(champion)!} full />
  </div>
{/if}

{#each sections as s (s.name)}
  <section class="section">
    {#if sections.length > 1}<h2 class="eyebrow sname">{s.name}</h2>{/if}
    <div class="scroll">
      <div class="cols" style:--n={s.rounds.length}>
        {#each s.rounds as r (r.id)}
          <div class="col">
            <div class="rname">{r.name}</div>
            <div class="matches">
              {#each r.matches as m (m.id)}
                {@const sides = [m.a, m.b]}
                {@const result = phase.results?.[m.id]}
                {@const mine = picks.winners[m.id]}
                {@const graded = gradeMatch(phase, picks, m.id)}
                <div class="match" class:picked={!!mine}>
                  <div class="mhead mono">
                    <span>{m.label ?? ''}</span>
                    <span>{result ? `${teams.get(result.winner)?.tag ?? result.winner} won${result.score ? ` ${result.score}` : ''}` : `Bo${m.bestOf}`}</span>
                  </div>
                  {#each sides as side, i (i)}
                    {@const team = resolveSlot(side, picks.winners, byId)}
                    {@const win = !!team && mine === team}
                    {@const lose = !!team && !!mine && mine !== team}
                    <button
                      class="side"
                      class:win
                      class:lose
                      class:good={win && graded === 'good'}
                      class:bad={win && graded === 'bad'}
                      disabled={!editable || !team}
                      onclick={() => pick(m, team)}
                    >
                      {#if team}
                        <TeamChip team={teams.get(team)!} />
                      {:else}
                        <span class="ph">{placeholder(side)}</span>
                      {/if}
                      {#if win}<span class="tick mono">{graded === 'bad' ? '✕' : '✓'}</span>{/if}
                    </button>
                  {/each}
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>
  </section>
{/each}

{#if editable}
  <p class="tip muted">Tap the team you think wins each series. Winners move on automatically.</p>
{/if}

<style>
  .champ {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border: 1px solid var(--line);
    border-radius: var(--r);
    background: var(--surface);
    margin-bottom: 24px;
  }
  .section + .section {
    margin-top: 32px;
  }
  .sname {
    margin-bottom: 12px;
  }
  .scroll {
    overflow-x: auto;
    margin-inline: calc(-1 * var(--gutter));
    padding-inline: var(--gutter);
    scroll-snap-type: x proximity;
    scrollbar-width: thin;
  }
  .cols {
    display: grid;
    grid-template-columns: repeat(var(--n), minmax(210px, 280px));
    gap: 20px;
    min-width: min-content;
    padding-bottom: 8px;
  }
  .col {
    display: flex;
    flex-direction: column;
    scroll-snap-align: start;
  }
  .rname {
    font-size: 13px;
    font-weight: 500;
    color: var(--ink-2);
    padding-bottom: 10px;
    border-bottom: 1px solid var(--line);
    margin-bottom: 12px;
  }
  .matches {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: space-around;
    gap: 12px;
  }
  .match {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--r);
    overflow: hidden;
  }
  .mhead {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: var(--muted);
    padding: 6px 10px 4px;
  }
  .side {
    display: flex;
    align-items: center;
    width: 100%;
    height: 42px;
    padding: 0 10px;
    border-top: 1px solid var(--line);
    text-align: left;
    transition: background 0.12s, opacity 0.12s;
    position: relative;
  }
  .side:not(:disabled):hover {
    background: var(--bg);
  }
  .side:disabled {
    cursor: default;
  }
  .side.win {
    background: var(--ink);
    color: var(--bg);
  }
  .side.win:not(:disabled):hover {
    background: var(--ink);
    opacity: 0.9;
  }
  .side.lose {
    opacity: 0.4;
  }
  .side.good {
    background: var(--good);
    color: #fff;
  }
  .side.bad {
    background: var(--bad-soft);
    color: var(--ink);
  }
  .side.bad :global(.name) {
    text-decoration: line-through;
  }
  .ph {
    font-size: 13px;
    color: var(--muted);
  }
  .tick {
    margin-left: auto;
    font-size: 13px;
  }
  .tip {
    font-size: 13px;
    margin-top: 20px;
  }
</style>
