<script lang="ts">
  import { api, type Team } from '../../lib/api'
  import { slugify } from '../../lib/format'
  import TeamChip from '../../components/TeamChip.svelte'

  let teams = $state<Team[] | null>(null)
  let error = $state('')
  let editing = $state<{ original: string | null; team: Team } | null>(null) // original null = new
  let busy = $state(false)
  let formError = $state('')
  let confirmDelete = $state(false)
  let query = $state('')

  async function load() {
    try {
      teams = await api.teams()
    } catch (e) {
      error = (e as Error).message
    }
  }
  load()

  const shown = $derived(
    (teams ?? []).filter((t) => !query || `${t.name} ${t.tag} ${t.id}`.toLowerCase().includes(query.toLowerCase())),
  )

  function startNew() {
    editing = { original: null, team: { id: '', name: '', tag: '', color: '#333333' } }
    formError = ''
    confirmDelete = false
  }
  function startEdit(t: Team) {
    editing = { original: t.id, team: { ...t } }
    formError = ''
    confirmDelete = false
  }

  function onName() {
    if (editing && editing.original === null) editing.team.id = slugify(editing.team.name)
  }

  async function onFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file || !editing) return
    busy = true
    formError = ''
    try {
      editing.team.logo = (await api.admin.upload(file)).url
    } catch (err) {
      formError = (err as Error).message
    }
    busy = false
  }

  async function save() {
    if (!editing) return
    const t = { ...editing.team, name: editing.team.name.trim(), tag: editing.team.tag.trim() }
    if (!t.name || !t.tag || !t.id) return (formError = 'Name, tag and id are required.')
    if (!t.logo) delete t.logo
    busy = true
    formError = ''
    try {
      if (editing.original === null) await api.admin.createTeam(t)
      else await api.admin.updateTeam(editing.original, t)
      editing = null
      await load()
    } catch (e) {
      formError = (e as Error).message
    }
    busy = false
  }

  async function remove() {
    if (!editing?.original) return
    busy = true
    try {
      await api.admin.deleteTeam(editing.original)
      editing = null
      await load()
    } catch (e) {
      formError = (e as Error).message
      confirmDelete = false
    }
    busy = false
  }
</script>

{#snippet form()}
  {#if editing}
    <div class="panel form">
      <div class="preview">
        <TeamChip team={{ ...editing.team, name: editing.team.name || 'Team name', tag: editing.team.tag || 'Tag' }} full />
      </div>
      <div class="grid-2">
        <label class="field"><span>Name</span><input class="input" bind:value={editing.team.name} oninput={onName} placeholder="Team Spirit" /></label>
        <label class="field"><span>Tag</span><input class="input" bind:value={editing.team.tag} placeholder="Spirit" maxlength="12" /></label>
        <label class="field">
          <span>Id {editing.original ? '(permanent)' : ''}</span>
          <input class="input mono" bind:value={editing.team.id} disabled={!!editing.original} placeholder="spirit" />
        </label>
        <label class="field">
          <span>Color</span>
          <span class="color">
            <input type="color" bind:value={editing.team.color} />
            <input class="input mono" bind:value={editing.team.color} />
          </span>
        </label>
      </div>
      <div class="field logo-field">
        <span>Logo</span>
        <div class="logo-row">
          {#if editing.team.logo}<img src={editing.team.logo} alt="" />{/if}
          <input class="input" bind:value={editing.team.logo} placeholder="https://… or upload" />
          <label class="btn sm">Upload<input type="file" accept="image/*" hidden onchange={onFile} /></label>
          {#if editing.team.logo}<button class="btn sm ghost" onclick={() => editing && (editing.team.logo = '')}>Remove</button>{/if}
        </div>
      </div>
      {#if formError}<p class="err msg">{formError}</p>{/if}
      <div class="row">
        {#if editing.original}
          {#if confirmDelete}
            <span class="small">Delete {editing.team.name}?</span>
            <button class="btn sm danger" onclick={remove} disabled={busy}>Yes, delete</button>
            <button class="btn sm ghost" onclick={() => (confirmDelete = false)}>No</button>
          {:else}
            <button class="btn sm danger" onclick={() => (confirmDelete = true)}>Delete</button>
          {/if}
        {/if}
        <span class="spacer"></span>
        <button class="btn ghost" onclick={() => (editing = null)}>Cancel</button>
        <button class="btn primary" onclick={save} disabled={busy}>{busy ? 'Saving…' : editing.original ? 'Save team' : 'Add team'}</button>
      </div>
    </div>
  {/if}
{/snippet}

<div class="head">
  <h1>Teams</h1>
  <span class="spacer"></span>
  <input class="input search" placeholder="Search" bind:value={query} />
  <button class="btn primary" onclick={startNew}>Add team</button>
</div>

{#if editing && editing.original === null}{@render form()}{/if}

{#if error}
  <p class="err">{error}</p>
{:else if !teams}
  <p class="muted">Loading…</p>
{:else}
  <ul>
    {#each shown as t (t.id)}
      <li>
        {#if editing?.original === t.id}
          {@render form()}
        {:else}
          <button class="rowbtn" onclick={() => startEdit(t)}>
            <TeamChip team={t} full />
            <span class="mono muted small">{t.tag}</span>
            <span class="mono muted small id">{t.id}</span>
            <span class="edit small">Edit</span>
          </button>
        {/if}
      </li>
    {/each}
  </ul>
  <p class="muted small count">{teams.length} teams</p>
{/if}

<style>
  .head {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 24px;
  }
  h1 {
    font-size: 30px;
  }
  .spacer {
    flex: 1;
  }
  .search {
    width: 200px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    border-top: 1px solid var(--ink);
  }
  li {
    border-bottom: 1px solid var(--line);
  }
  li:has(.form) {
    padding: 12px 0;
  }
  .rowbtn {
    display: grid;
    grid-template-columns: 1fr 100px 140px 40px;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 12px 0;
    text-align: left;
  }
  .rowbtn:hover .edit {
    color: var(--accent);
  }
  @media (max-width: 560px) {
    .rowbtn {
      grid-template-columns: 1fr 40px;
    }
    .rowbtn .mono {
      display: none;
    }
  }
  .edit {
    color: var(--muted);
    text-align: right;
  }
  .small {
    font-size: 12px;
  }
  .count {
    margin-top: 16px;
  }
  .form {
    display: grid;
    gap: 16px;
    margin-bottom: 16px;
  }
  .preview {
    padding-bottom: 12px;
    border-bottom: 1px solid var(--line);
  }
  .color {
    display: flex;
    gap: 6px;
  }
  .color input[type='color'] {
    width: 38px;
    height: 38px;
    padding: 2px;
    border: 1px solid var(--line-2);
    border-radius: 6px;
    background: var(--surface);
    flex: none;
  }
  .logo-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .logo-row img {
    width: 38px;
    height: 38px;
    border-radius: 6px;
    object-fit: cover;
    flex: none;
  }
  .row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }
  .msg {
    margin: 0;
    font-size: 14px;
  }
</style>
