import type { Database as SqliteDatabase } from 'better-sqlite3';

export interface ServiceStateRecord<T> {
  key: string;
  value: T;
  updatedAt: string;
}

export interface AppUserRecord {
  id: string;
  username: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
  disabled: boolean;
}

export interface AppSessionRecord {
  id: string;
  userId: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  idleExpiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface LoginAttemptRecord {
  username: string;
  ipAddress: string | null;
  attemptedAt: string;
  success: boolean;
}

export interface MediaItemStateRecord {
  mediaKey: string;
  mediaType: string;
  arrId: number;
  parentArrId: number | null;
  title: string;
  monitored: boolean;
  releaseDate: string | null;
  wantedState: string;
  inQueue: boolean;
  retryCount: number;
  lastSearchAt: string | null;
  lastGrabAt: string | null;
  nextEligibleAt: string | null;
  suppressedUntil: string | null;
  suppressionReason: string | null;
  lastSeenAt: string;
  stateHash: string;
}

export interface RunHistoryRecord {
  id: string;
  runType: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  candidateCount: number;
  dispatchCount: number;
  skipCount: number;
  errorCount: number;
  summary: Record<string, unknown>;
}

export interface ActivityLogRecord {
  id?: number;
  occurredAt: string;
  level: 'info' | 'warn' | 'error';
  source: string;
  stage: string;
  message: string;
  detail: string | null;
  runId: string | null;
  runType: string | null;
  progressCurrent: number | null;
  progressTotal: number | null;
  metadata: Record<string, unknown>;
}

interface RunHistoryRow {
  id: string;
  run_type: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  candidate_count: number;
  dispatch_count: number;
  skip_count: number;
  error_count: number;
  summary_json: string;
}

export interface SearchAttemptRecord {
  runId: string;
  mediaKey: string;
  app: string;
  wantedState: string;
  decision: string;
  reasonCode: string;
  dryRun: boolean;
  arrCommandId: number | null;
  attemptedAt: string;
  completedAt: string | null;
  outcome: string | null;
}

interface ActivityLogRow {
  id: number;
  occurred_at: string;
  level: 'info' | 'warn' | 'error';
  source: string;
  stage: string;
  message: string;
  detail: string | null;
  run_id: string | null;
  run_type: string | null;
  progress_current: number | null;
  progress_total: number | null;
  metadata_json: string;
}

interface SearchAttemptRow {
  run_id: string;
  media_key: string;
  app: string;
  wanted_state: string;
  decision: string;
  reason_code: string;
  dry_run: number;
  arr_command_id: number | null;
  attempted_at: string;
  completed_at: string | null;
  outcome: string | null;
}

export interface ReleaseSuppressionRecord {
  id?: number;
  mediaKey: string;
  fingerprintType: string;
  fingerprintValue: string;
  reason: string;
  source: string;
  createdAt: string;
  expiresAt: string;
}

export interface TransmissionTorrentStateRecord {
  hashString: string;
  name: string;
  status: number;
  percentDone: number;
  errorCode: number | null;
  errorString: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  linkedMediaKey: string | null;
  removedAt: string | null;
  removalReason: string | null;
  noProgressSince: string | null;
}

interface MediaItemStateRow {
  media_key: string;
  media_type: string;
  arr_id: number;
  parent_arr_id: number | null;
  title: string;
  monitored: number;
  release_date: string | null;
  wanted_state: string;
  in_queue: number;
  retry_count: number;
  last_search_at: string | null;
  last_grab_at: string | null;
  next_eligible_at: string | null;
  suppressed_until: string | null;
  suppression_reason: string | null;
  last_seen_at: string;
  state_hash: string;
}

const encodeJson = (value: unknown): string => JSON.stringify(value);
const decodeJson = <T>(value: string): T => JSON.parse(value) as T;
const toBoolean = (value: number): boolean => value === 1;
const fromBoolean = (value: boolean): number => (value ? 1 : 0);

const toMediaItemStateRecord = (row: MediaItemStateRow): MediaItemStateRecord => {
  return {
    mediaKey: row.media_key,
    mediaType: row.media_type,
    arrId: row.arr_id,
    parentArrId: row.parent_arr_id,
    title: row.title,
    monitored: toBoolean(row.monitored),
    releaseDate: row.release_date,
    wantedState: row.wanted_state,
    inQueue: toBoolean(row.in_queue),
    retryCount: row.retry_count,
    lastSearchAt: row.last_search_at,
    lastGrabAt: row.last_grab_at,
    nextEligibleAt: row.next_eligible_at,
    suppressedUntil: row.suppressed_until,
    suppressionReason: row.suppression_reason,
    lastSeenAt: row.last_seen_at,
    stateHash: row.state_hash,
  };
};

const toRunHistoryRecord = (row: RunHistoryRow): RunHistoryRecord => {
  return {
    id: row.id,
    runType: row.run_type,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: row.status,
    candidateCount: row.candidate_count,
    dispatchCount: row.dispatch_count,
    skipCount: row.skip_count,
    errorCount: row.error_count,
    summary: decodeJson<Record<string, unknown>>(row.summary_json),
  };
};

const toSearchAttemptRecord = (row: SearchAttemptRow): SearchAttemptRecord => {
  return {
    runId: row.run_id,
    mediaKey: row.media_key,
    app: row.app,
    wantedState: row.wanted_state,
    decision: row.decision,
    reasonCode: row.reason_code,
    dryRun: toBoolean(row.dry_run),
    arrCommandId: row.arr_command_id,
    attemptedAt: row.attempted_at,
    completedAt: row.completed_at,
    outcome: row.outcome,
  };
};

const toActivityLogRecord = (row: ActivityLogRow): ActivityLogRecord => {
  return {
    id: row.id,
    occurredAt: row.occurred_at,
    level: row.level,
    source: row.source,
    stage: row.stage,
    message: row.message,
    detail: row.detail,
    runId: row.run_id,
    runType: row.run_type,
    progressCurrent: row.progress_current,
    progressTotal: row.progress_total,
    metadata: decodeJson<Record<string, unknown>>(row.metadata_json),
  };
};

export const createRepositories = (database: SqliteDatabase) => {
  const serviceState = {
    get<T>(key: string): ServiceStateRecord<T> | null {
      const row = database
        .prepare<
          [string],
          { key: string; value_json: string; updated_at: string } | undefined
        >('SELECT key, value_json, updated_at FROM service_state WHERE key = ?')
        .get(key);

      if (!row) {
        return null;
      }

      return {
        key: row.key,
        value: decodeJson<T>(row.value_json),
        updatedAt: row.updated_at,
      };
    },
    set<T>(record: ServiceStateRecord<T>): void {
      database
        .prepare(
          `
            INSERT INTO service_state (key, value_json, updated_at)
            VALUES (@key, @value_json, @updated_at)
            ON CONFLICT(key) DO UPDATE SET
              value_json = excluded.value_json,
              updated_at = excluded.updated_at
          `
        )
        .run({
          key: record.key,
          value_json: encodeJson(record.value),
          updated_at: record.updatedAt,
        });
    },
    delete(key: string): void {
      database.prepare('DELETE FROM service_state WHERE key = ?').run(key);
    },
  };

  const appUsers = {
    count(): number {
      const row = database
        .prepare<
          [],
          { total: number } | undefined
        >('SELECT COUNT(*) AS total FROM app_user')
        .get();

      return row?.total ?? 0;
    },
    create(record: AppUserRecord): void {
      database
        .prepare(
          `
            INSERT INTO app_user (id, username, password_hash, created_at, updated_at, disabled)
            VALUES (@id, @username, @password_hash, @created_at, @updated_at, @disabled)
          `
        )
        .run({
          id: record.id,
          username: record.username,
          password_hash: record.passwordHash,
          created_at: record.createdAt,
          updated_at: record.updatedAt,
          disabled: fromBoolean(record.disabled),
        });
    },
    findByUsername(username: string): AppUserRecord | null {
      const row = database
        .prepare<
          [string],
          | {
              id: string;
              username: string;
              password_hash: string;
              created_at: string;
              updated_at: string;
              disabled: number;
            }
          | undefined
        >(
          `
            SELECT id, username, password_hash, created_at, updated_at, disabled
            FROM app_user
            WHERE username = ?
          `
        )
        .get(username);

      if (!row) {
        return null;
      }

      return {
        id: row.id,
        username: row.username,
        passwordHash: row.password_hash,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        disabled: toBoolean(row.disabled),
      };
    },
    findById(id: string): AppUserRecord | null {
      const row = database
        .prepare<
          [string],
          | {
              id: string;
              username: string;
              password_hash: string;
              created_at: string;
              updated_at: string;
              disabled: number;
            }
          | undefined
        >(
          `
            SELECT id, username, password_hash, created_at, updated_at, disabled
            FROM app_user
            WHERE id = ?
          `
        )
        .get(id);

      if (!row) {
        return null;
      }

      return {
        id: row.id,
        username: row.username,
        passwordHash: row.password_hash,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        disabled: toBoolean(row.disabled),
      };
    },
    deleteAll(): void {
      database.prepare('DELETE FROM app_user').run();
    },
  };

  const appSessions = {
    create(record: AppSessionRecord): void {
      database
        .prepare(
          `
            INSERT INTO app_session (
              id, user_id, created_at, last_seen_at, expires_at, idle_expires_at, ip_address, user_agent
            )
            VALUES (
              @id, @user_id, @created_at, @last_seen_at, @expires_at, @idle_expires_at, @ip_address, @user_agent
            )
          `
        )
        .run({
          id: record.id,
          user_id: record.userId,
          created_at: record.createdAt,
          last_seen_at: record.lastSeenAt,
          expires_at: record.expiresAt,
          idle_expires_at: record.idleExpiresAt,
          ip_address: record.ipAddress,
          user_agent: record.userAgent,
        });
    },
    findById(id: string): AppSessionRecord | null {
      const row = database
        .prepare<
          [string],
          | {
              id: string;
              user_id: string;
              created_at: string;
              last_seen_at: string;
              expires_at: string;
              idle_expires_at: string;
              ip_address: string | null;
              user_agent: string | null;
            }
          | undefined
        >(
          `
            SELECT id, user_id, created_at, last_seen_at, expires_at, idle_expires_at, ip_address, user_agent
            FROM app_session
            WHERE id = ?
          `
        )
        .get(id);

      if (!row) {
        return null;
      }

      return {
        id: row.id,
        userId: row.user_id,
        createdAt: row.created_at,
        lastSeenAt: row.last_seen_at,
        expiresAt: row.expires_at,
        idleExpiresAt: row.idle_expires_at,
        ipAddress: row.ip_address,
        userAgent: row.user_agent,
      };
    },
    touch(id: string, lastSeenAt: string, idleExpiresAt: string): void {
      database
        .prepare(
          `
            UPDATE app_session
            SET last_seen_at = ?, idle_expires_at = ?
            WHERE id = ?
          `
        )
        .run(lastSeenAt, idleExpiresAt, id);
    },
    deleteById(id: string): void {
      database.prepare('DELETE FROM app_session WHERE id = ?').run(id);
    },
    deleteExpired(nowIso: string): number {
      const result = database
        .prepare(
          `
            DELETE FROM app_session
            WHERE expires_at <= ? OR idle_expires_at <= ?
          `
        )
        .run(nowIso, nowIso);

      return result.changes;
    },
    deleteAll(): void {
      database.prepare('DELETE FROM app_session').run();
    },
  };

  const loginAttempts = {
    record(record: LoginAttemptRecord): void {
      database
        .prepare(
          `
            INSERT INTO login_attempt (username, ip_address, attempted_at, success)
            VALUES (@username, @ip_address, @attempted_at, @success)
          `
        )
        .run({
          username: record.username,
          ip_address: record.ipAddress,
          attempted_at: record.attemptedAt,
          success: fromBoolean(record.success),
        });
    },
    countFailuresSince(username: string, sinceIso: string): number {
      const row = database
        .prepare<[string, string], { total: number } | undefined>(
          `
            SELECT COUNT(*) AS total
            FROM login_attempt
            WHERE username = ? AND success = 0 AND attempted_at >= ?
          `
        )
        .get(username, sinceIso);

      return row?.total ?? 0;
    },
  };

  const mediaItemState = {
    upsert(record: MediaItemStateRecord): void {
      database
        .prepare(
          `
            INSERT INTO media_item_state (
              media_key, media_type, arr_id, parent_arr_id, title, monitored, release_date, wanted_state,
              in_queue, retry_count, last_search_at, last_grab_at, next_eligible_at, suppressed_until,
              suppression_reason, last_seen_at, state_hash
            )
            VALUES (
              @media_key, @media_type, @arr_id, @parent_arr_id, @title, @monitored, @release_date, @wanted_state,
              @in_queue, @retry_count, @last_search_at, @last_grab_at, @next_eligible_at, @suppressed_until,
              @suppression_reason, @last_seen_at, @state_hash
            )
            ON CONFLICT(media_key) DO UPDATE SET
              media_type = excluded.media_type,
              arr_id = excluded.arr_id,
              parent_arr_id = excluded.parent_arr_id,
              title = excluded.title,
              monitored = excluded.monitored,
              release_date = excluded.release_date,
              wanted_state = excluded.wanted_state,
              in_queue = excluded.in_queue,
              retry_count = excluded.retry_count,
              last_search_at = excluded.last_search_at,
              last_grab_at = excluded.last_grab_at,
              next_eligible_at = excluded.next_eligible_at,
              suppressed_until = excluded.suppressed_until,
              suppression_reason = excluded.suppression_reason,
              last_seen_at = excluded.last_seen_at,
              state_hash = excluded.state_hash
          `
        )
        .run({
          media_key: record.mediaKey,
          media_type: record.mediaType,
          arr_id: record.arrId,
          parent_arr_id: record.parentArrId,
          title: record.title,
          monitored: fromBoolean(record.monitored),
          release_date: record.releaseDate,
          wanted_state: record.wantedState,
          in_queue: fromBoolean(record.inQueue),
          retry_count: record.retryCount,
          last_search_at: record.lastSearchAt,
          last_grab_at: record.lastGrabAt,
          next_eligible_at: record.nextEligibleAt,
          suppressed_until: record.suppressedUntil,
          suppression_reason: record.suppressionReason,
          last_seen_at: record.lastSeenAt,
          state_hash: record.stateHash,
        });
    },
    getByMediaKey(mediaKey: string): MediaItemStateRecord | null {
      const row = database
        .prepare<
          [string],
          MediaItemStateRow | undefined
        >('SELECT * FROM media_item_state WHERE media_key = ?')
        .get(mediaKey);

      if (!row) {
        return null;
      }

      return toMediaItemStateRecord(row);
    },
    listByMediaType(mediaType: string): MediaItemStateRecord[] {
      const rows = database
        .prepare<
          [string],
          MediaItemStateRow
        >('SELECT * FROM media_item_state WHERE media_type = ? ORDER BY media_key ASC')
        .all(mediaType);

      return rows.map((row) => toMediaItemStateRecord(row));
    },
    count(): number {
      const row = database
        .prepare<
          [],
          { total: number } | undefined
        >('SELECT COUNT(*) AS total FROM media_item_state')
        .get();

      return row?.total ?? 0;
    },
  };

  const runHistory = {
    create(record: RunHistoryRecord): void {
      database
        .prepare(
          `
            INSERT INTO run_history (
              id, run_type, started_at, finished_at, status, candidate_count, dispatch_count,
              skip_count, error_count, summary_json
            )
            VALUES (
              @id, @run_type, @started_at, @finished_at, @status, @candidate_count, @dispatch_count,
              @skip_count, @error_count, @summary_json
            )
          `
        )
        .run({
          id: record.id,
          run_type: record.runType,
          started_at: record.startedAt,
          finished_at: record.finishedAt,
          status: record.status,
          candidate_count: record.candidateCount,
          dispatch_count: record.dispatchCount,
          skip_count: record.skipCount,
          error_count: record.errorCount,
          summary_json: encodeJson(record.summary),
        });
    },
    update(record: RunHistoryRecord): void {
      database
        .prepare(
          `
            UPDATE run_history
            SET run_type = @run_type,
                started_at = @started_at,
                finished_at = @finished_at,
                status = @status,
                candidate_count = @candidate_count,
                dispatch_count = @dispatch_count,
                skip_count = @skip_count,
                error_count = @error_count,
                summary_json = @summary_json
            WHERE id = @id
          `
        )
        .run({
          id: record.id,
          run_type: record.runType,
          started_at: record.startedAt,
          finished_at: record.finishedAt,
          status: record.status,
          candidate_count: record.candidateCount,
          dispatch_count: record.dispatchCount,
          skip_count: record.skipCount,
          error_count: record.errorCount,
          summary_json: encodeJson(record.summary),
        });
    },
    getById(id: string): RunHistoryRecord | null {
      const row = database
        .prepare<
          [string],
          RunHistoryRow | undefined
        >('SELECT * FROM run_history WHERE id = ?')
        .get(id);

      if (!row) {
        return null;
      }

      return toRunHistoryRecord(row);
    },
    getLatest(): RunHistoryRecord | null {
      const row = database
        .prepare<
          [],
          RunHistoryRow | undefined
        >('SELECT * FROM run_history ORDER BY started_at DESC LIMIT 1')
        .get();

      if (!row) {
        return null;
      }

      return toRunHistoryRecord(row);
    },
    listRecent(limit: number): RunHistoryRecord[] {
      const rows = database
        .prepare<
          [number],
          RunHistoryRow
        >('SELECT * FROM run_history ORDER BY started_at DESC LIMIT ?')
        .all(limit);

      return rows.map((row) => toRunHistoryRecord(row));
    },
  };

  const activityLog = {
    insert(record: ActivityLogRecord): number {
      const result = database
        .prepare(
          `
            INSERT INTO activity_log (
              occurred_at, level, source, stage, message, detail, run_id, run_type,
              progress_current, progress_total, metadata_json
            )
            VALUES (
              @occurred_at, @level, @source, @stage, @message, @detail, @run_id, @run_type,
              @progress_current, @progress_total, @metadata_json
            )
          `
        )
        .run({
          occurred_at: record.occurredAt,
          level: record.level,
          source: record.source,
          stage: record.stage,
          message: record.message,
          detail: record.detail,
          run_id: record.runId,
          run_type: record.runType,
          progress_current: record.progressCurrent,
          progress_total: record.progressTotal,
          metadata_json: encodeJson(record.metadata),
        });

      return Number(result.lastInsertRowid);
    },
    listRecent(limit: number): ActivityLogRecord[] {
      const rows = database
        .prepare<[number], ActivityLogRow>(
          `
            SELECT id, occurred_at, level, source, stage, message, detail, run_id, run_type,
                   progress_current, progress_total, metadata_json
            FROM activity_log
            ORDER BY occurred_at DESC, id DESC
            LIMIT ?
          `
        )
        .all(limit);

      return rows.map((row) => toActivityLogRecord(row));
    },
    pruneToLimit(limit: number): number {
      const result = database
        .prepare(
          `
            DELETE FROM activity_log
            WHERE id NOT IN (
              SELECT id
              FROM activity_log
              ORDER BY occurred_at DESC, id DESC
              LIMIT ?
            )
          `
        )
        .run(limit);

      return result.changes;
    },
  };

  const searchAttempts = {
    insertMany(records: SearchAttemptRecord[]): void {
      const insert = database.prepare(
        `
          INSERT INTO search_attempt (
            run_id, media_key, app, wanted_state, decision, reason_code, dry_run,
            arr_command_id, attempted_at, completed_at, outcome
          )
          VALUES (
            @run_id, @media_key, @app, @wanted_state, @decision, @reason_code, @dry_run,
            @arr_command_id, @attempted_at, @completed_at, @outcome
          )
        `
      );

      const insertMany = database.transaction((batch: SearchAttemptRecord[]) => {
        for (const record of batch) {
          insert.run({
            run_id: record.runId,
            media_key: record.mediaKey,
            app: record.app,
            wanted_state: record.wantedState,
            decision: record.decision,
            reason_code: record.reasonCode,
            dry_run: fromBoolean(record.dryRun),
            arr_command_id: record.arrCommandId,
            attempted_at: record.attemptedAt,
            completed_at: record.completedAt,
            outcome: record.outcome,
          });
        }
      });

      insertMany(records);
    },
    listByRunId(runId: string): SearchAttemptRecord[] {
      const rows = database
        .prepare<[string], SearchAttemptRow>(
          `
            SELECT run_id, media_key, app, wanted_state, decision, reason_code, dry_run,
                   arr_command_id, attempted_at, completed_at, outcome
            FROM search_attempt
            WHERE run_id = ?
            ORDER BY attempted_at ASC, id ASC
          `
        )
        .all(runId);

      return rows.map((row) => toSearchAttemptRecord(row));
    },
    countLiveDispatchesSince(sinceIso: string): number {
      const row = database
        .prepare<[string], { total: number } | undefined>(
          `
            SELECT COUNT(*) AS total
            FROM search_attempt
            WHERE decision = 'dispatch'
              AND dry_run = 0
              AND attempted_at >= ?
          `
        )
        .get(sinceIso);

      return row?.total ?? 0;
    },
    getLatestLiveDispatchAttemptAt(): string | null {
      const row = database
        .prepare<[], { attempted_at: string } | undefined>(
          `
            SELECT attempted_at
            FROM search_attempt
            WHERE decision = 'dispatch'
              AND dry_run = 0
            ORDER BY attempted_at DESC, id DESC
            LIMIT 1
          `
        )
        .get();

      return row?.attempted_at ?? null;
    },
    listLiveDispatchAttemptTimesSince(sinceIso: string): string[] {
      const rows = database
        .prepare<[string], { attempted_at: string }>(
          `
            SELECT attempted_at
            FROM search_attempt
            WHERE decision = 'dispatch'
              AND dry_run = 0
              AND attempted_at >= ?
            ORDER BY attempted_at ASC, id ASC
          `
        )
        .all(sinceIso);

      return rows.map((row) => row.attempted_at);
    },
  };

  const releaseSuppressions = {
    create(record: ReleaseSuppressionRecord): number {
      const result = database
        .prepare(
          `
            INSERT INTO release_suppression (
              media_key, fingerprint_type, fingerprint_value, reason, source, created_at, expires_at
            )
            VALUES (
              @media_key, @fingerprint_type, @fingerprint_value, @reason, @source, @created_at, @expires_at
            )
          `
        )
        .run({
          media_key: record.mediaKey,
          fingerprint_type: record.fingerprintType,
          fingerprint_value: record.fingerprintValue,
          reason: record.reason,
          source: record.source,
          created_at: record.createdAt,
          expires_at: record.expiresAt,
        });

      return Number(result.lastInsertRowid);
    },
    listActive(nowIso: string): ReleaseSuppressionRecord[] {
      const rows = database
        .prepare<
          [string],
          {
            id: number;
            media_key: string;
            fingerprint_type: string;
            fingerprint_value: string;
            reason: string;
            source: string;
            created_at: string;
            expires_at: string;
          }
        >(
          `
            SELECT id, media_key, fingerprint_type, fingerprint_value, reason, source, created_at, expires_at
            FROM release_suppression
            WHERE expires_at > ?
            ORDER BY expires_at ASC, id ASC
          `
        )
        .all(nowIso);

      return rows.map((row) => ({
        id: row.id,
        mediaKey: row.media_key,
        fingerprintType: row.fingerprint_type,
        fingerprintValue: row.fingerprint_value,
        reason: row.reason,
        source: row.source,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
      }));
    },
    clearById(id: number): void {
      database.prepare('DELETE FROM release_suppression WHERE id = ?').run(id);
    },
  };

  const transmissionTorrentState = {
    upsert(record: TransmissionTorrentStateRecord): void {
      database
        .prepare(
          `
            INSERT INTO transmission_torrent_state (
              hash_string, name, status, percent_done, error_code, error_string, first_seen_at,
              last_seen_at, linked_media_key, removed_at, removal_reason, no_progress_since
            )
            VALUES (
              @hash_string, @name, @status, @percent_done, @error_code, @error_string, @first_seen_at,
              @last_seen_at, @linked_media_key, @removed_at, @removal_reason, @no_progress_since
            )
            ON CONFLICT(hash_string) DO UPDATE SET
              name = excluded.name,
              status = excluded.status,
              percent_done = excluded.percent_done,
              error_code = excluded.error_code,
              error_string = excluded.error_string,
              last_seen_at = excluded.last_seen_at,
              linked_media_key = excluded.linked_media_key,
              removed_at = excluded.removed_at,
              removal_reason = excluded.removal_reason,
              no_progress_since = excluded.no_progress_since
          `
        )
        .run({
          hash_string: record.hashString,
          name: record.name,
          status: record.status,
          percent_done: record.percentDone,
          error_code: record.errorCode,
          error_string: record.errorString,
          first_seen_at: record.firstSeenAt,
          last_seen_at: record.lastSeenAt,
          linked_media_key: record.linkedMediaKey,
          removed_at: record.removedAt,
          removal_reason: record.removalReason,
          no_progress_since: record.noProgressSince,
        });
    },
    getByHash(hashString: string): TransmissionTorrentStateRecord | null {
      const row = database
        .prepare<
          [string],
          | {
              hash_string: string;
              name: string;
              status: number;
              percent_done: number;
              error_code: number | null;
              error_string: string | null;
              first_seen_at: string;
              last_seen_at: string;
              linked_media_key: string | null;
              removed_at: string | null;
              removal_reason: string | null;
              no_progress_since: string | null;
            }
          | undefined
        >('SELECT * FROM transmission_torrent_state WHERE hash_string = ?')
        .get(hashString);

      if (!row) {
        return null;
      }

      return {
        hashString: row.hash_string,
        name: row.name,
        status: row.status,
        percentDone: row.percent_done,
        errorCode: row.error_code,
        errorString: row.error_string,
        firstSeenAt: row.first_seen_at,
        lastSeenAt: row.last_seen_at,
        linkedMediaKey: row.linked_media_key,
        removedAt: row.removed_at,
        removalReason: row.removal_reason,
        noProgressSince: row.no_progress_since,
      };
    },
    listRecent(limit: number): TransmissionTorrentStateRecord[] {
      const rows = database
        .prepare<
          [number],
          {
            hash_string: string;
            name: string;
            status: number;
            percent_done: number;
            error_code: number | null;
            error_string: string | null;
            first_seen_at: string;
            last_seen_at: string;
            linked_media_key: string | null;
            removed_at: string | null;
            removal_reason: string | null;
            no_progress_since: string | null;
          }
        >(
          `
            SELECT *
            FROM transmission_torrent_state
            ORDER BY COALESCE(removed_at, last_seen_at) DESC, hash_string ASC
            LIMIT ?
          `
        )
        .all(limit);

      return rows.map((row) => ({
        hashString: row.hash_string,
        name: row.name,
        status: row.status,
        percentDone: row.percent_done,
        errorCode: row.error_code,
        errorString: row.error_string,
        firstSeenAt: row.first_seen_at,
        lastSeenAt: row.last_seen_at,
        linkedMediaKey: row.linked_media_key,
        removedAt: row.removed_at,
        removalReason: row.removal_reason,
        noProgressSince: row.no_progress_since,
      }));
    },
  };

  return {
    serviceState,
    appUsers,
    appSessions,
    loginAttempts,
    mediaItemState,
    runHistory,
    activityLog,
    searchAttempts,
    releaseSuppressions,
    transmissionTorrentState,
  };
};

export type DatabaseRepositories = ReturnType<typeof createRepositories>;
