<script lang="ts">
  import { hasResults } from '../lib/picks'
  import { api, type ID, type Leaderboard, type Tournament } from '../lib/api'

  let { tournament, meId }: { tournament: Tournament; meId?: ID } = $props()

  const PAGE = 50
  let phase = $state('')
  let board = $state<Leaderboard | null>(null)
  let error = $state('')
  let loadingMore = $state(false)

  const scored = $derived(tournament.phases.filter((p) => hasResults(p)))

  $effect(() => {
    const p = phase
    board = null
    error = ''
    api
      .leaderboard(tournament.id, { phase: p || undefined, limit: PAGE })
      .then((b) => p === phase && (board = b))
      .catch((e) => (error = e.message))
  })

  async function more() {
    if (!board) return
    loadingMore = true
    try {
      const next = await api.leaderboard(tournament.id, { phase: phase || undefined, offset: board.entries.length, limit: PAGE })
      board.entries.push(...next.entries)
    } catch (e) {
      error = (e as Error).message
    }
    loadingMore = false
  }

  const meVisible = $derived(!!board?.me && board.entries.some((e) => e.user.id === board!.me!.user.id))
</script>

<div class="filters">
  <button class="f" class:on={phase === ''} onclick={() => (phase = '')}>Overall</button>
  {#each scored as p (p.id)}
    <button class="f" class:on={phase === p.id} onclick={() => (phase = p.id)}>{p.name}</button>
  {/each}
</div>

{#if error}
  <p class="muted">Couldn't load the leaderboard: {error}</p>
{:else if !board}
  <p class="muted">Loading…</p>
{:else if !board.entries.length}
  <p class="muted">No points awarded yet. Check back after the first phase finishes.</p>
{:else}
  {#snippet row(e: Leaderboard['entries'][number])}
    <tr class:me={e.user.id === meId}>
      <td class="rank mono">{e.rank}</td>
      <td class="user">
        {#if e.user.avatar}<img src={e.user.avatar} alt="" />{/if}
        {e.user.name}{#if e.user.id === meId}<span class="you">you</span>{/if}
      </td>
      {#if !phase}
        {#each scored as p (p.id)}
          <td class="num mono hide-sm">{e.phases?.[p.id] ?? '—'}</td>
        {/each}
      {/if}
      <td class="num mono pts">{e.points}</td>
    </tr>
  {/snippet}

  {#if board.me}
    <div class="mine">
      <div><span class="eyebrow">Your rank</span><b class="mono">#{board.me.rank}</b><span class="muted">of {board.total}</span></div>
      <div><span class="eyebrow">Points</span><b class="mono">{board.me.points}</b></div>
    </div>
  {/if}

  <table>
    <thead>
      <tr>
        <th class="rank">#</th>
        <th>Player</th>
        {#if !phase}
          {#each scored as p (p.id)}<th class="num hide-sm">{p.name}</th>{/each}
        {/if}
        <th class="num">Points</th>
      </tr>
    </thead>
    <tbody>
      {#each board.entries as e (e.user.id)}
        {@render row(e)}
      {/each}
      {#if board.me && !meVisible}
        <tr class="gap"><td colspan="99">···</td></tr>
        {@render row(board.me)}
      {/if}
    </tbody>
  </table>

  {#if board.entries.length < board.total}
    <div class="more">
      <button class="btn" onclick={more} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Show more'}</button>
    </div>
  {/if}
{/if}

<style>
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 24px;
  }
  .f {
    height: 32px;
    padding: 0 14px;
    border-radius: 999px;
    border: 1px solid var(--line-2);
    font-size: 13px;
  }
  .f.on {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--bg);
  }
  .mine {
    display: flex;
    flex-wrap: wrap;
    gap: 32px;
    padding: 18px 0;
    border-top: 1px solid var(--ink);
    margin-bottom: 8px;
  }
  .mine div {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }
  .mine b {
    font-size: 28px;
    font-weight: 500;
    letter-spacing: -0.02em;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th {
    text-align: left;
    font: 400 11px var(--mono);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    padding: 10px 8px;
    border-bottom: 1px solid var(--line);
  }
  td {
    padding: 12px 8px;
    border-bottom: 1px solid var(--line);
  }
  .rank {
    width: 56px;
    color: var(--muted);
  }
  .num {
    text-align: right;
    width: 1%;
    white-space: nowrap;
  }
  .pts {
    font-weight: 500;
  }
  .user {
    font-weight: 500;
    overflow-wrap: anywhere;
  }
  .user img {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    vertical-align: middle;
    margin-right: 8px;
  }
  .you {
    margin-left: 8px;
    font: 500 10px var(--mono);
    text-transform: uppercase;
    color: var(--accent);
  }
  tr.me td {
    background: var(--accent-soft);
  }
  tr.me .rank {
    color: var(--accent);
  }
  .gap td {
    text-align: center;
    color: var(--muted);
    padding: 4px;
  }
  .more {
    display: flex;
    justify-content: center;
    margin-top: 24px;
  }
  @media (max-width: 640px) {
    .hide-sm {
      display: none;
    }
  }
</style>
