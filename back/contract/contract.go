// Package contract mirrors front/src/lib/api/types.ts: the JSON the frontend
// sends and expects. Keep the two files in sync. Timestamps are RFC 3339.
package contract

import "time"

type User struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Avatar string `json:"avatar,omitempty"`
	Admin  bool   `json:"admin,omitempty"`
}

type Team struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Tag   string `json:"tag"`
	Logo  string `json:"logo,omitempty"`
	Color string `json:"color,omitempty"`
}

// Phase status: "upcoming" | "open" | "locked" | "completed".
// Tournament status: "upcoming" | "live" | "completed".

type TournamentSummary struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	Subtitle   string    `json:"subtitle,omitempty"`
	StartsAt   time.Time `json:"startsAt"`
	EndsAt     time.Time `json:"endsAt"`
	Status     string    `json:"status"`
	TeamCount  int       `json:"teamCount"`
	PhaseCount int       `json:"phaseCount"`
}

type Tournament struct {
	ID       string    `json:"id"`
	Name     string    `json:"name"`
	Subtitle string    `json:"subtitle,omitempty"`
	StartsAt time.Time `json:"startsAt"`
	EndsAt   time.Time `json:"endsAt"`
	Status   string    `json:"status"`
	Teams    []Team    `json:"teams"`
	Phases   []Phase   `json:"phases"`
}

// Phase is either a group phase (Kind "groups") or a bracket (Kind "bracket").
// Only the fields for its kind are set.
type Phase struct {
	ID      string     `json:"id"`
	Kind    string     `json:"kind"` // "groups" | "bracket"
	Name    string     `json:"name"`
	Status  string     `json:"status"`
	OpensAt *time.Time `json:"opensAt,omitempty"`
	LocksAt *time.Time `json:"locksAt,omitempty"`
	Scoring string     `json:"scoring,omitempty"`

	// kind == "groups"
	Groups    []Group                        `json:"groups,omitempty"`
	Standings map[string]map[string][]string `json:"standings,omitempty"` // groupId -> bucketId -> teamIds

	// kind == "bracket"
	Rounds  []Round                `json:"rounds,omitempty"`
	Matches []Match                `json:"matches,omitempty"`
	Results map[string]MatchResult `json:"results,omitempty"` // matchId -> result
}

type Group struct {
	ID      string   `json:"id"`
	Name    string   `json:"name"`
	TeamIDs []string `json:"teamIds"`
	Buckets []Bucket `json:"buckets"`
}

type Bucket struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	Hint  string `json:"hint,omitempty"`
	Slots int    `json:"slots"`
	Tone  string `json:"tone,omitempty"` // "advance" | "eliminate" | "neutral"
}

type Round struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Section string `json:"section"` // rounds with the same section render on one row
}

type Match struct {
	ID       string     `json:"id"`
	RoundID  string     `json:"roundId"`
	Label    string     `json:"label,omitempty"`
	BestOf   int        `json:"bestOf"`
	A        Slot       `json:"a"`
	B        Slot       `json:"b"`
	StartsAt *time.Time `json:"startsAt,omitempty"`
}

// Slot is exactly one of: {teamId} | {from, take} | {tbd, label, teamId?}.
// A TBD slot gets a teamId once an admin seeds it.
type Slot struct {
	TeamID string `json:"teamId,omitempty"`
	From   string `json:"from,omitempty"` // match id
	Take   string `json:"take,omitempty"` // "winner" | "loser"
	TBD    bool   `json:"tbd,omitempty"`
	Label  string `json:"label,omitempty"`
}

type MatchResult struct {
	Winner string `json:"winner"`
	Score  string `json:"score,omitempty"`
}

// PhasePicks is the body of PUT /api/tournaments/{id}/phases/{phaseId}/picks.
type PhasePicks struct {
	Kind    string                          `json:"kind"`              // "groups" | "bracket"
	Groups  map[string]map[string][]*string `json:"groups,omitempty"`  // groupId -> bucketId -> teamId per slot (null = empty)
	Winners map[string]string               `json:"winners,omitempty"` // matchId -> teamId
}

type TournamentPicks struct {
	Phases    map[string]PhasePicks `json:"phases"`
	Points    map[string]int        `json:"points,omitempty"` // phaseId -> points
	UpdatedAt *time.Time            `json:"updatedAt,omitempty"`
}

type LeaderboardEntry struct {
	Rank   int            `json:"rank"`
	User   User           `json:"user"`
	Points int            `json:"points"`
	Phases map[string]int `json:"phases,omitempty"`
}

type Leaderboard struct {
	Entries []LeaderboardEntry `json:"entries"`
	Total   int                `json:"total"`
	Me      *LeaderboardEntry  `json:"me,omitempty"`
}

// ---- Admin ----

// TournamentInput is the body of POST/PUT /api/admin/tournaments: like
// Tournament, but teams are referenced by id.
type TournamentInput struct {
	ID       string    `json:"id"`
	Name     string    `json:"name"`
	Subtitle string    `json:"subtitle,omitempty"`
	StartsAt time.Time `json:"startsAt"`
	EndsAt   time.Time `json:"endsAt"`
	Status   string    `json:"status"`
	TeamIDs  []string  `json:"teamIds"`
	Phases   []Phase   `json:"phases"`
}

// PhasePatch is the body of PATCH /api/admin/tournaments/{id}/phases/{pid}.
// A field that is absent stays as it is; an explicit null clears opensAt/locksAt.
// Use json.RawMessage or a custom type if you need to tell "absent" from null.
type PhasePatch struct {
	Status  *string    `json:"status,omitempty"`
	OpensAt *time.Time `json:"opensAt"`
	LocksAt *time.Time `json:"locksAt"`
}

type Standings map[string]map[string][]string // groupId -> bucketId -> teamIds
type Results map[string]MatchResult           // matchId -> result (full replace)

// Seeds: matchId -> team for each TBD side ("a" / "b"). Full replace.
type Seeds map[string]struct {
	A string `json:"a,omitempty"`
	B string `json:"b,omitempty"`
}

type UploadResponse struct {
	URL string `json:"url"`
}

// Error is the body of any non-2xx response.
type Error struct {
	Error string `json:"error"`
}
