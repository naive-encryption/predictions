package main

import (
	"context"
	"encoding/json"
	"errors"
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
