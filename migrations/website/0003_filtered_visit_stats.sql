-- Additive collection era. Legacy visit_* tables remain unmodified and unfiltered.
-- first_event_at is set by the first v2 collector event, not migration execution.
CREATE TABLE IF NOT EXISTS visit_collection_v2 (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  first_event_at INTEGER NOT NULL,
  metric TEXT NOT NULL CHECK (metric = 'filtered_page_views')
);

CREATE TABLE IF NOT EXISTS visit_totals_v2 (
  classification TEXT PRIMARY KEY CHECK (classification IN ('accepted_unknown', 'accepted_scored', 'excluded_verified_bot', 'excluded_low_score', 'excluded_automation_ua', 'excluded_prefetch')),
  visits INTEGER NOT NULL DEFAULT 0 CHECK (visits >= 0)
);

CREATE TABLE IF NOT EXISTS visit_recent_v2 (
  minute_bucket INTEGER NOT NULL,
  country_code TEXT NOT NULL CHECK (length(country_code) = 2),
  classification TEXT NOT NULL CHECK (classification IN ('accepted_unknown', 'accepted_scored', 'excluded_verified_bot', 'excluded_low_score', 'excluded_automation_ua', 'excluded_prefetch')),
  visits INTEGER NOT NULL DEFAULT 0 CHECK (visits >= 0),
  PRIMARY KEY (minute_bucket, country_code, classification)
);

CREATE INDEX IF NOT EXISTS idx_visit_recent_v2_bucket ON visit_recent_v2 (minute_bucket);

CREATE TABLE IF NOT EXISTS visit_country_v2 (
  country_code TEXT NOT NULL CHECK (length(country_code) = 2),
  classification TEXT NOT NULL CHECK (classification IN ('accepted_unknown', 'accepted_scored', 'excluded_verified_bot', 'excluded_low_score', 'excluded_automation_ua', 'excluded_prefetch')),
  visits INTEGER NOT NULL DEFAULT 0 CHECK (visits >= 0),
  PRIMARY KEY (country_code, classification)
);
