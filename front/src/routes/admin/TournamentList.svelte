<script lang="ts">
  import { api } from '../../lib/api'
  import { dateRange } from '../../lib/format'
  import { href } from '../../lib/router.svelte'

  const list = api.tournaments()
</script>

<div class="head">
  <h1>Tournaments</h1>
  <a class="btn primary" href={href('admin', 'new')}>New tournament</a>
</div>

{#await list}
  <p class="muted">Loading…</p>
{:then items}
  {#if !items.length}
    <p class="muted">No tournaments yet.</p>
  {/if}
  <ul>
    {#each items as t (t.id)}
      <li>
        <a class="main" href={href('admin', 't', t.id)}>
          <span class="name">{t.name}</span>
          <span class="mono muted small">{t.id} · {dateRange(t.startsAt, t.endsAt)} · {t.phaseCount} phases · {t.teamCount} teams</span>
        </a>
        <span class="pill {t.status}">{t.status}</span>
        <span class="actions">
          <a class="btn sm" href={href('admin', 't', t.id)}>Results</a>
          <a class="btn sm ghost" href={href('admin', 't', t.id, 'edit')}>Edit</a>
        </span>
      </li>
    {/each}
  </ul>
{:catch e}
  <p class="err">{e.message}</p>
{/await}

<style>
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    margin-bottom: 24px;
  }
  h1 {
    font-size: 30px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    border-top: 1px solid var(--ink);
  }
  li {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px 16px;
    padding: 16px 0;
    border-bottom: 1px solid var(--line);
  }
  .main {
    flex: 1 1 300px;
    display: grid;
    gap: 2px;
  }
  .name {
    font-size: 18px;
    font-weight: 500;
  }
  .main:hover .name {
    color: var(--accent);
  }
  .small {
    font-size: 12px;
  }
  .actions {
    display: flex;
    gap: 6px;
  }
</style>
