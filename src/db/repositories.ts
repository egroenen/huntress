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
  externalPath: string | null;
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

export type CandidatePreviewApp = 'sonarr' | 'radarr';
export type CandidatePreviewDecision = 'dispatch' | 'skip';
export type CandidatePreviewSort =
  | 'engine'
  | 'title_asc'
  | 'title_desc'
  | 'retry_desc'
  | 'retry_asc'
  | 'next_eligible_asc'
  | 'next_eligible_desc';

export interface CandidatePreviewRecord {
  mediaKey: string;
  app: CandidatePreviewApp;
  title: string;
  wantedState: string;
  decision: CandidatePreviewDecision;
  reasonCode: string;
  priorityBucket: string | null;
  retryCount: number;
  nextEligibleAt: string | null;
  sortKey: string | null;
}

export interface CandidatePreviewQuery {
  app: CandidatePreviewApp;
  nowIso: string;
  recentReleaseWindowDays: number;
  excludeUnreleased: boolean;
  excludeUnmonitored: boolean;
  appAvailable: boolean;
  panicDisableSearch: boolean;
  globalSearchBlocked: boolean;
  appDispatchLimit: number;
  effectiveGlobalDispatchLimit: number;
  query?: string | null;
  decision?: CandidatePreviewDecision | null;
  wantedState?: string | null;
}

