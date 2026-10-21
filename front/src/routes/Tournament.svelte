<script lang="ts">
  import { api, type ID, type Phase, type PhasePicks, type Tournament, type TournamentPicks, type User } from '../lib/api'
  import { countdown, dateRange, dateTime } from '../lib/format'
  import { bracketComplete, hasResults, groupComplete, normalizeGroupPicks, pruneBracket } from '../lib/picks'
  import { href } from '../lib/router.svelte'
  import Bracket from '../components/Bracket.svelte'
  import GroupStage from '../components/GroupStage.svelte'
  import Leaderboard from '../components/Leaderboard.svelte'

  let { id, tab, me }: { id: ID; tab?: string; me: User | null } = $props()

  let t = $state<Tournament | null>(null)
  let server = $state<TournamentPicks | null>(null)
  let drafts = $state<Record<ID, PhasePicks>>({})
  let error = $state('')
  let saving = $state(false)
  let saveMsg = $state('')
  let now = $state(Date.now())

  $effect(() => {
    const iv = setInterval(() => (now = Date.now()), 30_000)
    return () => clearInterval(iv)
  })

  function blank(p: Phase, existing?: PhasePicks): PhasePicks {
    if (p.kind === 'groups') return normalizeGroupPicks(p, existing?.kind === 'groups' ? existing : undefined)
    return pruneBracket(p, existing?.kind === 'bracket' ? existing : { kind: 'bracket', winners: {} })
  }

  async function load(tid: ID) {
    t = null
    error = ''
    try {
      const [tour, picks] = await Promise.all([api.tournament(tid), api.picks(tid)])
      t = tour
      server = picks
      drafts = Object.fromEntries(tour.phases.map((p) => [p.id, blank(p, picks.phases[p.id])]))
    } catch (e) {
      error = (e as Error).message
    }
  }

  $effect(() => {
    load(id)
  })

  const teams = $derived(new Map((t?.teams ?? []).map((x) => [x.id, x])))
  const defaultTab = $derived(t ? (t.phases.find((p) => p.status === 'open') ?? t.phases[0])?.id : undefined)
  const active = $derived(tab ?? defaultTab)
  const phase = $derived(t?.phases.find((p) => p.id === active))

  const savedJSON = (p: Phase) => JSON.stringify(blank(p, server?.phases[p.id]))
  const isDirty = (p: Phase) => !!drafts[p.id] && JSON.stringify(drafts[p.id]) !== savedJSON(p)
  const anyDirty = $derived(!!t && t.phases.some((p) => p.status === 'open' && isDirty(p)))

  const complete = $derived.by(() => {
    if (!phase) return false
    const d = drafts[phase.id]
    if (phase.kind === 'groups' && d?.kind === 'groups') return groupComplete(phase, d)
    if (phase.kind === 'bracket' && d?.kind === 'bracket') return bracketComplete(phase, d)
    return false
  })

  async function save() {
    if (!t || !phase) return
    saving = true
    saveMsg = ''
    try {
      const saved = await api.savePicks(t.id, phase.id, $state.snapshot(drafts[phase.id]))
      server!.phases[phase.id] = saved
      saveMsg = 'Saved'
      setTimeout(() => (saveMsg = ''), 2000)
    } catch (e) {
      saveMsg = (e as Error).message
    }
    saving = false
  }

  function discard() {
    if (phase) drafts[phase.id] = blank(phase, server?.phases[phase.id])
  }

  function clearAll() {
    if (phase) drafts[phase.id] = blank(phase)
  }

  function beforeUnload(e: BeforeUnloadEvent) {
    if (anyDirty) e.preventDefault()
  }

  const statusText = (p: Phase) => {
    if (p.status === 'open' && p.locksAt) return `Locks in ${countdown(p.locksAt, now)}`
    if (p.status === 'upcoming' && p.opensAt) return `Opens ${dateTime(p.opensAt)}`
    if (p.status === 'locked') return 'Picks locked'
    if (p.status === 'completed') return 'Final'
    return ''
  }
</script>

<svelte:window onbeforeunload={beforeUnload} />

