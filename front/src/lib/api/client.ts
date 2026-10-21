import type {
  ApiErrorBody, ID, Leaderboard, PhasePatch, PhasePicks, Results, Seeds, Standings, Team, Tournament,
  TournamentInput, TournamentPicks, TournamentSummary, User,
} from './types'

// Everything the UI needs from the backend. Two implementations:
// HttpApi (real Go backend) and MockApi (in-browser, localStorage).
export interface Api {
  me(): Promise<User | null> // null when not signed in
  loginUrl(): string
  logout(): Promise<void>
  teams(): Promise<Team[]>
  tournaments(): Promise<TournamentSummary[]>
  tournament(id: ID): Promise<Tournament>
  picks(tournamentId: ID): Promise<TournamentPicks>
  savePicks(tournamentId: ID, phaseId: ID, picks: PhasePicks): Promise<PhasePicks>
  leaderboard(tournamentId: ID, opts?: { phase?: ID; offset?: number; limit?: number }): Promise<Leaderboard>
  admin: AdminApi
}

// Everything under /api/admin. The server must reject these for non-admins.
export interface AdminApi {
  createTeam(team: Team): Promise<Team>
  updateTeam(id: ID, team: Team): Promise<Team>
  deleteTeam(id: ID): Promise<void>
  upload(file: File): Promise<{ url: string }>
  createTournament(t: TournamentInput): Promise<Tournament>
  updateTournament(id: ID, t: TournamentInput): Promise<Tournament>
  deleteTournament(id: ID): Promise<void>
  patchPhase(tid: ID, pid: ID, patch: PhasePatch): Promise<Tournament>
  saveStandings(tid: ID, pid: ID, standings: Standings): Promise<Tournament>
  saveResults(tid: ID, pid: ID, results: Results): Promise<Tournament>
  saveSeeds(tid: ID, pid: ID, seeds: Seeds): Promise<Tournament>
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export class HttpApi implements Api {
  constructor(private base = '/api') {}

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const isForm = body instanceof FormData
    const res = await fetch(this.base + path, {
      method,
      credentials: 'include',
      headers: body === undefined || isForm ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    })
    if (!res.ok) {
      let msg = res.statusText
      try {
        msg = ((await res.json()) as ApiErrorBody).error ?? msg
      } catch {}
      throw new ApiError(res.status, msg)
    }
    return res.status === 204 ? (undefined as T) : res.json()
  }

  async me() {
    try {
      return await this.req<User>('GET', '/me')
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return null
      throw e
    }
  }
  loginUrl() {
    return `${this.base}/auth/login?return=${encodeURIComponent(location.href)}`
  }
  logout() {
    return this.req<void>('POST', '/auth/logout')
  }
  teams() {
    return this.req<Team[]>('GET', '/teams')
  }
  tournaments() {
    return this.req<TournamentSummary[]>('GET', '/tournaments')
  }
  tournament(id: ID) {
    return this.req<Tournament>('GET', `/tournaments/${id}`)
  }
  picks(tid: ID) {
    return this.req<TournamentPicks>('GET', `/tournaments/${tid}/picks`)
  }
  savePicks(tid: ID, pid: ID, picks: PhasePicks) {
    return this.req<PhasePicks>('PUT', `/tournaments/${tid}/phases/${pid}/picks`, picks)
  }
  leaderboard(tid: ID, opts: { phase?: ID; offset?: number; limit?: number } = {}) {
    const q = new URLSearchParams()
    if (opts.phase) q.set('phase', opts.phase)
    if (opts.offset) q.set('offset', String(opts.offset))
    if (opts.limit) q.set('limit', String(opts.limit))
    const qs = q.toString()
    return this.req<Leaderboard>('GET', `/tournaments/${tid}/leaderboard${qs ? '?' + qs : ''}`)
  }

  admin: AdminApi = {
    createTeam: (team) => this.req('POST', '/admin/teams', team),
    updateTeam: (id, team) => this.req('PUT', `/admin/teams/${id}`, team),
    deleteTeam: (id) => this.req('DELETE', `/admin/teams/${id}`),
    upload: (file) => {
      const fd = new FormData()
      fd.append('file', file)
      return this.req('POST', '/admin/uploads', fd)
    },
    createTournament: (t) => this.req('POST', '/admin/tournaments', t),
    updateTournament: (id, t) => this.req('PUT', `/admin/tournaments/${id}`, t),
    deleteTournament: (id) => this.req('DELETE', `/admin/tournaments/${id}`),
    patchPhase: (tid, pid, patch) => this.req('PATCH', `/admin/tournaments/${tid}/phases/${pid}`, patch),
    saveStandings: (tid, pid, s) => this.req('PUT', `/admin/tournaments/${tid}/phases/${pid}/standings`, s),
    saveResults: (tid, pid, r) => this.req('PUT', `/admin/tournaments/${tid}/phases/${pid}/results`, r),
    saveSeeds: (tid, pid, s) => this.req('PUT', `/admin/tournaments/${tid}/phases/${pid}/seeds`, s),
  }
}
