<script lang="ts">
  import type { User } from '../../lib/api'
  import { href, route } from '../../lib/router.svelte'
  import Console from './Console.svelte'
  import Editor from './Editor.svelte'
  import Teams from './Teams.svelte'
  import TournamentList from './TournamentList.svelte'

  let { me }: { me: User | null } = $props()

  // #/admin · #/admin/teams · #/admin/new · #/admin/t/:id[/:phase|edit]
  const p = $derived(route.parts)
  const section = $derived(p[1] === 'teams' ? 'teams' : 'tournaments')
</script>

{#if !me?.admin}
  <div class="wrap pad">
    <h1>Admins only</h1>
    <p class="muted">Sign in with an admin account to manage tournaments.</p>
  </div>
{:else}
  <div class="sub">
    <div class="wrap inner">
      <span class="eyebrow">Admin</span>
      <a class:on={section === 'tournaments'} href={href('admin')}>Tournaments</a>
      <a class:on={section === 'teams'} href={href('admin', 'teams')}>Teams</a>
    </div>
  </div>
  <div class="wrap body">
    {#if p[1] === 'teams'}
      <Teams />
    {:else if p[1] === 'new'}
      <Editor />
    {:else if p[1] === 't' && p[2]}
      {#key p[2]}
        {#if p[3] === 'edit'}
          <Editor id={p[2]} />
        {:else}
          <Console id={p[2]} tab={p[3]} />
        {/if}
      {/key}
    {:else}
      <TournamentList />
    {/if}
  </div>
{/if}

<style>
  .pad {
    padding-block: 64px;
  }
  .sub {
    border-bottom: 1px solid var(--line);
    background: var(--surface);
  }
  .inner {
    display: flex;
    align-items: center;
    gap: 24px;
    height: 48px;
    font-size: 14px;
  }
  .inner a {
    color: var(--muted);
    font-weight: 500;
  }
  .inner a:hover,
  .inner a.on {
    color: var(--ink);
  }
  .body {
    padding-block: 32px 140px;
  }
</style>
