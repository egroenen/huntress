import { createHash } from 'node:crypto';

import type {
  DatabaseContext,
  MediaItemStateRecord,
  WantedPageCoverageRecord,
} from '@/src/db';
import type {
  ArrQueueRecord,
  ArrWantedPageResult,
  ArrWantedRecord,
  RadarrApiClient,
  SonarrApiClient,
} from '@/src/integrations';
import type { ActivityTracker } from '@/src/observability';

type ArrAppName = 'sonarr' | 'radarr';
type MediaType = 'sonarr_episode' | 'radarr_movie';
type WantedState = 'missing' | 'cutoff_unmet' | 'ignored';

interface PersistableSnapshot {
  mediaKey: string;
  mediaType: MediaType;
  arrId: number;
  parentArrId: number | null;
  externalPath: string | null;
  title: string;
  monitored: boolean;
  releaseDate: string | null;
  wantedState: Exclude<WantedState, 'ignored'>;
}

export interface AppStateSyncSummary {
  app: ArrAppName;
  status: 'synced' | 'not_configured';
  syncedAt: string;
  missingCount: number;
  missingPagesFetched: number;
  missingTotalPages: number;
  cutoffCount: number;
  cutoffPagesFetched: number;
  cutoffTotalPages: number;
  queueCount: number;
  upsertedCount: number;
  ignoredCount: number;
}

export interface ArrStateSyncSummary {
  syncedAt: string;
  sonarr: AppStateSyncSummary;
  radarr: AppStateSyncSummary;
}

export interface ArrSyncClients {
  sonarr: SonarrApiClient | null;
  radarr: RadarrApiClient | null;
}

type WantedCollectionKind = 'missing' | 'cutoff';

interface SyncCoverageConfig {
  wantedPageSize: number;
  fullScanPageThreshold: number;
  maxWantedPagesPerCollection: number;
  sonarrFetchAllPages: boolean;
  radarrFetchAllPages: boolean;
}

const buildQueueDownloadMapStateKey = (app: ArrAppName): string =>
  `arr_queue_download_map:${app}`;

const normalizeDownloadId = (value: string): string => value.trim().toLowerCase();

const SONARR_MEDIA_TYPE: MediaType = 'sonarr_episode';
const RADARR_MEDIA_TYPE: MediaType = 'radarr_movie';

