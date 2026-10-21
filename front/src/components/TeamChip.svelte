<script lang="ts">
  import type { Team } from '../lib/api'

  let { team, full = false }: { team: Team; full?: boolean } = $props()
  const mono = $derived(team.tag.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase())
</script>

<span class="chip" title={team.name}>
  {#if team.logo}
    <img class="logo" src={team.logo} alt="" />
  {:else}
    <span class="logo" style:background={team.color ?? 'var(--ink)'}>{mono}</span>
  {/if}
  <span class="name">{full ? team.name : team.tag}</span>
</span>

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .logo {
    flex: none;
    width: 24px;
    height: 24px;
    border-radius: 5px;
    display: grid;
    place-items: center;
    font: 600 10px/1 var(--mono);
    color: #fff;
    object-fit: cover;
  }
  .name {
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
