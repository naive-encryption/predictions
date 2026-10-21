<script lang="ts">
  import type { GroupPhase, GroupPicks, ID, Team } from '../lib/api'
  import { draggable, dropZone } from '../lib/drag'
  import { placeTeam, placedTeams, removeTeam } from '../lib/picks'
  import TeamChip from './TeamChip.svelte'

  let {
    phase,
    teams,
    picks = $bindable(),
    editable,
  }: { phase: GroupPhase; teams: Map<ID, Team>; picks: GroupPicks; editable: boolean } = $props()

  type Payload = { groupId: ID; team: ID }
  let selected = $state<Payload | null>(null)

  const isSel = (groupId: ID, team: ID | null) => !!team && selected?.groupId === groupId && selected.team === team

  function select(groupId: ID, team: ID) {
    selected = isSel(groupId, team) ? null : { groupId, team }
  }

  function drop(groupId: ID, bucketId: ID, slot: number | undefined, p: unknown) {
    const { groupId: g, team } = p as Payload
    if (g !== groupId) return
    picks = placeTeam(picks, groupId, team, bucketId, slot)
    selected = null
  }

  function toPool(groupId: ID, p: unknown) {
    const { groupId: g, team } = p as Payload
    if (g !== groupId) return
    picks = removeTeam(picks, groupId, team)
    selected = null
  }

  function slotClick(groupId: ID, bucketId: ID, i: number) {
    if (!editable) return
    const occupant = picks.groups[groupId][bucketId][i]
    if (selected && selected.groupId === groupId && selected.team !== occupant) drop(groupId, bucketId, i, selected)
    else if (occupant) select(groupId, occupant)
  }

  function resultFor(groupId: ID, bucketId: ID, team: ID | null): 'good' | 'bad' | null {
    const actual = phase.standings?.[groupId]?.[bucketId]
    if (!actual || !team) return null
    return actual.includes(team) ? 'good' : 'bad'
  }

  const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (selected = null)
</script>

<svelte:window onkeydown={onKey} />

