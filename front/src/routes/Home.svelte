<script lang="ts">
  import { api } from '../lib/api'
  import { dateRange } from '../lib/format'
  import { href } from '../lib/router.svelte'

  const list = api.tournaments()
</script>

<section class="hero wrap">
  <h1>Call every series<br /><span class="muted">before it's played.</span></h1>
  <p class="lead">Place teams on their group-stage records, pick who advances in the playoffs, and climb the leaderboard.</p>
</section>

<section class="wrap">
  <div class="eyebrow head">Tournaments</div>
  {#await list}
    <p class="muted">Loading…</p>
  {:then items}
    <ul>
      {#each items as t (t.id)}
        <li>
          <a href={href('t', t.id)}>
            <span class="name">{t.name}</span>
            <span class="meta">
              <span class="mono muted">{dateRange(t.startsAt, t.endsAt)}</span>
              <span class="pill {t.status}">{t.status}</span>
            </span>
            <span class="arrow" aria-hidden="true">→</span>
          </a>
        </li>
      {/each}
    </ul>
  {:catch e}
    <p class="muted">Couldn't load tournaments: {e.message}</p>
  {/await}
</section>

<style>
  .hero {
    padding-block: clamp(48px, 10vw, 120px) clamp(32px, 6vw, 72px);
  }
  h1 {
    font-size: clamp(36px, 7vw, 76px);
    font-weight: 600;
    letter-spacing: -0.04em;
    line-height: 0.98;
  }
  .lead {
    max-width: 520px;
    font-size: 17px;
    color: var(--ink-2);
    margin: 24px 0 0;
  }
  .head {
    padding-bottom: 12px;
    border-bottom: 1px solid var(--ink);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li a {
    display: grid;
    grid-template-columns: 1fr auto 32px;
    align-items: center;
    gap: 24px;
    padding: 24px 0;
    border-bottom: 1px solid var(--line);
    transition: padding 0.2s;
  }
  li a:hover {
    padding-left: 8px;
  }
  li a:hover .arrow {
    color: var(--accent);
    translate: 4px 0;
  }
  .name {
    font-size: clamp(20px, 3vw, 30px);
    font-weight: 500;
    letter-spacing: -0.02em;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 16px;
    font-size: 13px;
  }
  .arrow {
    font-size: 22px;
    text-align: right;
    transition: translate 0.2s, color 0.2s;
  }
  @media (max-width: 640px) {
    li a {
      grid-template-columns: 1fr 24px;
      gap: 8px;
    }
    .meta {
      grid-row: 2;
    }
    .arrow {
      grid-row: 1 / 3;
      grid-column: 2;
    }
  }
</style>
