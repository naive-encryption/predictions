<script lang="ts">
  import { api, type ID, type Phase, type Team, type TournamentInput } from '../../lib/api'
  import { fromLocalInput, slugify, toLocalInput } from '../../lib/format'
  import { normalizeGroupPicks } from '../../lib/picks'
  import { go, href } from '../../lib/router.svelte'
  import { PHASE_TEMPLATES, blankTournament } from '../../lib/templates'
  import { validateTournament } from '../../lib/validate'
  import Bracket from '../../components/Bracket.svelte'
  import GroupStage from '../../components/GroupStage.svelte'
  import TeamChip from '../../components/TeamChip.svelte'

  let { id }: { id?: ID } = $props()

  let def = $state<TournamentInput | null>(null)
  let teams = $state<Team[]>([])
  let loadError = $state('')
  let saveError = $state('')
  let saving = $state(false)
  let idTouched = $state(false)
  let jsonOpen = $state<Record<number, string>>({}) // phase index -> draft JSON
  let jsonError = $state<Record<number, string>>({})
  let fullJson = $state<string | null>(null)
  let fullJsonError = $state('')
  let preview = $state(0)
  let confirmDelete = $state(false)

  async function load() {
    try {
      teams = await api.teams()
      if (id) {
        const t = await api.tournament(id)
        const { teams: tt, ...rest } = t
        def = { ...rest, teamIds: tt.map((x) => x.id) }
        idTouched = true
      } else def = blankTournament()
    } catch (e) {
      loadError = (e as Error).message
    }
  }
  load()

  const teamMap = $derived(new Map(teams.map((t) => [t.id, t])))
  const errors = $derived(def ? validateTournament($state.snapshot(def) as TournamentInput, new Set(teams.map((t) => t.id))) : [])

  function onName() {
    if (def && !idTouched && !id) def.id = slugify(def.name)
  }

  function toggleTeam(tid: ID) {
    if (!def) return
    def.teamIds = def.teamIds.includes(tid) ? def.teamIds.filter((x) => x !== tid) : [...def.teamIds, tid]
  }

  function addPhase(key: string) {
    if (!def) return
    const tpl = PHASE_TEMPLATES.find((t) => t.key === key)!
    const base = tpl.make('x', [...def.teamIds])
    let pid = slugify(base.name)
    for (let n = 2; def.phases.some((p) => p.id === pid); n++) pid = `${slugify(base.name)}-${n}`
    def.phases.push({ ...base, id: pid })
    preview = def.phases.length - 1
  }

  function move(i: number, d: number) {
    if (!def) return
    const j = i + d
    if (j < 0 || j >= def.phases.length) return
    const ps = def.phases
    ;[ps[i], ps[j]] = [ps[j], ps[i]]
    jsonOpen = {}
  }

  function removePhase(i: number) {
    def?.phases.splice(i, 1)
    jsonOpen = {}
    preview = 0
  }

  function useAllTeams(p: Phase) {
    if (def && p.kind === 'groups' && p.groups.length === 1) p.groups[0].teamIds = [...def.teamIds]
  }

  function openJson(i: number) {
    if (i in jsonOpen) {
      delete jsonOpen[i]
      return
    }
    jsonOpen[i] = JSON.stringify($state.snapshot(def!.phases[i]), null, 2)
    jsonError[i] = ''
  }

  function applyJson(i: number) {
    try {
      const p = JSON.parse(jsonOpen[i])
      if (p.kind !== 'groups' && p.kind !== 'bracket') throw new Error('kind must be "groups" or "bracket"')
      def!.phases[i] = p
      jsonError[i] = ''
      delete jsonOpen[i]
    } catch (e) {
      jsonError[i] = (e as Error).message
    }
  }

  function openFullJson() {
    fullJson = fullJson === null ? JSON.stringify($state.snapshot(def), null, 2) : null
    fullJsonError = ''
  }

  function applyFullJson() {
    try {
      const t = JSON.parse(fullJson!)
      if (!Array.isArray(t.phases) || !Array.isArray(t.teamIds)) throw new Error('Needs "teamIds" and "phases" arrays')
      def = t
      fullJson = null
      jsonOpen = {}
    } catch (e) {
      fullJsonError = (e as Error).message
    }
  }

  function summary(p: Phase) {
    if (p.kind === 'groups') {
      const n = p.groups.reduce((a, g) => a + g.teamIds.length, 0)
      return `${p.groups.length} group${p.groups.length > 1 ? 's' : ''} · ${n} teams · ${p.groups[0]?.buckets.length ?? 0} buckets`
    }
    return `${p.rounds.length} rounds · ${p.matches.length} matches`
  }

  async function save() {
    if (!def || errors.length) return
    saving = true
    saveError = ''
    try {
      const body = $state.snapshot(def) as TournamentInput
      if (id) await api.admin.updateTournament(id, body)
      else await api.admin.createTournament(body)
      go('admin', 't', body.id)
    } catch (e) {
      saveError = (e as Error).message
    }
    saving = false
  }

  async function remove() {
    if (!id) return
    try {
      await api.admin.deleteTournament(id)
      go('admin')
    } catch (e) {
      saveError = (e as Error).message
    }
  }

  const previewPhase = $derived(def?.phases[preview])
  const previewTeams = $derived(new Map((def?.teamIds ?? []).map((t) => [t, teamMap.get(t)!]).filter(([, t]) => t) as [ID, Team][]))
