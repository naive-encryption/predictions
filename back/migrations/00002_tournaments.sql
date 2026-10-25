-- +goose Up
CREATE TABLE tournaments (
  id text PRIMARY KEY,
  name text NOT NULL,
  subtitle text NOT NULL DEFAULT '',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL, 
  status text NOT NULL DEFAULT 'upcoming' CHECK (status IN('upcoming','live','completed')),
  CHECK (ends_at >= starts_at)
);

CREATE TABLE tournament_teams (
  tournament_id text NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  team_id text NOT NULL REFERENCES teams(id),
  PRIMARY KEY (tournament_id,team_id)
);

CREATE TABLE phases (
  tournament_id text NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE, 
  id text NOT NULL, 
  position int NOT NULL,
  kind text NOT NULL CHECK (kind in ('groups','bracket')),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'upcoming' CHECK (status in ('upcoming','open','locked','completed')),
  opens_at timestamptz,
  locks_at timestamptz,
  scoring text NOT NULL DEFAULT '',
  structure jsonb NOT NULL,
  standings jsonb NOT NULL DEFAULT '{}',
  results jsonb NOT NULL DEFAULT '{}',

  PRIMARY KEY (tournament_id,id)
);

-- +goose Down
DROP TABLE phases;
DROP TABLE tournament_teams;
DROP TABLE tournaments;
