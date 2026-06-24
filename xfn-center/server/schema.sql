CREATE TABLE IF NOT EXISTS sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'jira-mcp',
  started_at TEXT NOT NULL,
  completed_at TEXT,
  issue_count INTEGER NOT NULL DEFAULT 0,
  page_count INTEGER NOT NULL DEFAULT 0,
  error TEXT
);

CREATE TABLE IF NOT EXISTS xfn_rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_key TEXT UNIQUE,
  jira_url TEXT,
  confluence_url TEXT,
  scrum_team TEXT NOT NULL,
  alli_group TEXT NOT NULL,
  sprint_iteration TEXT NOT NULL,
  product_goal TEXT NOT NULL DEFAULT '',
  sprint_goal TEXT NOT NULL DEFAULT '',
  goal_met INTEGER NOT NULL DEFAULT 0,
  confidence TEXT NOT NULL DEFAULT 'Not Yet Known',
  health TEXT NOT NULL DEFAULT 'Unknown',
  risk_level TEXT NOT NULL DEFAULT 'Low',
  risks TEXT NOT NULL DEFAULT '[]',
  needs TEXT NOT NULL DEFAULT '[]',
  impacts TEXT NOT NULL DEFAULT '[]',
  progress TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual',
  raw_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL,
  last_synced_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  row_id INTEGER NOT NULL,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  source TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'local-user',
  changed_at TEXT NOT NULL,
  FOREIGN KEY (row_id) REFERENCES xfn_rows(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_xfn_rows_team ON xfn_rows(scrum_team);
CREATE INDEX IF NOT EXISTS idx_xfn_rows_group ON xfn_rows(alli_group);
CREATE INDEX IF NOT EXISTS idx_xfn_rows_sprint ON xfn_rows(sprint_iteration);
CREATE INDEX IF NOT EXISTS idx_audit_entries_row ON audit_entries(row_id);