{#each phase.groups as g (g.id)}
  {@const placed = placedTeams(picks, g.id)}
  {@const pool = g.teamIds.filter((t) => !placed.has(t))}
  <section class="group">
    {#if phase.groups.length > 1}
      <h2 class="gname">{g.name}</h2>
    {/if}

    <div class="layout">
      <aside class="pool" class:drop={editable} use:dropZone={(p) => toPool(g.id, p)}>
        <div class="pool-head">
          <span class="eyebrow">Teams</span>
          <span class="eyebrow">{placed.size}/{g.teamIds.length} placed</span>
        </div>
        {#if pool.length}
          <div class="pool-list">
            {#each pool as id (id)}
              <button
                class="card"
                class:sel={isSel(g.id, id)}
                disabled={!editable}
                use:draggable={{ payload: { groupId: g.id, team: id }, disabled: !editable }}
                onclick={() => select(g.id, id)}
              >
                <TeamChip team={teams.get(id)!} />
              </button>
            {/each}
          </div>
        {:else}
          <p class="done muted">All teams placed.</p>
        {/if}
        {#if editable && selected?.groupId === g.id && placed.has(selected.team)}
          <button class="btn ghost back" onclick={() => toPool(g.id, selected)}>Return to pool</button>
        {/if}
        {#if editable}
          <p class="tip muted">Drag teams onto a record, or tap a team then tap a slot.</p>
        {/if}
      </aside>

      <div class="buckets">
        {#each g.buckets as b (b.id)}
          {@const slots = picks.groups[g.id][b.id]}
          {@const actual = phase.standings?.[g.id]?.[b.id]}
          <div class="bucket tone-{b.tone ?? 'neutral'}" use:dropZone={(p) => drop(g.id, b.id, undefined, p)}>
            <div class="blabel">
              <span class="rec">{b.label}</span>
              {#if b.hint}<span class="hint">{b.hint}</span>{/if}
            </div>
            <div class="slots">
              {#each slots as team, i (i)}
                {@const res = resultFor(g.id, b.id, team)}
                <button
                  class="slot"
                  class:filled={!!team}
                  class:sel={isSel(g.id, team)}
                  class:target={!!selected && selected.groupId === g.id && !isSel(g.id, team)}
                  class:good={res === 'good'}
                  class:bad={res === 'bad'}
                  disabled={!editable && !team}
                  use:dropZone={(p) => drop(g.id, b.id, i, p)}
                  use:draggable={{ payload: { groupId: g.id, team }, disabled: !editable || !team }}
                  onclick={() => slotClick(g.id, b.id, i)}
                >
                  {#if team}
                    <TeamChip team={teams.get(team)!} />
                    {#if res}<span class="mark mono">{res === 'good' ? '✓' : '✕'}</span>{/if}
                  {:else}
                    <span class="empty">{editable ? 'Drop team' : '—'}</span>
                  {/if}
                </button>
              {/each}
            </div>
            {#if actual}
              <div class="actual">
                <span class="eyebrow">Result</span>
                {actual.map((t) => teams.get(t)?.tag ?? t).join(', ')}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  </section>
{/each}

<style>
  .group + .group {
    margin-top: 48px;
  }
  .gname {
    font-size: 20px;
    margin-bottom: 16px;
  }
  .layout {
    display: grid;
    grid-template-columns: 260px 1fr;
    gap: 24px;
    align-items: start;
  }
  @media (max-width: 820px) {
    .layout {
      grid-template-columns: 1fr;
    }
  }

  .pool {
    position: sticky;
    top: 76px;
    border: 1px dashed var(--line-2);
    border-radius: var(--r);
    padding: 14px;
    transition: border-color 0.15s, background 0.15s;
  }
  @media (max-width: 820px) {
    .pool {
      position: static;
    }
  }
  .pool:global(.drop-hover) {
    border-color: var(--ink);
    background: var(--surface);
  }
  .pool-head {
    display: flex;
    justify-content: space-between;
    margin-bottom: 10px;
  }
  .pool-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
    gap: 6px;
  }
  .card {
    display: flex;
    align-items: center;
    height: 40px;
    padding: 0 10px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 6px;
    cursor: grab;
    touch-action: manipulation;
    transition: border-color 0.12s, transform 0.12s;
    min-width: 0;
  }
  .card:hover {
    border-color: var(--line-2);
  }
  .card:disabled {
    cursor: default;
  }
  .card.sel,
  .slot.sel {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }
  .done {
    margin: 4px 0;
    font-size: 14px;
  }
  .back {
    margin-top: 10px;
    width: 100%;
    justify-content: center;
  }
  .tip {
    font-size: 12px;
    margin: 12px 0 0;
  }

  .buckets {
    display: grid;
    gap: 8px;
  }
  .bucket {
    display: grid;
    grid-template-columns: 120px 1fr;
    gap: 12px;
    align-items: center;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--r);
    padding: 12px;
    transition: border-color 0.15s;
  }
  .bucket:global(.drop-hover) {
    border-color: var(--ink);
  }
  @media (max-width: 520px) {
    .bucket {
      grid-template-columns: 1fr;
      gap: 8px;
    }
  }
  .blabel {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-left: 10px;
    border-left: 3px solid var(--line-2);
  }
  .tone-advance .blabel {
    border-left-color: var(--good);
  }
  .tone-eliminate .blabel {
    border-left-color: var(--bad);
  }
  .rec {
    font: 600 22px/1 var(--mono);
    letter-spacing: -0.02em;
  }
  .hint {
    font-size: 12px;
    color: var(--muted);
  }
  @media (max-width: 520px) {
    .blabel {
      flex-direction: row;
      align-items: baseline;
      gap: 10px;
    }
  }

  .slots {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 6px;
  }
  .slot {
    position: relative;
    display: flex;
    align-items: center;
    height: 44px;
    padding: 0 10px;
    border-radius: 6px;
    border: 1px dashed var(--line-2);
    background: var(--bg);
    text-align: left;
    min-width: 0;
    transition: border-color 0.12s, background 0.12s;
    touch-action: manipulation;
  }
  .slot.filled {
    border-style: solid;
    border-color: var(--line);
    background: var(--surface);
    cursor: grab;
  }
  .slot:disabled {
    cursor: default;
  }
  .slot.target:not(.filled) {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .slot:global(.drop-hover) {
    border-color: var(--ink) !important;
    border-style: solid;
    background: var(--surface);
  }
  .slot.good {
    border-color: var(--good);
    background: var(--good-soft);
  }
  .slot.bad {
    border-color: var(--bad-soft);
  }
  .slot.bad :global(.name) {
    color: var(--muted);
    text-decoration: line-through;
  }
  .mark {
    margin-left: auto;
    font-size: 13px;
    padding-left: 6px;
  }
  .good .mark {
    color: var(--good);
  }
  .bad .mark {
    color: var(--bad);
  }
  .empty {
    font-size: 13px;
    color: var(--muted);
  }
  .actual {
    grid-column: 2;
    font-size: 13px;
    color: var(--ink-2);
    display: flex;
    gap: 8px;
    align-items: baseline;
  }
  @media (max-width: 520px) {
    .actual {
      grid-column: 1;
    }
  }
</style>
