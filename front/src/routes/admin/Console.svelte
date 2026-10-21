<script lang="ts">
  import { untrack } from 'svelte'
  import {
    api, type ID, type Phase, type PhaseStatus, type Results, type Seeds, type Standings, type Tournament,
  } from '../../lib/api'
  import { fromLocalInput, toLocalInput } from '../../lib/format'
  import { normalizeGroupPicks } from '../../lib/picks'
  import { href } from '../../lib/router.svelte'
  import BracketResults from '../../components/BracketResults.svelte'
  import GroupStage from '../../components/GroupStage.svelte'
  import type { GroupPicks } from '../../lib/api'

  let { id, tab }: { id: ID; tab?: string } = $props()

  let t = $state<Tournament | null>(null)
  let error = $state('')
  let msg = $state<{ text: string; bad?: boolean } | null>(null)
  let busy = $state(false)

  // Drafts for the active phase, rebuilt whenever the phase or tournament changes.
  let settings = $state<{ status: PhaseStatus; opensAt: string; locksAt: string }>({ status: 'upcoming', opensAt: '', locksAt: '' })
  let standings = $state<GroupPicks>({ kind: 'groups', groups: {} })
  let results = $state<Results>({})
  let seeds = $state<Seeds>({})
  let baseline = $state('')
  let draftFor = $state<ID | null>(null) // phase the drafts belong to

  async function load() {
    try {
      t = await api.tournament(id)
    } catch (e) {
      error = (e as Error).message
    }
  }
  load()

  const phase = $derived(t ? (t.phases.find((p) => p.id === tab) ?? t.phases[0]) : undefined)
  const teamMap = $derived(new Map((t?.teams ?? []).map((x) => [x.id, x])))

  function reset(p: Phase) {
    settings = { status: p.status, opensAt: toLocalInput(p.opensAt), locksAt: toLocalInput(p.locksAt) }
    if (p.kind === 'groups') standings = normalizeGroupPicks(p, { kind: 'groups', groups: p.standings ?? {} })
    else {
      results = { ...(p.results ?? {}) }
      seeds = {}
      for (const m of p.matches)
        for (const side of ['a', 'b'] as const) {
          const s = m[side]
          if ('tbd' in s && s.teamId) seeds[m.id] = { ...seeds[m.id], [side]: s.teamId }
        }
    }
    baseline = snapshot()
    draftFor = p.id
  }

  const snapshot = () => JSON.stringify([settings, phase?.kind === 'groups' ? standings : [results, seeds]])

  // Only re-run when the phase itself changes, not when the drafts are edited.
  $effect(() => {
    const p = phase
    if (p) untrack(() => reset(p))
  })

  const dirty = $derived(!!phase && snapshot() !== baseline)

  function flash(text: string, bad = false) {
    msg = { text, bad }
    if (!bad) setTimeout(() => msg?.text === text && (msg = null), 2500)
  }

  async function run(fn: () => Promise<Tournament>, ok: string) {
    busy = true
    try {
      t = await fn()
      flash(ok)
    } catch (e) {
      flash((e as Error).message, true)
    }
    busy = false
  }

  async function save() {
    if (!t || !phase) return
    const tid = t.id
    const pid = phase.id
    const s = $state.snapshot(settings)
    const changedSettings = s.status !== phase.status || s.opensAt !== toLocalInput(phase.opensAt) || s.locksAt !== toLocalInput(phase.locksAt)
    await run(async () => {
      let out = t!
      if (changedSettings)
        out = await api.admin.patchPhase(tid, pid, {
          status: s.status,
          opensAt: s.opensAt ? fromLocalInput(s.opensAt) : null,
          locksAt: s.locksAt ? fromLocalInput(s.locksAt) : null,
        })
      if (phase.kind === 'groups') {
        const clean: Standings = {}
        for (const [g, buckets] of Object.entries($state.snapshot(standings).groups))
          clean[g] = Object.fromEntries(Object.entries(buckets).map(([b, ids]) => [b, ids.filter((x): x is ID => !!x)]))
        out = await api.admin.saveStandings(tid, pid, clean)
      } else {
        out = await api.admin.saveSeeds(tid, pid, $state.snapshot(seeds))
        out = await api.admin.saveResults(tid, pid, $state.snapshot(results))
      }
      return out
    }, 'Saved. Scores update from the new results.')
  }

  const STATUSES: PhaseStatus[] = ['upcoming', 'open', 'locked', 'completed']
