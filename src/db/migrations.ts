export interface MigrationDefinition {
  version: string;
  description: string;
  sql: string;
}

export const migrations: MigrationDefinition[] = [
  {
    version: '0001_init',
    description: 'Initial SQLite schema for orchestration state and auth',
    sql: `
      CREATE TABLE service_state (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE app_user (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        disabled INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE app_session (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        idle_expires_at TEXT NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        FOREIGN KEY (user_id) REFERENCES app_user(id)
      );

      CREATE INDEX idx_app_session_user_id ON app_session(user_id);
      CREATE INDEX idx_app_session_expires_at ON app_session(expires_at);
      CREATE INDEX idx_app_session_idle_expires_at ON app_session(idle_expires_at);

      CREATE TABLE media_item_state (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        media_key TEXT NOT NULL UNIQUE,
        media_type TEXT NOT NULL,
        arr_id INTEGER NOT NULL,
        parent_arr_id INTEGER,
        title TEXT NOT NULL,
        monitored INTEGER NOT NULL,
        release_date TEXT,
        wanted_state TEXT NOT NULL,
        in_queue INTEGER NOT NULL DEFAULT 0,
        retry_count INTEGER NOT NULL DEFAULT 0,
        last_search_at TEXT,
        last_grab_at TEXT,
        next_eligible_at TEXT,
        suppressed_until TEXT,
        suppression_reason TEXT,
        last_seen_at TEXT NOT NULL,
        state_hash TEXT NOT NULL
      );

      CREATE INDEX idx_media_item_state_wanted_state ON media_item_state(wanted_state);
      CREATE INDEX idx_media_item_state_next_eligible_at ON media_item_state(next_eligible_at);
      CREATE INDEX idx_media_item_state_suppressed_until ON media_item_state(suppressed_until);
      CREATE INDEX idx_media_item_state_in_queue ON media_item_state(in_queue);

      CREATE TABLE run_history (
        id TEXT PRIMARY KEY,
        run_type TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        status TEXT NOT NULL,
        candidate_count INTEGER NOT NULL DEFAULT 0,
        dispatch_count INTEGER NOT NULL DEFAULT 0,
        skip_count INTEGER NOT NULL DEFAULT 0,
        error_count INTEGER NOT NULL DEFAULT 0,
        summary_json TEXT NOT NULL
      );

      CREATE INDEX idx_run_history_started_at ON run_history(started_at);
      CREATE INDEX idx_run_history_status ON run_history(status);

      CREATE TABLE search_attempt (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        media_key TEXT NOT NULL,
        app TEXT NOT NULL,
        wanted_state TEXT NOT NULL,
        decision TEXT NOT NULL,
        reason_code TEXT NOT NULL,
        dry_run INTEGER NOT NULL,
        arr_command_id INTEGER,
        attempted_at TEXT NOT NULL,
        completed_at TEXT,
        outcome TEXT,
        FOREIGN KEY (run_id) REFERENCES run_history(id)
      );

      CREATE INDEX idx_search_attempt_run_id ON search_attempt(run_id);
      CREATE INDEX idx_search_attempt_media_key ON search_attempt(media_key);
      CREATE INDEX idx_search_attempt_attempted_at ON search_attempt(attempted_at);
      CREATE INDEX idx_search_attempt_reason_code ON search_attempt(reason_code);

      CREATE TABLE release_suppression (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        media_key TEXT NOT NULL,
        fingerprint_type TEXT NOT NULL,
        fingerprint_value TEXT NOT NULL,
        reason TEXT NOT NULL,
        source TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );

      CREATE UNIQUE INDEX uq_release_suppression_active
      ON release_suppression(media_key, fingerprint_type, fingerprint_value, expires_at);
      CREATE INDEX idx_release_suppression_media_key ON release_suppression(media_key);
      CREATE INDEX idx_release_suppression_expires_at ON release_suppression(expires_at);

      CREATE TABLE transmission_torrent_state (
        hash_string TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status INTEGER NOT NULL,
        percent_done REAL NOT NULL,
        error_code INTEGER,
        error_string TEXT,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        linked_media_key TEXT,
        removed_at TEXT,
        removal_reason TEXT,
        no_progress_since TEXT
      );

      CREATE INDEX idx_transmission_torrent_state_linked_media_key
      ON transmission_torrent_state(linked_media_key);
      CREATE INDEX idx_transmission_torrent_state_removed_at
      ON transmission_torrent_state(removed_at);

      CREATE TABLE login_attempt (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        ip_address TEXT,
        attempted_at TEXT NOT NULL,
        success INTEGER NOT NULL
      );

      CREATE INDEX idx_login_attempt_username_attempted_at
      ON login_attempt(username, attempted_at);
    `,
  },
];
