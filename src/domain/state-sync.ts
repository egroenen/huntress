import { createHash } from 'node:crypto';

import type { DatabaseContext, MediaItemStateRecord } from '@/src/db';
import type {
  ArrQueueRecord,
  ArrWantedRecord,
  RadarrApiClient,
  SonarrApiClient,
} from '@/src/integrations';

type ArrAppName = 'sonarr' | 'radarr';
type MediaType = 'sonarr_episode' | 'radarr_movie';
type WantedState = 'missing' | 'cutoff_unmet' | 'ignored';

interface PersistableSnapshot {
  mediaKey: string;
  mediaType: MediaType;
  arrId: number;
  parentArrId: number | null;
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
  cutoffCount: number;
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
      title: currentRecord.title,
      monitored: currentRecord.monitored,
      releaseDate: currentRecord.releaseDate,
      wantedState: 'ignored',
      inQueue,
    }),
  };
};

const syncAppState = async (input: {
  app: ArrAppName;
  mediaType: MediaType;
  database: DatabaseContext;
  getWantedMissing?: () => Promise<ArrWantedRecord[]>;
  getWantedCutoff?: () => Promise<ArrWantedRecord[]>;
  getQueueDetails?: () => Promise<ArrQueueRecord[]>;
  syncedAt: string;
}): Promise<AppStateSyncSummary> => {
  if (!input.getWantedMissing || !input.getWantedCutoff || !input.getQueueDetails) {
    return {
      app: input.app,
      status: 'not_configured',
      syncedAt: input.syncedAt,
      missingCount: 0,
      cutoffCount: 0,
      queueCount: 0,
      upsertedCount: 0,
      ignoredCount: 0,
    };
  }

  const [missing, cutoff, queue] = await Promise.all([
    input.getWantedMissing(),
    input.getWantedCutoff(),
    input.getQueueDetails(),
  ]);

  const wantedSnapshots = mergeWantedSnapshots(input.app, missing, cutoff);
  const queuedMediaKeys = new Set(
    queue
      .map((queueRecord) => extractQueueMediaKey(input.app, queueRecord))
      .filter((mediaKey): mediaKey is string => mediaKey !== null)
  );

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

  return {
    app: input.app,
    status: 'synced',
    syncedAt: input.syncedAt,
    missingCount: missing.length,
    cutoffCount: cutoff.length,
    queueCount: queuedMediaKeys.size,
    upsertedCount,
    ignoredCount,
  };
};

export const syncArrState = async (input: {
  database: DatabaseContext;
  clients: ArrSyncClients;
  now?: Date;
}): Promise<ArrStateSyncSummary> => {
  const syncedAt = (input.now ?? new Date()).toISOString();
  const sonarrClient = input.clients.sonarr;
  const radarrClient = input.clients.radarr;

  const [sonarr, radarr] = await Promise.all([
    syncAppState({
      app: 'sonarr',
      mediaType: SONARR_MEDIA_TYPE,
      database: input.database,
      ...(sonarrClient
        ? {
            getWantedMissing: () => sonarrClient.getWantedMissing(),
            getWantedCutoff: () => sonarrClient.getWantedCutoff(),
            getQueueDetails: () => sonarrClient.getQueueDetails(),
          }
        : {}),
      syncedAt,
    }),
    syncAppState({
      app: 'radarr',
      mediaType: RADARR_MEDIA_TYPE,
      database: input.database,
      ...(radarrClient
        ? {
            getWantedMissing: () => radarrClient.getWantedMissing(),
            getWantedCutoff: () => radarrClient.getWantedCutoff(),
            getQueueDetails: () => radarrClient.getQueueDetails(),
          }
        : {}),
      syncedAt,
    }),
  ]);

  return {
    syncedAt,
    sonarr,
    radarr,
  };
};
