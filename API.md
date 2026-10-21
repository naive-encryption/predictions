# API contract

The frontend talks to the backend at `/api` using JSON. The types live in two places that must stay in sync:

- `front/src/lib/api/types.ts`: TypeScript, the source of truth for the UI
- `back/contract/contract.go`: the same shapes as Go structs with json tags

Auth uses cookies. Every request is sent with `credentials: 'include'`. Any non-2xx response should have the body `{"error": "message"}`, and the UI shows that message.

## Endpoints

| Method | Path | Returns | Notes |
|---|---|---|---|
| GET | `/api/me` | `User` | `401` when signed out. The UI then shows a "Sign in" link. |
| GET | `/api/auth/login?return=<url>` | redirect | Start your login flow (Steam OpenID, etc.), then redirect back to `return`. |
| POST | `/api/auth/logout` | `204` | |
| GET | `/api/tournaments` | `TournamentSummary[]` | |
| GET | `/api/tournaments/{id}` | `Tournament` | Full definition: teams, phases, standings/results. |
| GET | `/api/tournaments/{id}/picks` | `TournamentPicks` | The current user's picks for every phase, plus `points` per phase. Return `{"phases":{}}` if they have none. |
| PUT | `/api/tournaments/{id}/phases/{phaseId}/picks` | `PhasePicks` | Body is `PhasePicks`. Reject it unless the phase is `open` and `now < locksAt`. Echo back what was stored. |
| GET | `/api/tournaments/{id}/leaderboard?phase=&offset=&limit=` | `Leaderboard` | Without `phase` it is the overall standings. Always include `me` when the user is signed in, so their row shows even when it falls outside the page. Ties share a rank (1, 1, 3). |

## Admin endpoints

Every route under `/api/admin` must return `403` unless the session user is an admin. The UI hides the admin area unless `/api/me` returns `"admin": true`, but hiding it is only cosmetic; the real check has to happen on the server.

| Method | Path | Body → Returns | Notes |
|---|---|---|---|
| GET | `/api/teams` | → `Team[]` | Public. All teams. |
| POST | `/api/admin/teams` | `Team` → `Team` | `409` if the id exists. Ids are lowercase slugs. |
| PUT | `/api/admin/teams/{id}` | `Team` → `Team` | The id can't change. |
| DELETE | `/api/admin/teams/{id}` | → `204` | `409` if any tournament uses the team. |
| POST | `/api/admin/uploads` | multipart `file` → `{url}` | Store the file and return a public URL, then use that URL as `Team.logo`. |
| POST | `/api/admin/tournaments` | `TournamentInput` → `Tournament` | Validate first (see below). |
| PUT | `/api/admin/tournaments/{id}` | `TournamentInput` → `Tournament` | Replaces the whole definition. |
| DELETE | `/api/admin/tournaments/{id}` | → `204` | Deletes the tournament and its picks. |
| PATCH | `/api/admin/tournaments/{id}/phases/{pid}` | `PhasePatch` → `Tournament` | Status, `opensAt`, `locksAt`. |
| PUT | `.../phases/{pid}/standings` | `Standings` → `Tournament` | Group phases. Full replace; partial standings are allowed. |
| PUT | `.../phases/{pid}/results` | `Results` → `Tournament` | Bracket phases. Full replace of every match result. |
| PUT | `.../phases/{pid}/seeds` | `Seeds` → `Tournament` | Sets `teamId` on TBD slots. Full replace. |

After any write to standings or results, recompute the points for that phase.

### Validating a definition

The UI runs these checks before it saves (`front/src/lib/validate.ts`). The server must run them too:
- Ids are lowercase slugs and unique within their scope (phases, groups, buckets, rounds, matches).
- Every `teamIds` entry exists, and every team used in a group or slot belongs to the tournament.
- In each group, the bucket slots add up to the number of teams.
- Every match's `roundId` exists and `bestOf ≥ 1`.
- A `from` slot refers to a match listed earlier, and each winner or loser feeds at most one slot.

## Phases

A tournament has any number of phases in display order. Each phase has a `kind`:

**`groups`**: one or more groups. Each group has `teamIds` and `buckets`, and each bucket has `slots` (how many teams it holds). The player drags teams into the slots.
- Swiss: one group with buckets `3-0` (2 slots), `3-1` (3), `3-2` (3), `2-3` (3), `1-3` (3), `0-3` (2)
- Round robin / GSL: several groups with buckets `Advance` (2) and `Out` (2), or `1st`, `2nd`, ...
- Once results are final, set `standings: { groupId: { bucketId: [teamIds] } }`

**`bracket`**: `rounds` (columns, grouped into rows by `section`) and `matches`. Each side of a match is a `Slot`:
- `{"teamId": "spirit"}`: a known team
- `{"from": "ub1", "take": "winner"}` or `"loser"`: fed by another match. This covers single elimination, double elimination and gauntlets.
- `{"tbd": true, "label": "Seed 1"}`: not known yet. Replace it with `teamId` when seeding is known.
- Set `results: { matchId: { "winner": teamId, "score": "2–1" } }` as series finish.

The player picks a winner for every match, and their winners carry forward through the `from` links. A pick can carry forward before the opponent is known; a loser only carries forward once both sides are known.

**Grade bracket picks by side, not by team.** If the player picked side `a` of a match and side `a` won, the pick is correct, even when a different team than they predicted came through that slot. For example, a player picks A to win UB1 and UB5, but B wins UB1 and then UB5: their UB5 pick counts as correct. The UI grades it this way (`gradeMatch` in `front/src/lib/picks.ts`), and the backend's scoring should match. Matches must be listed so that a match comes after every match it is fed from.

The `status` lifecycle is `upcoming` → `open` → `locked` → `completed`. The UI only lets the player edit picks while a phase is `open`.

## Picks shapes

```jsonc
// groups: one entry per slot; null means the slot is empty (partial picks are allowed)
{ "kind": "groups", "groups": { "swiss": { "3-0": ["spirit", "falcons"], "3-1": ["xg", null, null], ... } } }

// bracket
{ "kind": "bracket", "winners": { "ub1": "falcons", "ub2": "tundra", "gf": "falcons" } }
```

The server should validate picks: every team belongs to its group, no team appears twice, slot counts match the buckets, and every bracket winner is a team that can actually reach that match given the player's other picks.

## Running against your backend

```sh
cd front
npm install
npm run dev        # mock API, no backend needed
npm run dev:http   # real API: proxies /api to http://localhost:8080 (override with API_TARGET=...)
npm run build      # static files in front/dist, ready for Go to serve
```

Routing is hash-based (`#/t/{id}/{phaseId}`), so Go only needs to serve `index.html` and `/assets/*`.

Note: Go encodes nil slices and maps as `null`. Initialize arrays the UI iterates over (`teams`, `phases`, `groups`, `teamIds`, `buckets`, `rounds`, `matches`, `entries`) to empty values instead of leaving them nil.
