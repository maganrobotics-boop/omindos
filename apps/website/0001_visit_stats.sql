CREATE TABLE IF NOT EXISTS visit_totals (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  visits INTEGER NOT NULL DEFAULT 0 CHECK (visits >= 0)
);

INSERT OR IGNORE INTO visit_totals (id, visits) VALUES (1, 0);

CREATE TABLE IF NOT EXISTS visit_recent (
  minute_bucket INTEGER NOT NULL,
  country_code TEXT NOT NULL CHECK (length(country_code) = 2),
  visits INTEGER NOT NULL DEFAULT 0 CHECK (visits >= 0),
  PRIMARY KEY (minute_bucket, country_code)
);

CREATE INDEX IF NOT EXISTS idx_visit_recent_bucket
  ON visit_recent (minute_bucket);

CREATE TABLE IF NOT EXISTS visit_country (
  country_code TEXT PRIMARY KEY CHECK (length(country_code) = 2),
  visits INTEGER NOT NULL DEFAULT 0 CHECK (visits >= 0)
);
