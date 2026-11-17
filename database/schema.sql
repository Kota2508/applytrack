PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  company TEXT NOT NULL CHECK(length(company) BETWEEN 1 AND 120),
  role TEXT NOT NULL CHECK(length(role) BETWEEN 1 AND 120),
  job_url TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK(status IN ('saved','applied','screening','interview','offer','accepted','rejected','withdrawn')),
  applied_at TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_updated ON applications(updated_at DESC);
CREATE TABLE IF NOT EXISTS activity (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  details TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_application ON activity(application_id, created_at DESC);