{#if error}
  <div class="wrap pad"><p>Couldn't load this tournament: {error}</p><a class="btn" href={href()}>Back</a></div>
{:else if !t}
  <div class="wrap pad muted">Loading…</div>
{:else}
  <header class="wrap top">
    <a class="eyebrow back" href={href()}>← All tournaments</a>
    <h1>{t.name}</h1>
    <p class="muted sub">
      {#if t.subtitle}{t.subtitle}{' · '}{/if}<span class="mono">{dateRange(t.startsAt, t.endsAt)}</span>
    </p>
  </header>

  <nav class="tabs-wrap">
    <div class="wrap tabs">
      {#each t.phases as p, i (p.id)}
        <a class="tab" class:on={active === p.id} href={href('t', t.id, p.id)}>
          <span class="num mono">{String(i + 1).padStart(2, '0')}</span>
          {p.name}
          {#if p.status === 'open'}<span class="dot" class:dirty={isDirty(p)} title={isDirty(p) ? 'Unsaved changes' : 'Open'}></span>{/if}
        </a>
      {/each}
      <a class="tab" class:on={active === 'leaderboard'} href={href('t', t.id, 'leaderboard')}>Leaderboard</a>
    </div>
  </nav>

  <main class="wrap body">
    {#if active === 'leaderboard'}
      <Leaderboard tournament={t} meId={me?.id} />
    {:else if phase}
      {@const pts = server?.points?.[phase.id]}
      <div class="phead">
        <div>
          <div class="row">
            <h2>{phase.name}</h2>
            <span class="pill {phase.status}">{phase.status}</span>
          </div>
          <p class="muted meta">
            <span class="mono">{statusText(phase)}</span>
            {#if phase.scoring}<span class="sep">·</span>{phase.scoring}{/if}
          </p>
        </div>
        {#if hasResults(phase)}
          <div class="score">
            <span class="eyebrow">Your points</span>
            <b class="mono">{pts ?? 0}</b>
          </div>
        {:else if phase.status === 'open'}
          <button class="btn ghost" onclick={clearAll}>Clear</button>
        {/if}
      </div>

      {#if phase.status === 'upcoming'}
        <div class="notice">Picks open {phase.opensAt ? dateTime(phase.opensAt) : 'soon'}. Here's the format.</div>
      {:else if phase.status !== 'open' && !server?.phases[phase.id]}
        <div class="notice">You didn't make picks for this phase.</div>
      {/if}

      {#if phase.kind === 'groups' && drafts[phase.id]?.kind === 'groups'}
        <GroupStage {phase} {teams} bind:picks={drafts[phase.id] as any} editable={phase.status === 'open'} />
      {:else if phase.kind === 'bracket' && drafts[phase.id]?.kind === 'bracket'}
        <Bracket {phase} {teams} bind:picks={drafts[phase.id] as any} editable={phase.status === 'open'} />
      {/if}

      {#if phase.status === 'open'}
        <div class="savebar" class:show={isDirty(phase) || saving || !!saveMsg}>
          <div class="wrap inner">
            <span class="state">
              {#if saveMsg}{saveMsg}{:else if isDirty(phase)}Unsaved changes{#if !complete}<span class="muted"> · incomplete</span>{/if}{/if}
            </span>
            <span class="actions">
              <button class="btn ghost" onclick={discard} disabled={saving || !isDirty(phase)}>Discard</button>
              <button class="btn primary" onclick={save} disabled={saving || !isDirty(phase)}>{saving ? 'Saving…' : 'Save picks'}</button>
            </span>
          </div>
        </div>
      {/if}
    {/if}
  </main>
{/if}

<style>
  .pad {
    padding-block: 64px;
  }
  .top {
    padding-block: 40px 28px;
  }
  .back {
    display: inline-block;
    margin-bottom: 20px;
  }
  .back:hover {
    color: var(--ink);
  }
  h1 {
    font-size: clamp(30px, 5vw, 52px);
    letter-spacing: -0.035em;
  }
  .sub {
    margin: 10px 0 0;
  }

  .tabs-wrap {
    position: sticky;
    top: 0;
    z-index: 20;
    background: var(--bg);
    border-bottom: 1px solid var(--line);
  }
  .tabs {
    display: flex;
    gap: 28px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .tab {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 52px;
    white-space: nowrap;
    font-weight: 500;
    color: var(--muted);
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    transition: color 0.15s;
  }
  .tab:hover {
    color: var(--ink);
  }
  .tab.on {
    color: var(--ink);
    border-bottom-color: var(--ink);
  }
  .tab .num {
    font-size: 11px;
    color: var(--muted);
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
  }
  .dot.dirty {
    background: transparent;
    box-shadow: inset 0 0 0 1.5px var(--accent);
  }

  .body {
    padding-block: 32px 140px;
  }
  .phead {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 24px;
    margin-bottom: 28px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  h2 {
    font-size: 26px;
  }
  .meta {
    margin: 8px 0 0;
    font-size: 14px;
  }
  .sep {
    margin: 0 8px;
  }
  .score {
    text-align: right;
    display: flex;
    flex-direction: column;
  }
  .score b {
    font-size: 36px;
    font-weight: 500;
    line-height: 1;
    letter-spacing: -0.03em;
  }
  .notice {
    padding: 12px 14px;
    border-radius: var(--r);
    background: var(--line);
    color: var(--ink-2);
    font-size: 14px;
    margin-bottom: 24px;
  }

  .savebar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 30;
    background: var(--surface);
    border-top: 1px solid var(--line);
    padding-bottom: env(safe-area-inset-bottom);
    translate: 0 110%;
    transition: translate 0.25s ease;
  }
  .savebar:not(.show) {
    visibility: hidden;
    transition: translate 0.25s ease, visibility 0s 0.25s;
  }
  .savebar.show {
    translate: 0 0;
  }
  .inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    height: 64px;
  }
  .state {
    font-weight: 500;
    font-size: 14px;
  }
  .actions {
    display: flex;
    gap: 6px;
  }
  @media (max-width: 520px) {
    .phead {
      flex-wrap: wrap;
      gap: 12px;
    }
  }
</style>