export interface WantedPageCoverageRecord {
  app: 'sonarr' | 'radarr';
  collectionKind: 'missing' | 'cutoff';
  pageNumber: number;
  lastFetchedAt: string;
  lastFetchStatus: 'success' | 'failed';
  lastObservedTotalPages: number;
  lastObservedTotalRecords: number;
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

export interface RunHistoryFilter {
  runType?: string | null;
  status?: string | null;
  startedFrom?: string | null;
  startedTo?: string | null;
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

export interface ReleaseSuppressionFilter {
  query?: string | null;
}

export type TransmissionTorrentSort =
  | 'recent_desc'
  | 'recent_asc'
  | 'name_asc'
  | 'name_desc'
  | 'progress_desc'
  | 'progress_asc'
  | 'linked_media_asc'
  | 'linked_media_desc';

export type TransmissionTorrentGuardFilter =
  | 'all'
  | 'active'
  | 'stalling'
  | 'remove_soon'
  | 'stalled_removable'
  | 'error_removable'
  | 'removed'
  | 'complete';

export type TransmissionTorrentLinkedFilter = 'all' | 'linked' | 'unlinked';

export interface TransmissionTorrentFilter {
  nowIso: string;
  stallNoProgressForMs: number;
  sort: TransmissionTorrentSort;
  query?: string | null;
  guard?: TransmissionTorrentGuardFilter | null;
  linked?: TransmissionTorrentLinkedFilter | null;
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

interface ReleaseSuppressionRow {
  id: number;
  media_key: string;
  fingerprint_type: string;
  fingerprint_value: string;
  reason: string;
  source: string;
  created_at: string;
  expires_at: string;
}

interface TransmissionTorrentStateRow {
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

const CANDIDATE_SAFE_INTEGER = 9_007_199_254_740_991;

const buildReleaseSuppressionFilterSql = () => `
  FROM release_suppression
  LEFT JOIN media_item_state
    ON media_item_state.media_key = release_suppression.media_key
  WHERE release_suppression.expires_at > @nowIso
    AND (
      @queryFilter = ''
      OR lower(
        coalesce(media_item_state.title, '') || ' ' ||
        release_suppression.media_key || ' ' ||
        release_suppression.fingerprint_type || ' ' ||
        release_suppression.fingerprint_value || ' ' ||
        release_suppression.reason || ' ' ||
        release_suppression.source
      ) LIKE @queryLike
    )
`;

const buildReleaseSuppressionFilterParams = (
  nowIso: string,
  filter: ReleaseSuppressionFilter = {}
) => {
  const normalizedQuery = filter.query?.trim().toLowerCase() ?? '';

  return {
    nowIso,
    queryFilter: normalizedQuery,
    queryLike: normalizedQuery ? `%${normalizedQuery}%` : '',
  };
};

const buildTransmissionTorrentFilterCte = (sortClause: string) => `
  WITH annotated AS (
    SELECT
      transmission_torrent_state.hash_string,
      transmission_torrent_state.name,
      transmission_torrent_state.status,
      transmission_torrent_state.percent_done,
      transmission_torrent_state.error_code,
      transmission_torrent_state.error_string,
      transmission_torrent_state.first_seen_at,
      transmission_torrent_state.last_seen_at,
      transmission_torrent_state.linked_media_key,
      transmission_torrent_state.removed_at,
      transmission_torrent_state.removal_reason,
      transmission_torrent_state.no_progress_since,
      media_item_state.title AS linked_title,
      CASE transmission_torrent_state.status
        WHEN 0 THEN 'stopped'
        WHEN 1 THEN 'check wait'
        WHEN 2 THEN 'checking'
        WHEN 3 THEN 'download wait'
        WHEN 4 THEN 'downloading'
        WHEN 5 THEN 'seed wait'
        WHEN 6 THEN 'seeding'
        ELSE 'status ' || transmission_torrent_state.status
      END AS state_label,
      CASE
        WHEN transmission_torrent_state.removed_at IS NOT NULL THEN 'removed'
        WHEN COALESCE(transmission_torrent_state.error_code, 0) > 0
          THEN 'error_removable'
        WHEN transmission_torrent_state.percent_done >= 1 THEN 'complete'
        WHEN transmission_torrent_state.no_progress_since IS NULL THEN 'active'
        WHEN strftime('%s', transmission_torrent_state.no_progress_since) IS NULL
          THEN 'active'
        WHEN (
          CAST(strftime('%s', transmission_torrent_state.no_progress_since) AS INTEGER) * 1000
          + @stallNoProgressForMs
        ) <= (CAST(strftime('%s', @nowIso) AS INTEGER) * 1000)
          THEN 'stalled_removable'
        WHEN (
          CAST(strftime('%s', transmission_torrent_state.no_progress_since) AS INTEGER) * 1000
          + @stallNoProgressForMs
          - (CAST(strftime('%s', @nowIso) AS INTEGER) * 1000)
        ) <= 3600000
          THEN 'remove_soon'
        ELSE 'stalling'
      END AS guard_label,
      COALESCE(
        CAST(strftime(
          '%s',
          COALESCE(
            transmission_torrent_state.removed_at,
            transmission_torrent_state.last_seen_at
          )
        ) AS INTEGER),
        0
      ) AS recent_epoch
    FROM transmission_torrent_state
    LEFT JOIN media_item_state
      ON media_item_state.media_key = transmission_torrent_state.linked_media_key
  ),
  filtered AS (
    SELECT *
    FROM annotated
    WHERE (
      @linkedFilter = 'all'
      OR (@linkedFilter = 'linked' AND linked_media_key IS NOT NULL)
      OR (@linkedFilter = 'unlinked' AND linked_media_key IS NULL)
    )
      AND (@guardFilter = 'all' OR guard_label = @guardFilter)
      AND (
        @queryFilter = ''
        OR lower(
          name || ' ' ||
          coalesce(linked_title, '') || ' ' ||
          coalesce(linked_media_key, '') || ' ' ||
          coalesce(removal_reason, '') || ' ' ||
          replace(guard_label, '_', ' ') || ' ' ||
          state_label || ' ' ||
          coalesce(error_string, '')
        ) LIKE @queryLike
      )
  )
  SELECT
    hash_string,
    name,
    status,
    percent_done,
    error_code,
    error_string,
    first_seen_at,
    last_seen_at,
    linked_media_key,
    removed_at,
    removal_reason,
    no_progress_since
  FROM filtered
  ${sortClause}
`;

const buildTransmissionTorrentSortClause = (
  sort: TransmissionTorrentSort
): string => {
  switch (sort) {
    case 'recent_asc':
      return 'ORDER BY recent_epoch ASC, hash_string ASC';
    case 'name_asc':
      return 'ORDER BY name COLLATE NOCASE ASC, hash_string ASC';
    case 'name_desc':
      return 'ORDER BY name COLLATE NOCASE DESC, hash_string ASC';
    case 'progress_desc':
      return 'ORDER BY percent_done DESC, hash_string ASC';
    case 'progress_asc':
      return 'ORDER BY percent_done ASC, hash_string ASC';
    case 'linked_media_asc':
      return `
        ORDER BY
          CASE WHEN linked_media_key IS NULL THEN 1 ELSE 0 END ASC,
          coalesce(linked_title, linked_media_key, '') COLLATE NOCASE ASC,
          hash_string ASC
      `;
    case 'linked_media_desc':
      return `
        ORDER BY
          CASE WHEN linked_media_key IS NULL THEN 1 ELSE 0 END ASC,
          coalesce(linked_title, linked_media_key, '') COLLATE NOCASE DESC,
          hash_string ASC
      `;
    case 'recent_desc':
    default:
      return 'ORDER BY recent_epoch DESC, hash_string ASC';
  }
};

const buildTransmissionTorrentFilterParams = (
  filter: TransmissionTorrentFilter
) => {
  const normalizedQuery = filter.query?.trim().toLowerCase() ?? '';

  return {
    nowIso: filter.nowIso,
    stallNoProgressForMs: filter.stallNoProgressForMs,
    linkedFilter: filter.linked ?? 'all',
    guardFilter: filter.guard ?? 'all',
    queryFilter: normalizedQuery,
    queryLike: normalizedQuery ? `%${normalizedQuery}%` : '',
  };
};

const buildCandidatePreviewCte = (sortClause: string) => `
  WITH base AS (
    SELECT
      media_key,
      title,
      wanted_state,
      retry_count,
      next_eligible_at,
      last_search_at,
      release_date,
      monitored,
      in_queue,
      suppressed_until,
      CASE
        WHEN media_type = 'sonarr_episode' THEN 'sonarr'
        ELSE 'radarr'
      END AS app
    FROM media_item_state
    WHERE media_type = @mediaType
  ),
  annotated AS (
    SELECT
      base.*,
      CASE
        WHEN @appAvailable = 0 THEN 'SKIP_APP_UNAVAILABLE'
        WHEN @panicDisableSearch = 1 THEN 'SKIP_GLOBAL_PANIC_DISABLE'
        WHEN @globalSearchBlocked = 1 THEN 'SKIP_GLOBAL_SEARCH_BLOCKED'
        WHEN wanted_state = 'ignored' THEN 'SKIP_IGNORED_STATE'
        WHEN @excludeUnmonitored = 1 AND monitored = 0 THEN 'SKIP_UNMONITORED'
        WHEN @excludeUnreleased = 1
          AND release_date IS NOT NULL
          AND julianday(release_date) > julianday(@nowIso)
          THEN 'SKIP_UNRELEASED'
        WHEN in_queue = 1 THEN 'SKIP_IN_QUEUE'
        WHEN suppressed_until IS NOT NULL
          AND julianday(suppressed_until) > julianday(@nowIso)
          THEN 'SKIP_ITEM_SUPPRESSED'
        WHEN next_eligible_at IS NOT NULL
          AND julianday(next_eligible_at) > julianday(@nowIso)
          THEN 'SKIP_COOLDOWN_ACTIVE'
        ELSE NULL
      END AS hard_skip_reason,
      CASE
        WHEN wanted_state = 'missing'
          AND release_date IS NOT NULL
          AND (julianday(@nowIso) - julianday(release_date)) BETWEEN 0 AND @recentReleaseWindowDays
          THEN 'missing_recent'
        WHEN wanted_state = 'missing' THEN 'missing_backlog'
        WHEN wanted_state = 'cutoff_unmet'
          AND release_date IS NOT NULL
          AND (julianday(@nowIso) - julianday(release_date)) BETWEEN 0 AND @recentReleaseWindowDays
          THEN 'cutoff_recent'
        WHEN wanted_state = 'cutoff_unmet' THEN 'cutoff_backlog'
        ELSE NULL
      END AS priority_bucket,
      CASE
        WHEN wanted_state = 'missing'
          AND release_date IS NOT NULL
          AND (julianday(@nowIso) - julianday(release_date)) BETWEEN 0 AND @recentReleaseWindowDays
          THEN 'ELIGIBLE_MISSING_RECENT'
        WHEN wanted_state = 'missing' THEN 'ELIGIBLE_MISSING_BACKLOG'
        WHEN wanted_state = 'cutoff_unmet'
          AND release_date IS NOT NULL
          AND (julianday(@nowIso) - julianday(release_date)) BETWEEN 0 AND @recentReleaseWindowDays
          THEN 'ELIGIBLE_CUTOFF_RECENT'
        WHEN wanted_state = 'cutoff_unmet' THEN 'ELIGIBLE_CUTOFF_BACKLOG'
        ELSE NULL
      END AS dispatch_reason_code,
      CASE
        WHEN wanted_state = 'missing'
          AND release_date IS NOT NULL
          AND (julianday(@nowIso) - julianday(release_date)) BETWEEN 0 AND @recentReleaseWindowDays
          THEN 0
        WHEN wanted_state = 'missing' THEN 1
        WHEN wanted_state = 'cutoff_unmet'
          AND release_date IS NOT NULL
          AND (julianday(@nowIso) - julianday(release_date)) BETWEEN 0 AND @recentReleaseWindowDays
          THEN 2
        WHEN wanted_state = 'cutoff_unmet' THEN 3
        ELSE 99
      END AS bucket_rank
    FROM base
  ),
  ranked AS (
    SELECT
      annotated.*,
      printf(
        '%02d:%016d:%016d:%016d:%s',
        bucket_rank,
        COALESCE(CAST(strftime('%s', next_eligible_at) AS INTEGER), 0),
        ${CANDIDATE_SAFE_INTEGER} - COALESCE(CAST(strftime('%s', release_date) AS INTEGER), 0),
        COALESCE(CAST(strftime('%s', last_search_at) AS INTEGER), 0),
        media_key
      ) AS sort_key,
      ROW_NUMBER() OVER (
        ORDER BY
          bucket_rank ASC,
          COALESCE(CAST(strftime('%s', next_eligible_at) AS INTEGER), 0) ASC,
          COALESCE(CAST(strftime('%s', release_date) AS INTEGER), 0) DESC,
          COALESCE(CAST(strftime('%s', last_search_at) AS INTEGER), 0) ASC,
          media_key ASC
      ) AS eligible_rank
    FROM annotated
    WHERE hard_skip_reason IS NULL
      AND priority_bucket IS NOT NULL
  ),
  decisions AS (
    SELECT
      annotated.media_key,
      annotated.app,
      annotated.title,
      annotated.wanted_state,
      annotated.retry_count,
      annotated.next_eligible_at,
      CASE
        WHEN annotated.hard_skip_reason IS NOT NULL THEN 'skip'
        WHEN annotated.priority_bucket IS NULL THEN 'skip'
        WHEN ranked.eligible_rank > @appDispatchLimit THEN 'skip'
        WHEN ranked.eligible_rank > @effectiveGlobalDispatchLimit THEN 'skip'
        ELSE 'dispatch'
      END AS decision,
      CASE
        WHEN annotated.hard_skip_reason IS NOT NULL THEN annotated.hard_skip_reason
        WHEN annotated.priority_bucket IS NULL THEN 'SKIP_IGNORED_STATE'
        WHEN ranked.eligible_rank > @appDispatchLimit THEN 'SKIP_APP_BUDGET_EXHAUSTED'
        WHEN ranked.eligible_rank > @effectiveGlobalDispatchLimit THEN 'SKIP_GLOBAL_BUDGET_EXHAUSTED'
        ELSE annotated.dispatch_reason_code
      END AS reason_code,
      annotated.priority_bucket,
      ranked.sort_key
    FROM annotated
    LEFT JOIN ranked ON ranked.media_key = annotated.media_key
  ),
  filtered AS (
    SELECT *
    FROM decisions
    WHERE (@decisionFilter = '' OR decision = @decisionFilter)
      AND (@wantedStateFilter = '' OR wanted_state = @wantedStateFilter)
      AND (
        @queryFilter = ''
        OR lower(
          title || ' ' || media_key || ' ' || reason_code || ' ' || wanted_state || ' ' || decision
        ) LIKE @queryLike
      )
  )
  SELECT
    media_key,
    app,
    title,
    wanted_state,
    decision,
    reason_code,
    priority_bucket,
    retry_count,
    next_eligible_at,
    sort_key
  FROM filtered
  ${sortClause}
`;

const buildCandidateSortClause = (sort: CandidatePreviewSort): string => {
  switch (sort) {
    case 'title_asc':
      return 'ORDER BY title ASC, media_key ASC';
    case 'title_desc':
      return 'ORDER BY title DESC, media_key ASC';
    case 'retry_desc':
      return 'ORDER BY retry_count DESC, media_key ASC';
    case 'retry_asc':
      return 'ORDER BY retry_count ASC, media_key ASC';
    case 'next_eligible_asc':
      return `
        ORDER BY
          CASE WHEN next_eligible_at IS NULL THEN 1 ELSE 0 END ASC,
          next_eligible_at ASC,
          media_key ASC
      `;
    case 'next_eligible_desc':
      return `
        ORDER BY
          CASE WHEN next_eligible_at IS NULL THEN 1 ELSE 0 END ASC,
          next_eligible_at DESC,
          media_key ASC
      `;
    case 'engine':
    default:
      return `
        ORDER BY
          CASE WHEN decision = 'dispatch' THEN 0 ELSE 1 END ASC,
          COALESCE(sort_key, media_key) ASC,
          media_key ASC
      `;
  }
};

const buildCandidatePreviewParams = (query: CandidatePreviewQuery) => {
  const normalizedQuery = query.query?.trim().toLowerCase() ?? '';

  return {
    mediaType: query.app === 'sonarr' ? 'sonarr_episode' : 'radarr_movie',
    appAvailable: fromBoolean(query.appAvailable),
    panicDisableSearch: fromBoolean(query.panicDisableSearch),
    globalSearchBlocked: fromBoolean(query.globalSearchBlocked),
    excludeUnmonitored: fromBoolean(query.excludeUnmonitored),
    excludeUnreleased: fromBoolean(query.excludeUnreleased),
    nowIso: query.nowIso,
    recentReleaseWindowDays: query.recentReleaseWindowDays,
    appDispatchLimit: query.appDispatchLimit,
    effectiveGlobalDispatchLimit: query.effectiveGlobalDispatchLimit,
    decisionFilter: query.decision ?? '',
    wantedStateFilter: query.wantedState ?? '',
    queryFilter: normalizedQuery,
    queryLike: normalizedQuery ? `%${normalizedQuery}%` : '',
  };
};

interface MediaItemStateRow {
  media_key: string;
  media_type: string;
  arr_id: number;
  parent_arr_id: number | null;
  external_path: string | null;
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

interface CandidatePreviewRow {
  media_key: string;
  app: CandidatePreviewApp;
  title: string;
  wanted_state: string;
  decision: CandidatePreviewDecision;
  reason_code: string;
  priority_bucket: string | null;
  retry_count: number;
  next_eligible_at: string | null;
  sort_key: string | null;
}

interface WantedPageCoverageRow {
  app: 'sonarr' | 'radarr';
  collection_kind: 'missing' | 'cutoff';
  page_number: number;
  last_fetched_at: string;
  last_fetch_status: 'success' | 'failed';
  last_observed_total_pages: number;
  last_observed_total_records: number;
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
    externalPath: row.external_path,
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

const toCandidatePreviewRecord = (
  row: CandidatePreviewRow
): CandidatePreviewRecord => {
  return {
    mediaKey: row.media_key,
    app: row.app,
    title: row.title,
    wantedState: row.wanted_state,
    decision: row.decision,
    reasonCode: row.reason_code,
    priorityBucket: row.priority_bucket,
    retryCount: row.retry_count,
    nextEligibleAt: row.next_eligible_at,
    sortKey: row.sort_key,
  };
};

const toWantedPageCoverageRecord = (
  row: WantedPageCoverageRow
): WantedPageCoverageRecord => {
  return {
    app: row.app,
    collectionKind: row.collection_kind,
    pageNumber: row.page_number,
    lastFetchedAt: row.last_fetched_at,
    lastFetchStatus: row.last_fetch_status,
    lastObservedTotalPages: row.last_observed_total_pages,
    lastObservedTotalRecords: row.last_observed_total_records,
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

const toReleaseSuppressionRecord = (
  row: ReleaseSuppressionRow
): ReleaseSuppressionRecord => {
  return {
    id: row.id,
    mediaKey: row.media_key,
    fingerprintType: row.fingerprint_type,
    fingerprintValue: row.fingerprint_value,
    reason: row.reason,
    source: row.source,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
};

const toTransmissionTorrentStateRecord = (
  row: TransmissionTorrentStateRow
): TransmissionTorrentStateRecord => {
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
};

export const createRepositories = (database: SqliteDatabase) => {
  const buildRunHistoryFilter = (filter: RunHistoryFilter = {}) => {
    const clauses: string[] = [];
    const params: Array<string> = [];

    if (filter.runType) {
      clauses.push('run_type = ?');
      params.push(filter.runType);
    }

    if (filter.status) {
      clauses.push('status = ?');
      params.push(filter.status);
    }

    if (filter.startedFrom) {
      clauses.push('started_at >= ?');
      params.push(filter.startedFrom);
    }

    if (filter.startedTo) {
      clauses.push('started_at < ?');
      params.push(filter.startedTo);
    }

    return {
      whereClause: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
      params,
    };
  };

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
              media_key, media_type, arr_id, parent_arr_id, external_path, title, monitored, release_date, wanted_state,
              in_queue, retry_count, last_search_at, last_grab_at, next_eligible_at, suppressed_until,
              suppression_reason, last_seen_at, state_hash
            )
            VALUES (
              @media_key, @media_type, @arr_id, @parent_arr_id, @external_path, @title, @monitored, @release_date, @wanted_state,
              @in_queue, @retry_count, @last_search_at, @last_grab_at, @next_eligible_at, @suppressed_until,
              @suppression_reason, @last_seen_at, @state_hash
            )
            ON CONFLICT(media_key) DO UPDATE SET
              media_type = excluded.media_type,
              arr_id = excluded.arr_id,
              parent_arr_id = excluded.parent_arr_id,
              external_path = excluded.external_path,
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
          external_path: record.externalPath,
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
    countByMediaType(mediaType: string): number {
      const row = database
        .prepare<
          [string],
          { total: number } | undefined
        >('SELECT COUNT(*) AS total FROM media_item_state WHERE media_type = ?')
        .get(mediaType);

      return row?.total ?? 0;
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

  const candidatePreview = {
    countReservedDispatches(query: CandidatePreviewQuery): number {
      const row = database
        .prepare<
          ReturnType<typeof buildCandidatePreviewParams>,
          { total: number } | undefined
        >(
          `
            SELECT COUNT(*) AS total
            FROM (${buildCandidatePreviewCte('')})
            WHERE decision = 'dispatch'
          `
        )
        .get(buildCandidatePreviewParams(query));

      return row?.total ?? 0;
    },
    countFiltered(query: CandidatePreviewQuery): number {
      const row = database
        .prepare<
          ReturnType<typeof buildCandidatePreviewParams>,
          { total: number } | undefined
        >(
          `
            SELECT COUNT(*) AS total
            FROM (${buildCandidatePreviewCte('')})
          `
        )
        .get(buildCandidatePreviewParams(query));

      return row?.total ?? 0;
    },
    listFilteredPage(
      query: CandidatePreviewQuery & {
        sort: CandidatePreviewSort;
      },
      limit: number,
      offset: number
    ): CandidatePreviewRecord[] {
      const rows = database
        .prepare<
          ReturnType<typeof buildCandidatePreviewParams> & {
            limit: number;
            offset: number;
          },
          CandidatePreviewRow
        >(
          `
            ${buildCandidatePreviewCte(buildCandidateSortClause(query.sort))}
            LIMIT @limit OFFSET @offset
          `
        )
        .all({
          ...buildCandidatePreviewParams(query),
          limit,
          offset,
        });

      return rows.map((row) => toCandidatePreviewRecord(row));
    },
  };

  const wantedPageCoverage = {
    upsert(record: WantedPageCoverageRecord): void {
      database
        .prepare(
          `
            INSERT INTO wanted_page_coverage (
              app, collection_kind, page_number, last_fetched_at, last_fetch_status,
              last_observed_total_pages, last_observed_total_records
            )
            VALUES (
              @app, @collection_kind, @page_number, @last_fetched_at, @last_fetch_status,
              @last_observed_total_pages, @last_observed_total_records
            )
            ON CONFLICT(app, collection_kind, page_number) DO UPDATE SET
              last_fetched_at = excluded.last_fetched_at,
              last_fetch_status = excluded.last_fetch_status,
              last_observed_total_pages = excluded.last_observed_total_pages,
              last_observed_total_records = excluded.last_observed_total_records
          `
        )
        .run({
          app: record.app,
          collection_kind: record.collectionKind,
          page_number: record.pageNumber,
          last_fetched_at: record.lastFetchedAt,
          last_fetch_status: record.lastFetchStatus,
          last_observed_total_pages: record.lastObservedTotalPages,
          last_observed_total_records: record.lastObservedTotalRecords,
        });
    },
    listByCollection(
      app: WantedPageCoverageRecord['app'],
      collectionKind: WantedPageCoverageRecord['collectionKind']
    ): WantedPageCoverageRecord[] {
      const rows = database
        .prepare<
          [WantedPageCoverageRecord['app'], WantedPageCoverageRecord['collectionKind']],
          WantedPageCoverageRow
        >(
          `
            SELECT app, collection_kind, page_number, last_fetched_at, last_fetch_status,
                   last_observed_total_pages, last_observed_total_records
            FROM wanted_page_coverage
            WHERE app = ? AND collection_kind = ?
            ORDER BY page_number ASC
          `
        )
        .all(app, collectionKind);

      return rows.map((row) => toWantedPageCoverageRecord(row));
    },
    deletePagesAbove(
      app: WantedPageCoverageRecord['app'],
      collectionKind: WantedPageCoverageRecord['collectionKind'],
      maxPageNumber: number
    ): number {
      const result = database
        .prepare(
          `
            DELETE FROM wanted_page_coverage
            WHERE app = ? AND collection_kind = ? AND page_number > ?
          `
        )
        .run(app, collectionKind, maxPageNumber);

      return result.changes;
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
    countAll(): number {
      const row = database
        .prepare<[], { total: number } | undefined>(
          'SELECT COUNT(*) AS total FROM run_history'
        )
        .get();

      return row?.total ?? 0;
    },
    countFiltered(filter: RunHistoryFilter = {}): number {
      const { whereClause, params } = buildRunHistoryFilter(filter);
      const row = database
        .prepare<unknown[], { total: number } | undefined>(
          `
            SELECT COUNT(*) AS total
            FROM run_history
            ${whereClause}
          `
        )
        .get(...params);

      return row?.total ?? 0;
    },
    listPage(limit: number, offset: number): RunHistoryRecord[] {
      const rows = database
        .prepare<[number, number], RunHistoryRow>(
          `
            SELECT *
            FROM run_history
            ORDER BY started_at DESC, id DESC
            LIMIT ? OFFSET ?
          `
        )
        .all(limit, offset);

      return rows.map((row) => toRunHistoryRecord(row));
    },
    listFilteredPage(
      filter: RunHistoryFilter,
      limit: number,
      offset: number
    ): RunHistoryRecord[] {
      const { whereClause, params } = buildRunHistoryFilter(filter);
      const rows = database
        .prepare<unknown[], RunHistoryRow>(
          `
            SELECT *
            FROM run_history
            ${whereClause}
            ORDER BY started_at DESC, id DESC
            LIMIT ? OFFSET ?
          `
        )
        .all(...params, limit, offset);

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
    countAll(): number {
      const row = database
        .prepare<[], { total: number } | undefined>(
          `
            SELECT COUNT(*) AS total
            FROM activity_log
          `
        )
        .get();

      return row?.total ?? 0;
    },
    listPage(limit: number, offset: number): ActivityLogRecord[] {
      const rows = database
        .prepare<[number, number], ActivityLogRow>(
          `
            SELECT id, occurred_at, level, source, stage, message, detail, run_id, run_type,
                   progress_current, progress_total, metadata_json
            FROM activity_log
            ORDER BY occurred_at DESC, id DESC
            LIMIT ? OFFSET ?
          `
        )
        .all(limit, offset);

      return rows.map((row) => toActivityLogRecord(row));
    },
    listByRunId(runId: string): ActivityLogRecord[] {
      const rows = database
        .prepare<[string], ActivityLogRow>(
          `
            SELECT id, occurred_at, level, source, stage, message, detail, run_id, run_type,
                   progress_current, progress_total, metadata_json
            FROM activity_log
            WHERE run_id = ?
            ORDER BY occurred_at ASC, id ASC
          `
        )
        .all(runId);

      return rows.map((row) => toActivityLogRecord(row));
    },
    countByRunId(runId: string): number {
      const row = database
        .prepare<[string], { total: number } | undefined>(
          `
            SELECT COUNT(*) AS total
            FROM activity_log
            WHERE run_id = ?
          `
        )
        .get(runId);

      return row?.total ?? 0;
    },
    listPageByRunId(runId: string, limit: number, offset: number): ActivityLogRecord[] {
      const rows = database
        .prepare<[string, number, number], ActivityLogRow>(
          `
            SELECT id, occurred_at, level, source, stage, message, detail, run_id, run_type,
                   progress_current, progress_total, metadata_json
            FROM activity_log
            WHERE run_id = ?
            ORDER BY occurred_at ASC, id ASC
            LIMIT ? OFFSET ?
          `
        )
        .all(runId, limit, offset);

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
    countByRunId(runId: string): number {
      const row = database
        .prepare<[string], { total: number } | undefined>(
          `
            SELECT COUNT(*) AS total
            FROM search_attempt
            WHERE run_id = ?
          `
        )
        .get(runId);

      return row?.total ?? 0;
    },
    listPageByRunId(
      runId: string,
      limit: number,
      offset: number
    ): SearchAttemptRecord[] {
      const rows = database
        .prepare<[string, number, number], SearchAttemptRow>(
          `
            SELECT run_id, media_key, app, wanted_state, decision, reason_code, dry_run,
                   arr_command_id, attempted_at, completed_at, outcome
            FROM search_attempt
            WHERE run_id = ?
            ORDER BY attempted_at ASC, id ASC
            LIMIT ? OFFSET ?
          `
        )
        .all(runId, limit, offset);

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
        .prepare<[string], ReleaseSuppressionRow>(
          `
            SELECT id, media_key, fingerprint_type, fingerprint_value, reason, source, created_at, expires_at
            FROM release_suppression
            WHERE expires_at > ?
            ORDER BY expires_at ASC, id ASC
          `
        )
        .all(nowIso);

      return rows.map((row) => toReleaseSuppressionRecord(row));
    },
    countActive(nowIso: string): number {
      const row = database
        .prepare<[string], { total: number } | undefined>(
          `
            SELECT COUNT(*) AS total
            FROM release_suppression
            WHERE expires_at > ?
          `
        )
        .get(nowIso);

      return row?.total ?? 0;
    },
    countActiveFiltered(
      nowIso: string,
      filter: ReleaseSuppressionFilter = {}
    ): number {
      const row = database
        .prepare<
          ReturnType<typeof buildReleaseSuppressionFilterParams>,
          { total: number } | undefined
        >(
          `
            SELECT COUNT(*) AS total
            ${buildReleaseSuppressionFilterSql()}
          `
        )
        .get(buildReleaseSuppressionFilterParams(nowIso, filter));

      return row?.total ?? 0;
    },
    listActiveFilteredPage(
      nowIso: string,
      limit: number,
      offset: number,
      filter: ReleaseSuppressionFilter = {}
    ): ReleaseSuppressionRecord[] {
      const rows = database
        .prepare<
          ReturnType<typeof buildReleaseSuppressionFilterParams> & {
            limit: number;
            offset: number;
          },
          ReleaseSuppressionRow
        >(
          `
            SELECT
              release_suppression.id,
              release_suppression.media_key,
              release_suppression.fingerprint_type,
              release_suppression.fingerprint_value,
              release_suppression.reason,
              release_suppression.source,
              release_suppression.created_at,
              release_suppression.expires_at
            ${buildReleaseSuppressionFilterSql()}
            ORDER BY release_suppression.expires_at ASC, release_suppression.id ASC
            LIMIT @limit OFFSET @offset
          `
        )
        .all({
          ...buildReleaseSuppressionFilterParams(nowIso, filter),
          limit,
          offset,
        });

      return rows.map((row) => toReleaseSuppressionRecord(row));
    },
    clearById(id: number): void {
      database.prepare('DELETE FROM release_suppression WHERE id = ?').run(id);
    },
    clearByIds(ids: number[]): number {
      const uniqueIds = Array.from(new Set(ids.filter((id) => Number.isInteger(id))));

      if (uniqueIds.length === 0) {
        return 0;
      }

      const placeholders = uniqueIds.map(() => '?').join(', ');
      const result = database
        .prepare(`DELETE FROM release_suppression WHERE id IN (${placeholders})`)
        .run(...uniqueIds);

      return result.changes;
    },
    clearActiveFiltered(
      nowIso: string,
      filter: ReleaseSuppressionFilter = {}
    ): number {
      const result = database
        .prepare(`
          DELETE FROM release_suppression
          WHERE id IN (
            SELECT release_suppression.id
            ${buildReleaseSuppressionFilterSql()}
          )
        `)
        .run(buildReleaseSuppressionFilterParams(nowIso, filter));

      return result.changes;
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
        .prepare<[string], TransmissionTorrentStateRow | undefined>(
          'SELECT * FROM transmission_torrent_state WHERE hash_string = ?'
        )
        .get(hashString);

      if (!row) {
        return null;
      }

      return toTransmissionTorrentStateRecord(row);
    },
    listRecent(limit: number): TransmissionTorrentStateRecord[] {
      const rows = database
        .prepare<[number], TransmissionTorrentStateRow>(
          `
            SELECT *
            FROM transmission_torrent_state
            ORDER BY COALESCE(removed_at, last_seen_at) DESC, hash_string ASC
            LIMIT ?
          `
        )
        .all(limit);

      return rows.map((row) => toTransmissionTorrentStateRecord(row));
    },
    count(): number {
      const row = database
        .prepare<[], { total: number } | undefined>(
          `
            SELECT COUNT(*) AS total
            FROM transmission_torrent_state
          `
        )
        .get();

      return row?.total ?? 0;
    },
    countFiltered(filter: TransmissionTorrentFilter): number {
      const row = database
        .prepare<
          ReturnType<typeof buildTransmissionTorrentFilterParams>,
          { total: number } | undefined
        >(
          `
            SELECT COUNT(*) AS total
            FROM (${buildTransmissionTorrentFilterCte('')})
          `
        )
        .get(buildTransmissionTorrentFilterParams(filter));

      return row?.total ?? 0;
    },
    listFilteredPage(
      filter: TransmissionTorrentFilter,
      limit: number,
      offset: number
    ): TransmissionTorrentStateRecord[] {
      const rows = database
        .prepare<
          ReturnType<typeof buildTransmissionTorrentFilterParams> & {
            limit: number;
            offset: number;
          },
          TransmissionTorrentStateRow
        >(
          `
            ${buildTransmissionTorrentFilterCte(
              buildTransmissionTorrentSortClause(filter.sort)
            )}
            LIMIT @limit OFFSET @offset
          `
        )
        .all({
          ...buildTransmissionTorrentFilterParams(filter),
          limit,
          offset,
        });

      return rows.map((row) => toTransmissionTorrentStateRecord(row));
    },
    listAll(): TransmissionTorrentStateRecord[] {
      const rows = database
        .prepare<[], TransmissionTorrentStateRow>(
          `
            SELECT *
            FROM transmission_torrent_state
            ORDER BY COALESCE(removed_at, last_seen_at) DESC, hash_string ASC
          `
        )
        .all();

      return rows.map((row) => toTransmissionTorrentStateRecord(row));
    },
    deleteAll(): void {
      database.prepare('DELETE FROM transmission_torrent_state').run();
    },
  };

  return {
    serviceState,
    appUsers,
    appSessions,
    loginAttempts,
    mediaItemState,
    wantedPageCoverage,
    runHistory,
    activityLog,
    searchAttempts,
    releaseSuppressions,
    transmissionTorrentState,
    candidatePreview,
  };
};

export type DatabaseRepositories = ReturnType<typeof createRepositories>;