</script>

{#if loadError}
  <p class="err">{loadError}</p>
{:else if !def}
  <p class="muted">Loading…</p>
{:else}
  <div class="head">
    <div>
      <a class="eyebrow back" href={id ? href('admin', 't', id) : href('admin')}>← Back</a>
      <h1>{id ? `Edit ${def.name || id}` : 'New tournament'}</h1>
    </div>
    <button class="btn ghost" onclick={openFullJson}>{fullJson === null ? 'Edit as JSON' : 'Close JSON'}</button>
  </div>

  {#if id}
    <p class="notice">Picks are tied to group, bucket and match ids. Renaming is safe; changing ids or slot counts after people have picked will invalidate their picks.</p>
  {/if}

  {#if fullJson !== null}
    <section class="panel">
      <textarea class="input" rows="24" bind:value={fullJson} spellcheck="false"></textarea>
      {#if fullJsonError}<p class="err small">{fullJsonError}</p>{/if}
      <div class="row end"><button class="btn primary sm" onclick={applyFullJson}>Apply JSON</button></div>
    </section>
  {:else}
    <section class="panel">
      <h2>Basics</h2>
      <div class="grid-2">
        <label class="field"><span>Name</span><input class="input" bind:value={def.name} oninput={onName} placeholder="The International 2027" /></label>
        <label class="field">
          <span>Id {id ? '(permanent)' : ''}</span>
          <input class="input mono" bind:value={def.id} oninput={() => (idTouched = true)} disabled={!!id} placeholder="ti-2027" />
        </label>
        <label class="field"><span>Subtitle</span><input class="input" bind:value={def.subtitle} placeholder="City · Venue" /></label>
        <label class="field">
          <span>Status</span>
          <select class="input" bind:value={def.status}>
            <option value="upcoming">Upcoming</option>
            <option value="live">Live</option>
            <option value="completed">Completed</option>
          </select>
        </label>
        <label class="field">
          <span>Starts</span>
          <input class="input" type="datetime-local" value={toLocalInput(def.startsAt)} onchange={(e) => (def!.startsAt = fromLocalInput(e.currentTarget.value))} />
        </label>
        <label class="field">
          <span>Ends</span>
          <input class="input" type="datetime-local" value={toLocalInput(def.endsAt)} onchange={(e) => (def!.endsAt = fromLocalInput(e.currentTarget.value))} />
        </label>
      </div>
    </section>

    <section class="panel">
      <div class="row">
        <h2>Teams <span class="muted count">{def.teamIds.length}</span></h2>
        <span class="spacer"></span>
        <button class="btn sm ghost" onclick={() => (def!.teamIds = teams.map((t) => t.id))}>All</button>
        <button class="btn sm ghost" onclick={() => (def!.teamIds = [])}>None</button>
        <a class="btn sm" href={href('admin', 'teams')}>Manage teams</a>
      </div>
      <div class="teams">
        {#each teams as t (t.id)}
          <button class="tchip" class:on={def.teamIds.includes(t.id)} onclick={() => toggleTeam(t.id)}><TeamChip team={t} /></button>
        {/each}
      </div>
    </section>

    <section class="panel">
      <h2>Phases</h2>
      {#if !def.phases.length}<p class="muted small">No phases yet. Add one from a template below.</p>{/if}
      <ol class="phases">
        {#each def.phases as p, i (i)}
          <li>
            <div class="prow">
              <span class="mono muted">{String(i + 1).padStart(2, '0')}</span>
              <input class="input pname" bind:value={p.name} aria-label="Phase name" />
              <input class="input mono pid" bind:value={p.id} aria-label="Phase id" />
              <span class="pill">{p.kind}</span>
              <span class="muted small grow">{summary(p)}</span>
              <span class="tools">
                {#if p.kind === 'groups' && p.groups.length === 1}
                  <button class="btn sm ghost" onclick={() => useAllTeams(p)} title="Put all tournament teams in this group">Use all teams</button>
                {/if}
                <button class="btn sm ghost" onclick={() => (preview = i)}>Preview</button>
                <button class="btn sm ghost" onclick={() => openJson(i)}>{i in jsonOpen ? 'Close' : 'JSON'}</button>
                <button class="btn sm ghost" onclick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                <button class="btn sm ghost" onclick={() => move(i, 1)} disabled={i === def.phases.length - 1} aria-label="Move down">↓</button>
                <button class="btn sm danger" onclick={() => removePhase(i)}>Remove</button>
              </span>
            </div>
            {#if i in jsonOpen}
              <textarea class="input" rows="16" bind:value={jsonOpen[i]} spellcheck="false"></textarea>
              {#if jsonError[i]}<p class="err small">{jsonError[i]}</p>{/if}
              <div class="row end"><button class="btn primary sm" onclick={() => applyJson(i)}>Apply</button></div>
            {/if}
          </li>
        {/each}
      </ol>
      <div class="row add">
        <span class="eyebrow">Add phase</span>
        {#each PHASE_TEMPLATES as tpl (tpl.key)}
          <button class="btn sm" onclick={() => addPhase(tpl.key)}>+ {tpl.label}</button>
        {/each}
      </div>
    </section>
  {/if}

  <section class="panel">
    <h2>Checks</h2>
    {#if errors.length}
      <ul class="errs">
        {#each errors as e, i (i)}<li class="err">{e}</li>{/each}
      </ul>
    {:else}
      <p class="ok small">Everything checks out.</p>
    {/if}
  </section>

  {#if previewPhase}
    <section class="preview">
      <div class="row">
        <h2>Preview</h2>
        <span class="seg">
          {#each def.phases as p, i (i)}
            <button class:on={preview === i} onclick={() => (preview = i)}>{p.name || p.id}</button>
          {/each}
        </span>
      </div>
      {#key preview + JSON.stringify(previewPhase)}
        {#if previewPhase.kind === 'groups'}
          <GroupStage phase={{ ...previewPhase, standings: undefined }} teams={previewTeams} picks={normalizeGroupPicks(previewPhase)} editable={false} />
        {:else}
          <Bracket phase={{ ...previewPhase, results: undefined }} teams={previewTeams} picks={{ kind: 'bracket', winners: {} }} editable={false} />
        {/if}
      {/key}
    </section>
  {/if}

  <div class="savebar">
    <div class="wrap inner">
      <span class="small">
        {#if saveError}<span class="err">{saveError}</span>
        {:else if errors.length}<span class="err">{errors.length} problem{errors.length > 1 ? 's' : ''} to fix</span>
        {:else}<span class="muted">Ready to save</span>{/if}
      </span>
      <span class="row">
        {#if id}
          {#if confirmDelete}
            <span class="small">Delete tournament and all picks?</span>
            <button class="btn sm danger" onclick={remove}>Yes, delete</button>
            <button class="btn sm ghost" onclick={() => (confirmDelete = false)}>No</button>
          {:else}
            <button class="btn ghost danger" onclick={() => (confirmDelete = true)}>Delete</button>
          {/if}
        {/if}
        <button class="btn primary" onclick={save} disabled={saving || errors.length > 0}>
          {saving ? 'Saving…' : id ? 'Save changes' : 'Create tournament'}
        </button>
      </span>
    </div>
  </div>
{/if}

<style>
  .head {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
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
    margin-bottom: 16px;
  }
  .row h2 {
    margin-bottom: 0;
  }
  section + section {
    margin-top: 16px;
  }
  .notice {
    padding: 12px 14px;
    border-radius: var(--r);
    background: var(--line);
    color: var(--ink-2);
    font-size: 14px;
    margin: 0 0 16px;
  }
  .row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }
  .end {
    justify-content: flex-end;
    margin-top: 8px;
  }
  .spacer,
  .grow {
    flex: 1;
  }
  .small {
    font-size: 13px;
  }
  .count {
    font: 400 14px var(--mono);
  }
  .teams {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 6px;
    margin-top: 16px;
  }
  .tchip {
    display: flex;
    align-items: center;
    height: 40px;
    padding: 0 10px;
    border: 1px solid var(--line);
    border-radius: 6px;
    opacity: 0.45;
    min-width: 0;
  }
  .tchip.on {
    opacity: 1;
    border-color: var(--ink);
  }
  .phases {
    list-style: none;
    margin: 0 0 16px;
    padding: 0;
  }
  .phases li {
    padding: 12px 0;
    border-bottom: 1px solid var(--line);
  }
  .phases li:first-child {
    border-top: 1px solid var(--line);
  }
  .prow {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
  }
  .pname {
    width: 180px;
  }
  .pid {
    width: 130px;
  }
  .tools {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .phases textarea {
    margin-top: 12px;
  }
  .add {
    gap: 6px;
  }
  .add .eyebrow {
    margin-right: 6px;
  }
  .errs {
    margin: 0;
    padding-left: 18px;
    font-size: 14px;
    display: grid;
    gap: 4px;
  }
  .preview {
    margin-top: 40px;
  }
  .preview .row {
    margin-bottom: 20px;
    gap: 16px;
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
