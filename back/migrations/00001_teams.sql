-- +goose Up 
CREATE TABLE teams (
  id text PRIMARY KEY, 
  name text NOT NULL,
  tag text NOT NULL,
  logo text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
-- +goose Down
DROP TABLE teams;