const getSnapshotStateHash = (
  snapshot: Omit<PersistableSnapshot, 'wantedState'> & {
    wantedState: WantedState;
    inQueue: boolean;
  }
): string => {
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const readNumberAtPath = (value: unknown, path: readonly string[]): number | null => {
  let current: unknown = value;

  for (const segment of path) {
    if (!isRecord(current) || !(segment in current)) {
      return null;
    }

    current = current[segment];
  }

  return typeof current === 'number' ? current : null;
};

const buildMediaKey = (app: ArrAppName, arrId: number): string => {
  return app === 'sonarr' ? `sonarr:episode:${arrId}` : `radarr:movie:${arrId}`;
};

const buildSnapshot = (
  app: ArrAppName,
  wantedState: Exclude<WantedState, 'ignored'>,
  record: ArrWantedRecord
): PersistableSnapshot => {
  return {
    mediaKey: buildMediaKey(app, record.itemId),
    mediaType: app === 'sonarr' ? SONARR_MEDIA_TYPE : RADARR_MEDIA_TYPE,
    arrId: record.itemId,
    parentArrId: record.parentId,
    externalPath: record.externalPath,
    title: record.title,
    monitored: record.monitored,
    releaseDate: record.releaseDate,
    wantedState,
  };
};

const mergeWantedSnapshots = (
  app: ArrAppName,
  missing: ArrWantedRecord[],
  cutoff: ArrWantedRecord[]
): Map<string, PersistableSnapshot> => {
  const snapshots = new Map<string, PersistableSnapshot>();

  for (const record of missing) {
    const snapshot = buildSnapshot(app, 'missing', record);
    snapshots.set(snapshot.mediaKey, snapshot);
  }

  for (const record of cutoff) {
    const mediaKey = buildMediaKey(app, record.itemId);

    if (snapshots.has(mediaKey)) {
      continue;
    }

    const snapshot = buildSnapshot(app, 'cutoff_unmet', record);
    snapshots.set(snapshot.mediaKey, snapshot);
  }

  return snapshots;
};

const extractQueueMediaKey = (
  app: ArrAppName,
  queueRecord: ArrQueueRecord
): string | null => {
  if (app === 'sonarr') {
    const episodeId =
      readNumberAtPath(queueRecord.payload, ['episodeId']) ??
      readNumberAtPath(queueRecord.payload, ['episode', 'id']);

    return episodeId ? buildMediaKey('sonarr', episodeId) : null;
  }

  const movieId =
    readNumberAtPath(queueRecord.payload, ['movieId']) ??
    readNumberAtPath(queueRecord.payload, ['movie', 'id']);

  return movieId ? buildMediaKey('radarr', movieId) : null;
};

const buildQueueDownloadMap = (
  app: ArrAppName,
  queue: ArrQueueRecord[]
): Record<string, string> => {
  const entries = queue
    .map((queueRecord) => {
      const mediaKey = extractQueueMediaKey(app, queueRecord);
      const downloadId = queueRecord.downloadId?.trim() ?? null;

      if (!mediaKey || !downloadId) {
        return null;
      }

      return [normalizeDownloadId(downloadId), mediaKey] as const;
    })
    .filter((entry): entry is readonly [string, string] => entry !== null);

  return Object.fromEntries(entries);
};

const buildPersistedRecord = (
  snapshot: PersistableSnapshot,
  currentRecord: MediaItemStateRecord | null,
  inQueue: boolean,
  syncedAt: string
): MediaItemStateRecord => {
  return {
    mediaKey: snapshot.mediaKey,
    mediaType: snapshot.mediaType,
    arrId: snapshot.arrId,
    parentArrId: snapshot.parentArrId,
    externalPath: snapshot.externalPath ?? currentRecord?.externalPath ?? null,
    title: snapshot.title,
    monitored: snapshot.monitored,
    releaseDate: snapshot.releaseDate,
    wantedState: snapshot.wantedState,
    inQueue,
    retryCount: currentRecord?.retryCount ?? 0,
    lastSearchAt: currentRecord?.lastSearchAt ?? null,
    lastGrabAt: currentRecord?.lastGrabAt ?? null,
    nextEligibleAt: currentRecord?.nextEligibleAt ?? null,
    suppressedUntil: currentRecord?.suppressedUntil ?? null,
    suppressionReason: currentRecord?.suppressionReason ?? null,
    lastSeenAt: syncedAt,
    stateHash: getSnapshotStateHash({
      ...snapshot,
      externalPath: snapshot.externalPath ?? currentRecord?.externalPath ?? null,
      wantedState: snapshot.wantedState,
      inQueue,
    }),
  };
};

const buildIgnoredRecord = (
  currentRecord: MediaItemStateRecord,
  inQueue: boolean,
  syncedAt: string
): MediaItemStateRecord => {
  return {
    ...currentRecord,
    wantedState: 'ignored',
    inQueue,
    lastSeenAt: syncedAt,
    stateHash: getSnapshotStateHash({
      mediaKey: currentRecord.mediaKey,
      mediaType: currentRecord.mediaType as MediaType,
      arrId: currentRecord.arrId,
      parentArrId: currentRecord.parentArrId,
      externalPath: currentRecord.externalPath,
      title: currentRecord.title,
      monitored: currentRecord.monitored,
      releaseDate: currentRecord.releaseDate,
      wantedState: 'ignored',
      inQueue,
    }),
  };
};

const buildCurrentRecordMap = (
  database: DatabaseContext,
  mediaKeys: Iterable<string>
): Map<string, MediaItemStateRecord> => {
  const records = new Map<string, MediaItemStateRecord>();

  for (const mediaKey of mediaKeys) {
    const record = database.repositories.mediaItemState.getByMediaKey(mediaKey);

    if (record) {
      records.set(mediaKey, record);
    }
  }

  return records;
};

const ensureSonarrSeriesTitle = (title: string, seriesTitle: string): string => {
  return title.startsWith(`${seriesTitle} - `) ? title : `${seriesTitle} - ${title}`;
};

const enrichSonarrWantedRecords = async (input: {
  records: ArrWantedRecord[];
  currentRecords: Map<string, MediaItemStateRecord>;
  resolveSeries: (seriesId: number) => Promise<{ title: string; titleSlug: string | null }>;
  activityTracker?: ActivityTracker;
}): Promise<ArrWantedRecord[]> => {
  const missingSeriesIds = Array.from(
    new Set(
      input.records.flatMap((record) => {
        if (record.parentId === null) {
          return [];
        }

        const currentRecord = input.currentRecords.get(buildMediaKey('sonarr', record.itemId));
        const hasKnownPath =
          record.externalPath !== null || currentRecord?.externalPath != null;

        return hasKnownPath ? [] : [record.parentId];
      })
    )
  );

  const seriesDetails = new Map<number, { title: string; titleSlug: string | null }>();

  await Promise.all(
    missingSeriesIds.map(async (seriesId) => {
      try {
        const series = await input.resolveSeries(seriesId);
        seriesDetails.set(seriesId, series);
      } catch (error) {
        input.activityTracker?.warn({
          source: 'sonarr',
          stage: 'link_metadata',
          message: `Failed to resolve Sonarr series path for ${seriesId}`,
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    })
  );

  return input.records.map((record) => {
    const currentRecord = input.currentRecords.get(buildMediaKey('sonarr', record.itemId));
    const series = record.parentId !== null ? seriesDetails.get(record.parentId) : undefined;
    const externalPath =
      record.externalPath ??
      currentRecord?.externalPath ??
      (series?.titleSlug ? `series/${series.titleSlug}` : null);

    return {
      ...record,
      externalPath,
      title: series ? ensureSonarrSeriesTitle(record.title, series.title) : record.title,
    };
  });
};

const enrichRadarrWantedRecords = async (input: {
  records: ArrWantedRecord[];
  currentRecords: Map<string, MediaItemStateRecord>;
  resolveMovie: (movieId: number) => Promise<{ titleSlug: string | null }>;
  activityTracker?: ActivityTracker;
}): Promise<ArrWantedRecord[]> => {
  const missingMovieIds = Array.from(
    new Set(
      input.records.flatMap((record) => {
        const currentRecord = input.currentRecords.get(buildMediaKey('radarr', record.itemId));
        const hasKnownPath =
          record.externalPath !== null || currentRecord?.externalPath != null;

        return hasKnownPath ? [] : [record.itemId];
      })
    )
  );

  const moviePaths = new Map<number, string | null>();

  await Promise.all(
    missingMovieIds.map(async (movieId) => {
      try {
        const movie = await input.resolveMovie(movieId);
        moviePaths.set(movieId, movie.titleSlug ? `movie/${movie.titleSlug}` : null);
      } catch (error) {
        input.activityTracker?.warn({
          source: 'radarr',
          stage: 'link_metadata',
          message: `Failed to resolve Radarr movie path for ${movieId}`,
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    })
  );

  return input.records.map((record) => {
    const currentRecord = input.currentRecords.get(buildMediaKey('radarr', record.itemId));

    return {
      ...record,
      externalPath:
        record.externalPath ??
        currentRecord?.externalPath ??
        moviePaths.get(record.itemId) ??
        null,
    };
  });
};

const DEFAULT_SYNC_COVERAGE_CONFIG: SyncCoverageConfig = {
  wantedPageSize: 50,
  fullScanPageThreshold: 20,
  maxWantedPagesPerCollection: 4,
  sonarrFetchAllPages: false,
  radarrFetchAllPages: false,
};

const buildCoverageTieBreaker = (
  app: ArrAppName,
  collectionKind: WantedCollectionKind,
  pageNumber: number
): number => {
  return createHash('sha1')
    .update(`${app}:${collectionKind}:${pageNumber}`)
    .digest()
    .readUInt32BE(0);
};

const selectWantedPages = (input: {
  app: ArrAppName;
  collectionKind: WantedCollectionKind;
  totalPages: number;
  coverage: WantedPageCoverageRecord[];
  config: SyncCoverageConfig;
}): {
  mode: 'full' | 'incremental';
  pages: number[];
  reason: string;
} => {
  const forceFullScan =
    input.app === 'sonarr'
      ? input.config.sonarrFetchAllPages
      : input.config.radarrFetchAllPages;

  if (forceFullScan) {
    return {
      mode: 'full',
      pages: Array.from({ length: input.totalPages }, (_, index) => index + 1),
      reason: `Fetch-all-pages is enabled for ${input.app}.`,
    };
  }

  if (input.totalPages <= 1) {
    return {
      mode: 'full',
      pages: [1],
      reason: 'Single-page collection.',
    };
  }

  if (input.totalPages <= input.config.fullScanPageThreshold) {
    return {
      mode: 'full',
      pages: Array.from({ length: input.totalPages }, (_, index) => index + 1),
      reason: `Total pages ${input.totalPages} within full-scan threshold ${input.config.fullScanPageThreshold}.`,
    };
  }

  const coverageByPage = new Map(
    input.coverage.map((record) => [record.pageNumber, record] as const)
  );
  const additionalPages = Array.from(
    { length: Math.max(input.totalPages - 1, 0) },
    (_, index) => index + 2
  )
    .map((pageNumber) => ({
      pageNumber,
      coverage: coverageByPage.get(pageNumber) ?? null,
      tieBreaker: buildCoverageTieBreaker(
        input.app,
        input.collectionKind,
        pageNumber
      ),
    }))
    .sort((left, right) => {
      if (!left.coverage && right.coverage) {
        return -1;
      }

      if (left.coverage && !right.coverage) {
        return 1;
      }

      if (!left.coverage && !right.coverage) {
        return left.tieBreaker - right.tieBreaker;
      }

      const fetchedAtComparison = left.coverage!.lastFetchedAt.localeCompare(
        right.coverage!.lastFetchedAt
      );

      if (fetchedAtComparison !== 0) {
        return fetchedAtComparison;
      }

      return left.tieBreaker - right.tieBreaker;
    })
    .slice(0, Math.max(input.config.maxWantedPagesPerCollection - 1, 0))
    .map((entry) => entry.pageNumber);

  return {
    mode: 'incremental',
    pages: [1, ...additionalPages],
    reason: `Total pages ${input.totalPages} exceeds threshold ${input.config.fullScanPageThreshold}; selected ${additionalPages.length} additional least-recently-fetched pages.`,
  };
};

const updateWantedPageCoverage = (input: {
  database: DatabaseContext;
  app: ArrAppName;
  collectionKind: WantedCollectionKind;
  fetchedAt: string;
  pageResult: ArrWantedPageResult;
  status: WantedPageCoverageRecord['lastFetchStatus'];
}): void => {
  input.database.repositories.wantedPageCoverage.upsert({
    app: input.app,
    collectionKind: input.collectionKind,
    pageNumber: input.pageResult.page,
    lastFetchedAt: input.fetchedAt,
    lastFetchStatus: input.status,
    lastObservedTotalPages: input.pageResult.totalPages,
    lastObservedTotalRecords: input.pageResult.totalRecords,
  });
};

const fetchWantedCollectionWithCoverage = async (input: {
  app: ArrAppName;
  collectionKind: WantedCollectionKind;
  database: DatabaseContext;
  syncedAt: string;
  syncConfig: SyncCoverageConfig;
  fetchPage: (page: number) => Promise<ArrWantedPageResult>;
  activityTracker?: ActivityTracker;
}): Promise<{
  records: ArrWantedRecord[];
  pagesFetched: number;
  totalPages: number;
}> => {
  const firstPage = await input.fetchPage(1);

  updateWantedPageCoverage({
    database: input.database,
    app: input.app,
    collectionKind: input.collectionKind,
    fetchedAt: input.syncedAt,
    pageResult: firstPage,
    status: 'success',
  });

  const prunedPages = input.database.repositories.wantedPageCoverage.deletePagesAbove(
    input.app,
    input.collectionKind,
    firstPage.totalPages
  );

  if (prunedPages > 0) {
    input.activityTracker?.info({
      source: input.app,
      stage: `wanted_${input.collectionKind}_coverage_prune`,
      message: `Pruned ${prunedPages} stale ${input.collectionKind} coverage pages`,
      detail: `Total pages now ${firstPage.totalPages}`,
    });
  }

  if (firstPage.totalPages <= 1) {
    return {
      records: firstPage.records,
      pagesFetched: 1,
      totalPages: firstPage.totalPages,
    };
  }

  const coverage = input.database.repositories.wantedPageCoverage.listByCollection(
    input.app,
    input.collectionKind
  );
  const selection = selectWantedPages({
    app: input.app,
    collectionKind: input.collectionKind,
    totalPages: firstPage.totalPages,
    coverage,
    config: input.syncConfig,
  });

  input.activityTracker?.info({
    source: input.app,
    stage: `wanted_${input.collectionKind}_selection`,
    message:
      selection.mode === 'full'
        ? `Using full scan for ${input.app} ${input.collectionKind}`
        : `Using incremental coverage for ${input.app} ${input.collectionKind}`,
    detail: `${selection.reason} Pages ${selection.pages.join(', ')}`,
    progressCurrent: selection.pages.length,
    progressTotal: firstPage.totalPages,
  });

  const records = [...firstPage.records];

  for (const pageNumber of selection.pages.slice(1)) {
    try {
      const pageResult = await input.fetchPage(pageNumber);
      records.push(...pageResult.records);
      updateWantedPageCoverage({
        database: input.database,
        app: input.app,
        collectionKind: input.collectionKind,
        fetchedAt: input.syncedAt,
        pageResult,
        status: 'success',
      });
    } catch (error) {
      input.database.repositories.wantedPageCoverage.upsert({
        app: input.app,
        collectionKind: input.collectionKind,
        pageNumber,
        lastFetchedAt: input.syncedAt,
        lastFetchStatus: 'failed',
        lastObservedTotalPages: firstPage.totalPages,
        lastObservedTotalRecords: firstPage.totalRecords,
      });
      throw error;
    }
  }

  return {
    records,
    pagesFetched: selection.pages.length,
    totalPages: firstPage.totalPages,
  };
};

const syncAppState = async (input: {
  app: ArrAppName;
  mediaType: MediaType;
  database: DatabaseContext;
  getWantedMissingPage?: (page: number) => Promise<ArrWantedPageResult>;
  getWantedCutoffPage?: (page: number) => Promise<ArrWantedPageResult>;
  getQueueDetails?: () => Promise<ArrQueueRecord[]>;
  resolveSonarrSeries?: (
    seriesId: number
  ) => Promise<{ title: string; titleSlug: string | null }>;
  resolveRadarrMovie?: (movieId: number) => Promise<{ titleSlug: string | null }>;
  syncedAt: string;
  syncConfig: SyncCoverageConfig;
  activityTracker?: ActivityTracker;
}): Promise<AppStateSyncSummary> => {
  if (
    !input.getWantedMissingPage ||
    !input.getWantedCutoffPage ||
    !input.getQueueDetails
  ) {
    input.activityTracker?.info({
      source: input.app,
      stage: 'not_configured',
      message: `${input.app} is not configured for state sync`,
    });
    return {
      app: input.app,
      status: 'not_configured',
      syncedAt: input.syncedAt,
      missingCount: 0,
      missingPagesFetched: 0,
      missingTotalPages: 0,
      cutoffCount: 0,
      cutoffPagesFetched: 0,
      cutoffTotalPages: 0,
      queueCount: 0,
      upsertedCount: 0,
      ignoredCount: 0,
    };
  }

  input.activityTracker?.info({
    source: input.app,
    stage: 'sync_fetch_start',
    message: `Fetching ${input.app} wanted and queue state`,
  });

  const [missingResult, cutoffResult, queue] = await Promise.all([
    fetchWantedCollectionWithCoverage({
      app: input.app,
      collectionKind: 'missing',
      database: input.database,
      syncedAt: input.syncedAt,
      syncConfig: input.syncConfig,
      fetchPage: input.getWantedMissingPage,
      ...(input.activityTracker ? { activityTracker: input.activityTracker } : {}),
    }),
    fetchWantedCollectionWithCoverage({
      app: input.app,
      collectionKind: 'cutoff',
      database: input.database,
      syncedAt: input.syncedAt,
      syncConfig: input.syncConfig,
      fetchPage: input.getWantedCutoffPage,
      ...(input.activityTracker ? { activityTracker: input.activityTracker } : {}),
    }),
    input.getQueueDetails(),
  ]);
  const currentRecords = buildCurrentRecordMap(input.database, [
    ...missingResult.records.map((record) => buildMediaKey(input.app, record.itemId)),
    ...cutoffResult.records.map((record) => buildMediaKey(input.app, record.itemId)),
  ]);
  const missing =
    input.app === 'sonarr' && input.resolveSonarrSeries
      ? await enrichSonarrWantedRecords({
          records: missingResult.records,
          currentRecords,
          resolveSeries: input.resolveSonarrSeries,
          ...(input.activityTracker ? { activityTracker: input.activityTracker } : {}),
        })
      : input.app === 'radarr' && input.resolveRadarrMovie
        ? await enrichRadarrWantedRecords({
            records: missingResult.records,
            currentRecords,
            resolveMovie: input.resolveRadarrMovie,
            ...(input.activityTracker ? { activityTracker: input.activityTracker } : {}),
          })
        : missingResult.records;
  const cutoff =
    input.app === 'sonarr' && input.resolveSonarrSeries
      ? await enrichSonarrWantedRecords({
          records: cutoffResult.records,
          currentRecords,
          resolveSeries: input.resolveSonarrSeries,
          ...(input.activityTracker ? { activityTracker: input.activityTracker } : {}),
        })
      : input.app === 'radarr' && input.resolveRadarrMovie
        ? await enrichRadarrWantedRecords({
            records: cutoffResult.records,
            currentRecords,
            resolveMovie: input.resolveRadarrMovie,
            ...(input.activityTracker ? { activityTracker: input.activityTracker } : {}),
          })
        : cutoffResult.records;

  const wantedSnapshots = mergeWantedSnapshots(input.app, missing, cutoff);
  const queuedMediaKeys = new Set(
    queue
      .map((queueRecord) => extractQueueMediaKey(input.app, queueRecord))
      .filter((mediaKey): mediaKey is string => mediaKey !== null)
  );
  input.database.repositories.serviceState.set({
    key: buildQueueDownloadMapStateKey(input.app),
    value: buildQueueDownloadMap(input.app, queue),
    updatedAt: input.syncedAt,
  });

  let upsertedCount = 0;
  for (const snapshot of wantedSnapshots.values()) {
    const currentRecord = input.database.repositories.mediaItemState.getByMediaKey(
      snapshot.mediaKey
    );

    input.database.repositories.mediaItemState.upsert(
      buildPersistedRecord(
        snapshot,
        currentRecord,
        queuedMediaKeys.has(snapshot.mediaKey),
        input.syncedAt
      )
    );
    upsertedCount += 1;
  }

  let ignoredCount = 0;
  const existingRecords = input.database.repositories.mediaItemState.listByMediaType(
    input.mediaType
  );

  for (const existingRecord of existingRecords) {
    if (wantedSnapshots.has(existingRecord.mediaKey)) {
      continue;
    }

    input.database.repositories.mediaItemState.upsert(
      buildIgnoredRecord(
        existingRecord,
        queuedMediaKeys.has(existingRecord.mediaKey),
        input.syncedAt
      )
    );
    ignoredCount += 1;
  }

  input.activityTracker?.info({
    source: input.app,
    stage: 'sync_persist_complete',
    message: `Updated ${input.app} state`,
    detail: `${missing.length} missing across ${missingResult.pagesFetched}/${missingResult.totalPages} pages, ${cutoff.length} cutoff across ${cutoffResult.pagesFetched}/${cutoffResult.totalPages} pages, ${queue.length} queue entries`,
    progressCurrent: upsertedCount,
    progressTotal: upsertedCount + ignoredCount,
  });

  return {
    app: input.app,
    status: 'synced',
    syncedAt: input.syncedAt,
    missingCount: missing.length,
    missingPagesFetched: missingResult.pagesFetched,
    missingTotalPages: missingResult.totalPages,
    cutoffCount: cutoff.length,
    cutoffPagesFetched: cutoffResult.pagesFetched,
    cutoffTotalPages: cutoffResult.totalPages,
    queueCount: queuedMediaKeys.size,
    upsertedCount,
    ignoredCount,
  };
};

export const syncArrState = async (input: {
  database: DatabaseContext;
  clients: ArrSyncClients;
  syncConfig?: Partial<SyncCoverageConfig>;
  now?: Date;
  activityTracker?: ActivityTracker;
}): Promise<ArrStateSyncSummary> => {
  const syncedAt = (input.now ?? new Date()).toISOString();
  const sonarrClient = input.clients.sonarr;
  const radarrClient = input.clients.radarr;
  const syncConfig: SyncCoverageConfig = {
    ...DEFAULT_SYNC_COVERAGE_CONFIG,
    ...(input.syncConfig ?? {}),
  };

  input.activityTracker?.info({
    source: 'scheduler',
    stage: 'sync_state_start',
    message: 'Starting Sonarr and Radarr state sync',
  });

  const [sonarr, radarr] = await Promise.all([
    syncAppState({
      app: 'sonarr',
      mediaType: SONARR_MEDIA_TYPE,
      database: input.database,
      ...(sonarrClient
        ? {
            getWantedMissingPage: (page: number) =>
              sonarrClient.getWantedMissingPage(page),
            getWantedCutoffPage: (page: number) =>
              sonarrClient.getWantedCutoffPage(page),
            getQueueDetails: () => sonarrClient.getQueueDetails(),
            resolveSonarrSeries: (seriesId: number) => sonarrClient.getSeries(seriesId),
          }
        : {}),
      syncedAt,
      syncConfig,
      ...(input.activityTracker ? { activityTracker: input.activityTracker } : {}),
    }),
    syncAppState({
      app: 'radarr',
      mediaType: RADARR_MEDIA_TYPE,
      database: input.database,
      ...(radarrClient
        ? {
            getWantedMissingPage: (page: number) =>
              radarrClient.getWantedMissingPage(page),
            getWantedCutoffPage: (page: number) =>
              radarrClient.getWantedCutoffPage(page),
            getQueueDetails: () => radarrClient.getQueueDetails(),
            resolveRadarrMovie: (movieId: number) => radarrClient.getMovie(movieId),
          }
        : {}),
      syncedAt,
      syncConfig,
      ...(input.activityTracker ? { activityTracker: input.activityTracker } : {}),
    }),
  ]);

  input.activityTracker?.info({
    source: 'scheduler',
    stage: 'sync_state_complete',
    message: 'Completed Sonarr and Radarr state sync',
    detail: `${sonarr.upsertedCount + radarr.upsertedCount} items updated`,
  });

  return {
    syncedAt,
    sonarr,
    radarr,
  };
};
