package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/naive-encryption/predictions/contract"
)

var (
	DEV_ADMIN  string
	PORT       string
	STATIC_DIR string
	db         *pgxpool.Pool
)

func env(key, fallback string) string {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	return v
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, contract.Error{Error: msg})
}

func requireAdmin(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if DEV_ADMIN != "1" {
			writeError(w, http.StatusForbidden, "admin only")
			return
		}
		next(w, r)
	}
}

func main() {
	PORT = env("PORT", "8080")
	DEV_ADMIN = env("DEV_ADMIN", "0") // TODO: convert
	STATIC_DIR = env("STATIC_DIR", "../front/dist")

	var err error
	db, err = pgxpool.New(context.Background(), env("DATABASE_URL", ""))
	if err != nil {
		log.Fatal("db config: ", err)
	}
	defer db.Close()

	if err := db.Ping(context.Background()); err != nil {
		log.Fatal("db connect: ", err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", health)
	mux.HandleFunc("GET /api/me", me)
	mux.HandleFunc("/api/", notFound)
	mux.Handle("/", http.FileServer(http.Dir(STATIC_DIR)))

	mux.HandleFunc("GET /api/teams", listTeams)
	mux.HandleFunc("POST /api/admin/teams", requireAdmin(createTeam))
	mux.HandleFunc("DELETE /api/admin/teams/{id}", requireAdmin(deleteTeam))
	mux.HandleFunc("PUT /api/admin/teams/{id}", requireAdmin(updateTeam))

	mux.HandleFunc("GET /api/tournaments", listTournaments)
	mux.HandleFunc("GET /api/tournaments/{id}", getTournament)
	mux.HandleFunc("POST /api/admin/tournaments", requireAdmin(createTournament))

	srv := &http.Server{Addr: ":" + PORT, Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	log.Fatal(srv.ListenAndServe())
}

func health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func me(w http.ResponseWriter, r *http.Request) {
	if DEV_ADMIN == "1" {
		writeJSON(w, http.StatusOK, contract.User{ID: "dev", Name: "dev", Admin: true})
	} else {
		writeError(w, http.StatusUnauthorized, "not signed in")
	}
}

func notFound(w http.ResponseWriter, r *http.Request) {
	writeError(w, http.StatusNotFound, "not found")
}

func listTeams(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Query(r.Context(), `SELECT id, name, tag, logo, color FROM teams ORDER BY name`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	teams, err := pgx.CollectRows(rows, pgx.RowToStructByName[contract.Team])
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	if teams == nil {
		teams = []contract.Team{}
	}
	writeJSON(w, http.StatusOK, teams)
}

func createTeam(w http.ResponseWriter, r *http.Request) {
	var t contract.Team
	if err := json.NewDecoder(r.Body).Decode(&t); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if t.ID == "" || t.Name == "" || t.Tag == "" {
		writeError(w, http.StatusBadRequest, "id,name and tag are required")
		return
	}

	_, err := db.Exec(r.Context(), `INSERT INTO teams (id,name,tag,logo,color) VALUES ($1,$2,$3,$4,$5)`, t.ID, t.Name, t.Tag, t.Logo, t.Color)

	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		writeError(w, http.StatusConflict, "team id already exists")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	writeJSON(w, http.StatusCreated, t)
}

func deleteTeam(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	tag, err := db.Exec(r.Context(), `DELETE FROM teams WHERE id = $1`, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "team not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func updateTeam(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	var t contract.Team
	if err := json.NewDecoder(r.Body).Decode(&t); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if t.Name == "" || t.Tag == "" {
		writeError(w, http.StatusBadRequest, "name and tag are required")
		return
	}
	if t.ID != "" && t.ID != id {
		writeError(w, http.StatusBadRequest, "id cannot be changed")
		return
	}
	t.ID = id // to guarantee the same id

	tag, err := db.Exec(r.Context(), `UPDATE teams SET name = $2, tag = $3, logo = $4, color = $5 WHERE id = $1`, id, t.Name, t.Tag, t.Logo, t.Color)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "no team found")
		return
	}
	writeJSON(w, http.StatusOK, t)
}

func listTournaments(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Query(r.Context(), `SELECT t.id,t.name,t.subtitle,t.starts_at,t.ends_at,t.status, (SELECT count(*) FROM tournament_teams tt WHERE tt.tournament_id = t.id), (SELECT count(*) FROM phases p WHERE p.tournament_id= t.id) FROM tournaments t ORDER BY t.starts_at DESC`)
	if err != nil {
		log.Println(err)
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	tournaments, err := pgx.CollectRows(rows, pgx.RowToStructByPos[contract.TournamentSummary])
	if err != nil {
		log.Println(err)
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	if tournaments == nil {
		tournaments = []contract.TournamentSummary{}
	}
	writeJSON(w, http.StatusOK, tournaments)
}

func loadTournament(ctx context.Context, id string) (contract.Tournament, error) {
	var t contract.Tournament

	err := db.QueryRow(ctx,
		`SELECT id, name, subtitle, starts_at,ends_at,status FROM tournaments WHERE id = $1`, id).Scan(&t.ID, &t.Name, &t.Subtitle, &t.StartsAt, &t.EndsAt, &t.Status)
	if err != nil {
		return t, err
	}

	rows, err := db.Query(ctx,
		`SELECT te.id,te.name,te.tag,te.logo,te.color
		FROM tournament_teams tt 
		JOIN teams te ON te.id = tt.team_id
		WHERE tt.tournament_id = $1
		ORDER BY te.name`, id)
	if err != nil {
		return t, fmt.Errorf("teams: %w", err)
	}

	t.Teams, err = pgx.CollectRows(rows, pgx.RowToStructByName[contract.Team])
	if err != nil {
		return t, fmt.Errorf("teams: %w", err)
	}
	if t.Teams == nil {
		t.Teams = []contract.Team{}
	}

	rows, err = db.Query(ctx,
		`SELECT id,kind,name,status,opens_at,locks_at,scoring,structure,standings,results
		FROM phases WHERE tournament_id = $1
		ORDER BY position`, id)
	if err != nil {
		return t, fmt.Errorf("phases: %w", err)
	}
	defer rows.Close()

	t.Phases = []contract.Phase{}
	for rows.Next() {
		var p contract.Phase
		var structure, standings, results []byte
		err := rows.Scan(&p.ID, &p.Kind, &p.Name, &p.Status, &p.OpensAt, &p.LocksAt, &p.Scoring, &structure, &standings, &results)
		if err != nil {
			return t, fmt.Errorf("phase scan: %w", err)
		}
		if err = json.Unmarshal(structure, &p); err != nil {
			return t, fmt.Errorf("phase %s structure: %w", p.ID, err)
		}
		if err = json.Unmarshal(standings, &p.Standings); err != nil {
			return t, fmt.Errorf("phase %s standings: %w", p.ID, err)
		}
		if err = json.Unmarshal(results, &p.Results); err != nil {
			return t, fmt.Errorf("phase %s results: %w", p.ID, err)
		}
		t.Phases = append(t.Phases, p)
	}

	return t, rows.Err()
}

func getTournament(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	t, err := loadTournament(r.Context(), id)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "tournament not found")
		return
	}
	if err != nil {
		log.Println(err)
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}

	writeJSON(w, http.StatusOK, t)
}

func createTournament(w http.ResponseWriter, r *http.Request) {
	var tournament contract.TournamentInput
	if err := json.NewDecoder(r.Body).Decode(&tournament); err != nil {
		log.Println(err)
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}

	if tournament.Name == "" || tournament.ID == "" {
		writeError(w, http.StatusBadRequest, "name, id are required")
		return
	}
	if tournament.Status == "" {
		tournament.Status = "upcoming"
	}

	for _, phase := range tournament.Phases {
		if phase.Kind != "groups" && phase.Kind != "bracket" {
			writeError(w, http.StatusBadRequest, "phases must be either groups or bracket")
			return
		}
	}

	tx, err := db.Begin(r.Context())
	if err != nil {
		log.Println(err)
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(r.Context())

	_, err = tx.Exec(r.Context(), `INSERT into tournaments 
		(id,name,subtitle,starts_at,ends_at,status) VALUES ($1,$2,$3,$4,$5,$6)`, tournament.ID, tournament.Name, tournament.Subtitle, tournament.StartsAt, tournament.EndsAt, tournament.Status)

	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "23505":
			writeError(w, http.StatusConflict, "tournament id already exists")
			return
		case "23514":
			writeError(w, http.StatusBadRequest, "invalid status or dates")
			return
		}
	}

	if err != nil {
		log.Println(err)
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}

	for _, teamID := range tournament.TeamIDs {
		_, err = tx.Exec(r.Context(), `INSERT into tournament_teams 
			(tournament_id,team_id) VALUES ($1,$2)`, tournament.ID, teamID)
		if errors.As(err, &pgErr) {
			switch pgErr.Code {
			case "23503":
				writeError(w, http.StatusBadRequest, "unknown team: "+teamID)
				return
			case "23505":
				writeError(w, http.StatusBadRequest, "team listed twice: "+teamID)
				return
			}
		}
		if err != nil {
			log.Println(err)
			writeError(w, http.StatusInternalServerError, "db error")
			return
		}
	}

	for i, phase := range tournament.Phases {
		var structure any
		switch phase.Kind {
		case "groups":
			structure = map[string]any{"groups": phase.Groups}
		case "bracket":
			structure = map[string]any{"rounds": phase.Rounds, "matches": phase.Matches}
		default:
			writeError(w, http.StatusBadRequest, "phase "+phase.ID+": unknown kind")
			return
		}

		standings := phase.Standings
		if standings == nil {
			standings = map[string]map[string][]string{}
		}

		results := phase.Results
		if results == nil {
			results = map[string]contract.MatchResult{}
		}

		status := phase.Status
		if status == "" {
			status = "upcoming"
		}

		_, err := tx.Exec(r.Context(), `
			INSERT into phases 
			(tournament_id,id,position,kind,name,status,opens_at,locks_at,scoring,structure,standings,results)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
			tournament.ID, phase.ID, i, phase.Kind, phase.Name, status, phase.OpensAt, phase.LocksAt, phase.Scoring, structure, standings, results)
		if err != nil {
			log.Println(err)
			writeError(w, http.StatusInternalServerError, "db error")
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		log.Println(err)
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}

	t, err := loadTournament(r.Context(), tournament.ID)
	if err != nil {
		log.Println(err)
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}

	writeJSON(w, http.StatusCreated, t)
}