</script>

{#if error}
  <p class="err">{error}</p>
{:else if !t}
  <p class="muted">Loading…</p>
{:else}
  <div class="head">
    <div>
      <a class="eyebrow back" href={href('admin')}>← Tournaments</a>
      <h1>{t.name}</h1>
    </div>
    <span class="row">
      <a class="btn sm ghost" href={href('t', t.id)}>Public page</a>
      <a class="btn sm" href={href('admin', 't', t.id, 'edit')}>Edit definition</a>
    </span>
  </div>

  {#if !t.phases.length}
    <p class="muted">This tournament has no phases. <a class="link" href={href('admin', 't', t.id, 'edit')}>Add some</a>.</p>
  {:else}
    <nav class="seg tabs">
      {#each t.phases as p (p.id)}
        <a class:on={phase?.id === p.id} href={href('admin', 't', t.id, p.id)}>{p.name}</a>
      {/each}
    </nav>
  {/if}

  {#if phase && draftFor === phase.id}
    <section class="panel">
      <h2>Status</h2>
      <div class="settings">
        <span class="seg">
          {#each STATUSES as s (s)}
            <button class:on={settings.status === s} onclick={() => (settings.status = s)}>{s}</button>
          {/each}
        </span>
        <label class="field"><span>Opens</span><input class="input" type="datetime-local" bind:value={settings.opensAt} /></label>
        <label class="field"><span>Locks</span><input class="input" type="datetime-local" bind:value={settings.locksAt} /></label>
      </div>
      <p class="muted small">Players can edit picks only while the phase is <b>open</b>. The server should also refuse picks after the lock time.</p>
    </section>

    <section class="results">
      {#if phase.kind === 'groups'}
        <h2>Final standings</h2>
        <p class="muted small">Place each team on its actual record. Partial standings are fine: save as groups finish.</p>
        <GroupStage phase={{ ...phase, standings: undefined }} teams={teamMap} bind:picks={standings} editable={true} />
      {:else}
        <h2>Results</h2>
        <p class="muted small">Fill TBD seeds, then click the winner of each series. Clicking the winner again clears it.</p>
        <BracketResults {phase} teams={t.teams} bind:results bind:seeds />
      {/if}
    </section>

    <div class="savebar">
      <div class="wrap inner">
        <span class="small">
          {#if msg}<span class:err={msg.bad} class:ok={!msg.bad}>{msg.text}</span>
          {:else if dirty}Unsaved changes{:else}<span class="muted">Up to date</span>{/if}
        </span>
        <span class="row">
          <button class="btn ghost" onclick={() => phase && reset(phase)} disabled={!dirty || busy}>Discard</button>
          <button class="btn primary" onclick={save} disabled={!dirty || busy}>{busy ? 'Saving…' : 'Save'}</button>
        </span>
      </div>
    </div>
  {/if}
{/if}

<style>
  .head {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    flex-wrap: wrap;
    gap: 16px;
    margin-bottom: 24px;
  }
  .back {
    display: inline-block;
    margin-bottom: 12px;
  }
  h1 {
    font-size: 30px;
  }
  h2 {
    font-size: 17px;
    margin-bottom: 12px;
  }
  .row {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .tabs {
    margin-bottom: 20px;
  }
  .tabs a {
    display: inline-flex;
    align-items: center;
    height: 30px;
    padding: 0 14px;
    border-radius: 999px;
    font-size: 13px;
    color: var(--ink-2);
  }
  .tabs a.on {
    background: var(--ink);
    color: var(--bg);
  }
  .settings {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 16px;
  }
  .settings .field {
    width: 220px;
  }
  .small {
    font-size: 13px;
  }
  .panel .small {
    margin: 14px 0 0;
  }
  .results {
    margin-top: 32px;
  }
  .results > .small {
    margin: -4px 0 20px;
  }
  .link {
    text-decoration: underline;
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
  }
  .inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 64px;
    flex-wrap: wrap;
  }
</style>
