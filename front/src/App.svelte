<script lang="ts">
  import { api, usingMock, type User } from './lib/api'
  import { href, route } from './lib/router.svelte'
  import Admin from './routes/admin/Admin.svelte'
  import Home from './routes/Home.svelte'
  import Tournament from './routes/Tournament.svelte'

  let me = $state<User | null>(null)
  api.me().then((u) => (me = u)).catch(() => (me = null))
</script>

<div class="bar">
  <div class="wrap inner">
    <a class="logo" href={href()}>pick<span>’</span>em</a>
    <div class="right">
      {#if me?.admin}<a class="nav" class:on={route.parts[0] === 'admin'} href={href('admin')}>Admin</a>{/if}
      {#if me}
        <span class="user">{me.name}</span>
      {:else}
        <a class="btn" href={api.loginUrl()}>Sign in</a>
      {/if}
    </div>
  </div>
</div>

{#if route.parts[0] === 'admin'}
  <Admin {me} />
{:else if route.parts[0] === 't' && route.parts[1]}
  {#key route.parts[1]}
    <Tournament id={route.parts[1]} tab={route.parts[2]} {me} />
  {/key}
{:else}
  <Home />
{/if}

<footer class="wrap">
  <span class="eyebrow">pick’em</span>
  {#if usingMock}<span class="eyebrow">mock api · picks stored in this browser</span>{/if}
</footer>

<style>
  .bar {
    border-bottom: 1px solid var(--line);
  }
  .inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 60px;
  }
  .logo {
    font-weight: 700;
    font-size: 19px;
    letter-spacing: -0.04em;
  }
  .logo span {
    color: var(--accent);
  }
  .right {
    display: flex;
    align-items: center;
    gap: 20px;
  }
  .nav {
    font-size: 14px;
    font-weight: 500;
    color: var(--muted);
  }
  .nav:hover,
  .nav.on {
    color: var(--ink);
  }
  .user {
    font-size: 14px;
    font-weight: 500;
  }
  footer {
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    padding-block: 40px;
    margin-top: 40px;
    border-top: 1px solid var(--line);
  }
</style>
