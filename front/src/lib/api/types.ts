// API contract between the frontend and the Go backend.
// Mirrored in back/contract/contract.go — keep the two in sync.
// All timestamps are RFC 3339 strings. All IDs are opaque strings.

export type ID = string

export interface User {
  id: ID
  name: string
  avatar?: string
  admin?: boolean // shows the admin area; the server must still check on every admin call
}

export interface Team {
  id: ID
  name: string
  tag: string // short name, e.g. "TSpirit"
  logo?: string // absolute URL; a monogram is drawn when missing
  color?: string // hex, used for the monogram
}

export type PhaseStatus =
  | 'upcoming' // visible, not yet accepting picks
  | 'open' // accepting picks until locksAt
  | 'locked' // picks frozen, matches in progress
  | 'completed' // results final, points awarded

export type TournamentStatus = 'upcoming' | 'live' | 'completed'

export interface TournamentSummary {
  id: ID
  name: string
  subtitle?: string
  startsAt: string
  endsAt: string
  status: TournamentStatus
  teamCount: number
  phaseCount: number
}

export interface Tournament extends Omit<TournamentSummary, 'teamCount' | 'phaseCount'> {
  teams: Team[]
  phases: Phase[] // in display order
}

interface PhaseBase {
  id: ID
  name: string // "Play-in", "Group Stage", "Playoffs", anything
  status: PhaseStatus
  opensAt?: string
  locksAt?: string
  scoring?: string // human-readable scoring rules, shown to the player
}

// ---- Group phase ---------------------------------------------------------
// One or more groups; each group has a set of teams and a set of buckets
// (records / placements). The player drags teams into bucket slots.
// Swiss = one group with buckets "3-0", "3-1", ...; round robin = several groups.

export type BucketTone = 'advance' | 'eliminate' | 'neutral'

export interface Bucket {
  id: ID
  label: string // "4–0", "Advance", "1st", ...
  hint?: string // "Upper bracket", "Eliminated", ...
  slots: number
  tone?: BucketTone
}

export interface Group {
  id: ID
  name: string
  teamIds: ID[]
  buckets: Bucket[]
}

export interface GroupPhase extends PhaseBase {
  kind: 'groups'
  groups: Group[]
  // Actual outcome once known: groupId -> bucketId -> teamIds
  standings?: Record<ID, Record<ID, ID[]>>
}

// ---- Bracket phase -------------------------------------------------------
// Generic bracket: each match side is a fixed team, or the winner/loser of
// another match. Covers single elim, double elim, gauntlets, etc.

export type Slot =
  | { teamId: ID }
  | { from: ID; take: 'winner' | 'loser' }
  | { tbd: true; label?: string; teamId?: ID } // seeded later: admin sets teamId once known

export interface Round {
  id: ID
  name: string // "Upper Quarterfinals"
  section: string // rounds sharing a section render on one row, e.g. "upper", "lower", "final"
}

export interface Match {
  id: ID
  roundId: ID
  label?: string // "UB1"
  bestOf: number
  a: Slot
  b: Slot
  startsAt?: string
}

export interface MatchResult {
  winner: ID
  score?: string // "2–1"
}

export interface BracketPhase extends PhaseBase {
  kind: 'bracket'
  rounds: Round[] // in left-to-right order
  matches: Match[]
  results?: Record<ID, MatchResult> // matchId -> result
}

export type Phase = GroupPhase | BracketPhase

// ---- Picks ---------------------------------------------------------------

export interface GroupPicks {
  kind: 'groups'
  // groupId -> bucketId -> teamIds (array length == bucket.slots, null = empty)
  groups: Record<ID, Record<ID, (ID | null)[]>>
}

export interface BracketPicks {
  kind: 'bracket'
  winners: Record<ID, ID> // matchId -> teamId
}

export type PhasePicks = GroupPicks | BracketPicks

export interface TournamentPicks {
  phases: Record<ID, PhasePicks> // phaseId -> picks (absent = none yet)
  points?: Record<ID, number> // phaseId -> points earned so far
  updatedAt?: string
}

// ---- Leaderboard ---------------------------------------------------------

export interface LeaderboardEntry {
  rank: number
  user: User
  points: number
  phases?: Record<ID, number> // phaseId -> points
}

export interface Leaderboard {
  entries: LeaderboardEntry[]
  total: number // total ranked players
  me?: LeaderboardEntry // current user's row, even if outside the page
}

// ---- Admin ---------------------------------------------------------------

// A tournament as admins write it: same as Tournament, but teams are
// referenced by id (teams live in their own table, shared across tournaments).
export interface TournamentInput extends Omit<Tournament, 'teams'> {
  teamIds: ID[]
}

export interface PhasePatch {
  status?: PhaseStatus
  opensAt?: string | null // null clears
  locksAt?: string | null
}

export type Standings = Record<ID, Record<ID, ID[]>> // groupId -> bucketId -> teamIds
export type Results = Record<ID, MatchResult> // matchId -> result (full replace)
export type Seeds = Record<ID, { a?: ID; b?: ID }> // matchId -> team for each TBD side

// ---- Errors --------------------------------------------------------------
// Non-2xx responses should carry: { "error": "human readable message" }

export interface ApiErrorBody {
  error: string
}
