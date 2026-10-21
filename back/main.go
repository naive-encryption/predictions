package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/naive-encryption/predictions/contract"
)

var (
	DEV_ADMIN  string
	PORT       string
	STATIC_DIR string
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

func main() {
	PORT = env("PORT", "8080")
	DEV_ADMIN = env("DEV_ADMIN", "0") // TODO: convert
	STATIC_DIR = env("STATIC_DIR", "../front/dist")

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", health)
	mux.HandleFunc("GET /api/me", me)
	mux.HandleFunc("/api/", notFound)
	mux.Handle("/", http.FileServer(http.Dir(STATIC_DIR)))

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
