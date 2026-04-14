import type { ResolvedConfig } from '@/src/config';
import type {
  DatabaseContext,
  MediaItemStateRecord,
  TransmissionTorrentStateRecord,
} from '@/src/db';
import type {
  ArrQueueRecord,
  RadarrApiClient,
  SonarrApiClient,
  TransmissionApiClient,
  TransmissionTorrentRecord,
} from '@/src/integrations';
import {
  logger,
  recordTransmissionRemoval,
  type ActivityTracker,
  updateActiveSuppressionsMetric,
} from '@/src/observability';

export type TransmissionGuardReason =
  | 'TX_ERROR_REMOVE'
  | 'TX_STALLED_REMOVE'
  | 'TX_LOOP_REPEAT_RELEASE'
  | 'TX_DANGEROUS_DOWNLOAD_REMOVE'
  | 'TX_NOT_UPGRADE_REMOVE'
  | 'TX_NO_ACTION';

export interface TransmissionGuardRunSummary {
  observedCount: number;
  removedCount: number;
  suppressionCount: number;
  linkedCount: number;
}

const normalizeFingerprint = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
};

const normalizeDownloadId = (value: string): string => value.trim().toLowerCase();
const PERMANENT_SUPPRESSION_EXPIRES_AT = '9999-12-31T23:59:59.999Z';

const escapeRegExp = (value: string): string => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const MIN_AUTO_LINK_TITLE_LENGTH = 3;

const EPISODE_RELEASE_PATTERN =
  /(?:^| )(?:s\d{1,2}e\d{1,3}|season \d{1,2} episode \d{1,3}|20\d{2} \d{2} \d{2})(?: |$)/i;

const includesPhrase = (haystack: string, phrase: string): boolean => {
  if (!phrase) {
    return false;
  }

  return new RegExp(`(?:^| )${escapeRegExp(phrase)}(?: |$)`, 'i').test(haystack);
};

const getEpisodeSeriesTitle = (item: MediaItemStateRecord): string | null => {
  if (item.mediaType !== 'sonarr_episode') {
    return null;
  }

  const separatorIndex = item.title.indexOf(' - ');

  if (separatorIndex <= 0) {
    return null;
  }

  return item.title.slice(0, separatorIndex).trim() || null;
};

const buildEpisodeSeriesCounts = (
  mediaItems: MediaItemStateRecord[]
): Map<string, number> => {
  const counts = new Map<string, number>();

  for (const item of mediaItems) {
    const seriesTitle = getEpisodeSeriesTitle(item);

    if (!seriesTitle) {
      continue;
    }

    const normalizedSeriesTitle = normalizeFingerprint(seriesTitle);

    if (normalizedSeriesTitle.length < MIN_AUTO_LINK_TITLE_LENGTH) {
      continue;
    }

    counts.set(
      normalizedSeriesTitle,
      (counts.get(normalizedSeriesTitle) ?? 0) + 1
    );
  }

  return counts;
};

const matchesTorrentToMediaItem = (input: {
  torrentName: string;
  item: MediaItemStateRecord;
  episodeSeriesCounts: Map<string, number>;
}): boolean => {
  const normalizedTorrentName = normalizeFingerprint(input.torrentName);

  if (input.item.mediaType === 'radarr_movie') {
    const normalizedMovieTitle = normalizeFingerprint(input.item.title);

    if (normalizedMovieTitle.length < MIN_AUTO_LINK_TITLE_LENGTH) {
      return false;
    }

    return includesPhrase(normalizedTorrentName, normalizedMovieTitle);
  }

  const seriesTitle = getEpisodeSeriesTitle(input.item);

  if (!seriesTitle || !EPISODE_RELEASE_PATTERN.test(normalizedTorrentName)) {
    return false;
  }

  const normalizedSeriesTitle = normalizeFingerprint(seriesTitle);

  if (normalizedSeriesTitle.length < MIN_AUTO_LINK_TITLE_LENGTH) {
    return false;
  }

  if ((input.episodeSeriesCounts.get(normalizedSeriesTitle) ?? 0) !== 1) {
    return false;
  }

  return includesPhrase(normalizedTorrentName, normalizedSeriesTitle);
};

const listMediaItems = (database: DatabaseContext): MediaItemStateRecord[] => {
  return [
    ...database.repositories.mediaItemState.listByMediaType('sonarr_episode'),
    ...database.repositories.mediaItemState.listByMediaType('radarr_movie'),
  ];
};

const getQueueDownloadMap = (database: DatabaseContext): Record<string, string> => {
  const sonarrMap =
    database.repositories.serviceState.get<Record<string, string>>(
      'arr_queue_download_map:sonarr'
    )?.value ?? {};
  const radarrMap =
    database.repositories.serviceState.get<Record<string, string>>(
      'arr_queue_download_map:radarr'
    )?.value ?? {};

  return {
    ...sonarrMap,
    ...radarrMap,
  };
};

const linkTorrentToMediaKey = (
  torrent: TransmissionTorrentRecord,
  mediaItems: MediaItemStateRecord[],
  queueDownloadMap: Record<string, string>,
  previousLinkedMediaKey: string | null
): string | null => {
  const queueLinkedMediaKey =
    queueDownloadMap[normalizeDownloadId(torrent.hashString)] ?? null;

  if (queueLinkedMediaKey) {
    return queueLinkedMediaKey;
  }

  const episodeSeriesCounts = buildEpisodeSeriesCounts(mediaItems);
  const matches = mediaItems.filter((item) =>
    matchesTorrentToMediaItem({
      torrentName: torrent.name,
      item,
      episodeSeriesCounts,
    })
  );

  if (matches.length === 1) {
    return matches[0]?.mediaKey ?? null;
  }

  if (!previousLinkedMediaKey) {
    return null;
  }

  const previousItem =
    mediaItems.find((item) => item.mediaKey === previousLinkedMediaKey) ?? null;

  if (
    previousItem &&
    matchesTorrentToMediaItem({
      torrentName: torrent.name,
      item: previousItem,
      episodeSeriesCounts,
    })
  ) {
    return previousItem.mediaKey;
  }

  return null;
};

const buildTorrentStateRecord = (
  current: TransmissionTorrentRecord,
  previous: TransmissionTorrentStateRecord | null,
  linkedMediaKey: string | null,
  nowIso: string
): TransmissionTorrentStateRecord => {
  const hasProgressAdvanced =
    previous !== null && current.percentDone > previous.percentDone;

  const noProgressSince =
    current.percentDone >= 1
      ? null
      : current.rateDownload > 0 || hasProgressAdvanced
        ? nowIso
        : (previous?.noProgressSince ?? nowIso);

  return {
    hashString: current.hashString,
    name: current.name,
    status: current.status,
    percentDone: current.percentDone,
    errorCode: current.error,
    errorString: current.errorString,
    firstSeenAt: previous?.firstSeenAt ?? nowIso,
    lastSeenAt: nowIso,
    linkedMediaKey,
    removedAt: previous?.removedAt ?? null,
    removalReason: previous?.removalReason ?? null,
    noProgressSince,
  };
};

const NEAR_COMPLETE_THRESHOLD = 0.95;

const isStalledTorrent = (
  torrent: TransmissionTorrentRecord,
  state: TransmissionTorrentStateRecord,
  stallNoProgressForMs: number,
  stallNearCompleteForMs: number,
  now: Date
): boolean => {
  if (torrent.error > 0 || torrent.percentDone >= 1 || torrent.rateDownload > 0) {
    return false;
  }

  if (!state.noProgressSince) {
    return false;
  }

  const stalledForMs = now.getTime() - new Date(state.noProgressSince).getTime();
  const threshold =
    torrent.percentDone >= NEAR_COMPLETE_THRESHOLD
      ? stallNearCompleteForMs
      : stallNoProgressForMs;

  return stalledForMs >= threshold;
};

const hasActiveSuppressedRelease = (
  database: DatabaseContext,
  linkedMediaKey: string | null,
  torrent: Pick<TransmissionTorrentRecord, 'hashString' | 'name'>,
  nowIso: string
): boolean => {
  if (!linkedMediaKey) {
    return false;
  }

  const normalizedHash = normalizeDownloadId(torrent.hashString);
  const fingerprint = normalizeFingerprint(torrent.name);
  return database.repositories.releaseSuppressions
    .listActive(nowIso)
    .some(
      (suppression) =>
        suppression.mediaKey === linkedMediaKey &&
        ((suppression.fingerprintType === 'release_title' &&
          suppression.fingerprintValue === fingerprint) ||
          (suppression.fingerprintType === 'torrent_hash' &&
            suppression.fingerprintValue === normalizedHash))
    );
};

const hasDangerousExtension = (
  torrentName: string,
  dangerousExtensions: string[]
): boolean => {
  if (dangerousExtensions.length === 0) {
    return false;
  }

  const normalizedName = torrentName.toLowerCase();
  return dangerousExtensions.some((ext) => normalizedName.endsWith(ext));
};

const isDangerousStatusMessage = (message: string): boolean => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('found executable file') ||
    normalized.includes("extension: '.exe'") ||
    normalized.includes('caution: found executable')
  );
};

const isNotUpgradeStatusMessage = (message: string): boolean => {
  const normalized = message.toLowerCase();
  return normalized.includes('not an upgrade for existing episode file');
};

const classifyBlockedQueueMessage = (
  message: string
): {
  reason: TransmissionGuardReason;
  permanent: boolean;
} | null => {
  if (isDangerousStatusMessage(message)) {
    return {
      reason: 'TX_DANGEROUS_DOWNLOAD_REMOVE',
      permanent: true,
    };
  }

  if (isNotUpgradeStatusMessage(message)) {
    return {
      reason: 'TX_NOT_UPGRADE_REMOVE',
      permanent: true,
    };
  }

  return null;
};

const extractBlockedQueueMessage = (
  queueRecord: ArrQueueRecord
): {
  message: string;
  reason: TransmissionGuardReason;
  permanent: boolean;
} | null => {
  if (queueRecord.trackedDownloadStatus !== 'warning') {
    return null;
  }

  const payload =
    typeof queueRecord.payload === 'object' && queueRecord.payload !== null
      ? (queueRecord.payload as {
          statusMessages?: Array<{
            title?: string | null;
            messages?: string[] | null;
          }> | null;
        })
      : null;

  const statusMessages = payload?.statusMessages ?? [];

  for (const statusMessage of statusMessages) {
    for (const message of statusMessage.messages ?? []) {
      const classification = classifyBlockedQueueMessage(message);

      if (classification) {
        return {
          message,
          reason: classification.reason,
          permanent: classification.permanent,
        };
      }
    }
  }

  return null;
};

const createReleaseSuppression = (input: {
  database: DatabaseContext;
  mediaKey: string | null;
  fingerprintType: string;
  fingerprintValue: string;
  reason: TransmissionGuardReason;
  source?: string;
  createdAt: string;
  expiresAt: string;
}): boolean => {
  if (!input.mediaKey || !input.fingerprintValue.trim()) {
    return false;
  }

  const existing = input.database.repositories.releaseSuppressions
    .listActive(input.createdAt)
    .some(
      (suppression) =>
        suppression.mediaKey === input.mediaKey &&
        suppression.fingerprintType === input.fingerprintType &&
        suppression.fingerprintValue === input.fingerprintValue
    );

  if (existing) {
    return false;
  }

  input.database.repositories.releaseSuppressions.create({
    mediaKey: input.mediaKey,
    fingerprintType: input.fingerprintType,
    fingerprintValue: input.fingerprintValue,
    reason: input.reason,
    source: input.source ?? 'transmission_guard',
    createdAt: input.createdAt,
    expiresAt: input.expiresAt,
  });

  return true;
};

type BlockableArrQueueClient =
  | Pick<SonarrApiClient, 'getQueueDetails' | 'removeQueueItem'>
  | Pick<RadarrApiClient, 'getQueueDetails' | 'removeQueueItem'>;

const handleBlockedArrQueueItems = async (input: {
  database: DatabaseContext;
  app: 'sonarr' | 'radarr';
  client: BlockableArrQueueClient | null;
  activityTracker?: ActivityTracker;
  now: Date;
}): Promise<{ removedCount: number; suppressionCount: number; linkedCount: number }> => {
  if (!input.client) {
    return {
      removedCount: 0,
      suppressionCount: 0,
      linkedCount: 0,
    };
  }

  const nowIso = input.now.toISOString();
  const queueDownloadMap = getQueueDownloadMap(input.database);
  const queueDetails = await input.client.getQueueDetails();
  const blockedItems = queueDetails
    .map((record) => ({
      record,
      blockedMessage: extractBlockedQueueMessage(record),
    }))
    .filter(
      (
        entry
      ): entry is {
        record: ArrQueueRecord;
        blockedMessage: {
          message: string;
          reason: TransmissionGuardReason;
          permanent: boolean;
        };
      } => entry.blockedMessage !== null
    );

  if (blockedItems.length === 0) {
    return {
      removedCount: 0,
      suppressionCount: 0,
      linkedCount: 0,
    };
  }

  input.activityTracker?.warn({
    source: input.app,
    stage: 'blocked_queue_detected',
    message: `Found ${blockedItems.length} blocked ${input.app} queue item${blockedItems.length === 1 ? '' : 's'}`,
    detail:
      'Removing from queue/download client and suppressing the exact torrent fingerprints.',
    progressCurrent: 0,
    progressTotal: blockedItems.length,
  });

  let removedCount = 0;
  let suppressionCount = 0;
  let linkedCount = 0;

  for (const [index, entry] of blockedItems.entries()) {
    const queueRecord = entry.record;
    const normalizedDownloadId = queueRecord.downloadId
      ? normalizeDownloadId(queueRecord.downloadId)
      : null;
    const linkedMediaKey =
      normalizedDownloadId ? (queueDownloadMap[normalizedDownloadId] ?? null) : null;

    if (linkedMediaKey) {
      linkedCount += 1;
    }

    input.activityTracker?.warn({
      source: input.app,
      stage: 'blocked_queue_remove',
      message: `Removing blocked ${input.app} queue item ${index + 1} of ${blockedItems.length}`,
      detail: `${queueRecord.title} (${entry.blockedMessage.message})`,
      progressCurrent: index + 1,
      progressTotal: blockedItems.length,
    });

    await input.client.removeQueueItem(queueRecord.id, {
      removeFromClient: true,
      blocklist: true,
      skipRedownload: true,
    });

    if (normalizedDownloadId) {
      input.database.repositories.transmissionTorrentState.upsert({
        hashString: normalizedDownloadId,
        name: queueRecord.title,
        status: 0,
        percentDone: 1,
        errorCode: null,
        errorString: entry.blockedMessage.message,
        firstSeenAt:
          input.database.repositories.transmissionTorrentState.getByHash(
            normalizedDownloadId
          )?.firstSeenAt ?? nowIso,
        lastSeenAt: nowIso,
        linkedMediaKey,
        removedAt: nowIso,
        removalReason: entry.blockedMessage.reason,
        noProgressSince: null,
      });
    }

    if (
      normalizedDownloadId &&
      createReleaseSuppression({
        database: input.database,
        mediaKey: linkedMediaKey,
        fingerprintType: 'torrent_hash',
        fingerprintValue: normalizedDownloadId,
        reason: entry.blockedMessage.reason,
        createdAt: nowIso,
        expiresAt: entry.blockedMessage.permanent
          ? PERMANENT_SUPPRESSION_EXPIRES_AT
          : nowIso,
      })
    ) {
      suppressionCount += 1;
    }

    if (
      createReleaseSuppression({
        database: input.database,
        mediaKey: linkedMediaKey,
        fingerprintType: 'release_title',
        fingerprintValue: normalizeFingerprint(queueRecord.title),
        reason: entry.blockedMessage.reason,
        createdAt: nowIso,
        expiresAt: entry.blockedMessage.permanent
          ? PERMANENT_SUPPRESSION_EXPIRES_AT
          : nowIso,
      })
    ) {
      suppressionCount += 1;
    }

    logger.warn({
      event: 'blocked_arr_queue_item_removed',
      app: input.app,
      queueId: queueRecord.id,
      title: queueRecord.title,
      linkedMediaKey,
      downloadId: normalizedDownloadId,
      reasonCode: entry.blockedMessage.reason,
      detail: entry.blockedMessage.message,
    });
    recordTransmissionRemoval(entry.blockedMessage.reason);
    removedCount += 1;
  }

  return {
    removedCount,
    suppressionCount,
    linkedCount,
  };
};

const removeTorrentAndSuppress = async (input: {
  database: DatabaseContext;
  client: TransmissionApiClient;
  torrentState: TransmissionTorrentStateRecord;
  deleteLocalData: boolean;
  suppressDurationMs: number;
  now: Date;
  reason: TransmissionGuardReason;
}): Promise<{ suppressionCreated: boolean }> => {
  const nowIso = input.now.toISOString();
  await input.client.removeTorrent(input.torrentState.hashString, input.deleteLocalData);

  input.database.repositories.transmissionTorrentState.upsert({
    ...input.torrentState,
    lastSeenAt: nowIso,
    removedAt: nowIso,
    removalReason: input.reason,
  });

  if (!input.torrentState.linkedMediaKey) {
    return { suppressionCreated: false };
  }

  const suppressUntilIso = new Date(
    input.now.getTime() + input.suppressDurationMs
  ).toISOString();
  const created = createReleaseSuppression({
    database: input.database,
    mediaKey: input.torrentState.linkedMediaKey,
    fingerprintType: 'release_title',
    fingerprintValue: normalizeFingerprint(input.torrentState.name),
    reason: input.reason,
    createdAt: nowIso,
    expiresAt: suppressUntilIso,
  });

  return { suppressionCreated: created };
};

export const runTransmissionGuard = async (input: {
  database: DatabaseContext;
  config: ResolvedConfig;
  client: TransmissionApiClient | null;
  sonarrClient?: SonarrApiClient | null;
  radarrClient?: RadarrApiClient | null;
  activityTracker?: ActivityTracker;
  now?: Date;
}): Promise<TransmissionGuardRunSummary> => {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const sonarrBlockedQueueSummary = await handleBlockedArrQueueItems({
    database: input.database,
    app: 'sonarr',
    client: input.sonarrClient ?? null,
    now,
    ...(input.activityTracker
      ? {
          activityTracker: input.activityTracker,
        }
      : {}),
  });
  const radarrBlockedQueueSummary = await handleBlockedArrQueueItems({
    database: input.database,
    app: 'radarr',
    client: input.radarrClient ?? null,
    now,
    ...(input.activityTracker
      ? {
          activityTracker: input.activityTracker,
        }
      : {}),
  });
  const blockedQueueSummary = {
    removedCount:
      sonarrBlockedQueueSummary.removedCount + radarrBlockedQueueSummary.removedCount,
    suppressionCount:
      sonarrBlockedQueueSummary.suppressionCount +
      radarrBlockedQueueSummary.suppressionCount,
    linkedCount:
      sonarrBlockedQueueSummary.linkedCount + radarrBlockedQueueSummary.linkedCount,
  };

  if (!input.client) {
    input.activityTracker?.info({
      source: 'transmission',
      stage: 'not_configured',
      message: 'Transmission guard skipped because Transmission is not configured',
    });
    updateActiveSuppressionsMetric(
      input.database.repositories.releaseSuppressions.listActive(nowIso).length
    );

    return {
      observedCount: 0,
      removedCount: blockedQueueSummary.removedCount,
      suppressionCount: blockedQueueSummary.suppressionCount,
      linkedCount: blockedQueueSummary.linkedCount,
    };
  }
  input.activityTracker?.info({
    source: 'transmission',
    stage: 'torrent_scan_start',
    message: 'Fetching Transmission torrent list',
  });
  const torrents = await input.client.getTorrents();
  const mediaItems = listMediaItems(input.database);
  const queueDownloadMap = getQueueDownloadMap(input.database);

  let removedCount = blockedQueueSummary.removedCount;
  let suppressionCount = blockedQueueSummary.suppressionCount;
  let linkedCount = blockedQueueSummary.linkedCount;

  input.activityTracker?.info({
    source: 'transmission',
    stage: 'torrent_scan_progress',
    message: `Inspecting ${torrents.length} Transmission torrents`,
    progressCurrent: 0,
    progressTotal: torrents.length,
  });

  for (const [index, torrent] of torrents.entries()) {
    const previous = input.database.repositories.transmissionTorrentState.getByHash(
      torrent.hashString
    );
    const linkedMediaKey = linkTorrentToMediaKey(
      torrent,
      mediaItems,
      queueDownloadMap,
      previous?.linkedMediaKey ?? null
    );

    if (linkedMediaKey) {
      linkedCount += 1;
    }

    const torrentState = buildTorrentStateRecord(
      torrent,
      previous,
      linkedMediaKey,
      nowIso
    );
    input.database.repositories.transmissionTorrentState.upsert(torrentState);

    let reason: TransmissionGuardReason | null = null;
    if (
      hasDangerousExtension(
        torrent.name,
        input.config.transmissionGuard.dangerousExtensions
      )
    ) {
      reason = 'TX_DANGEROUS_DOWNLOAD_REMOVE';
    } else if (torrent.error > 0) {
      reason = 'TX_ERROR_REMOVE';
    } else if (
      hasActiveSuppressedRelease(
        input.database,
        torrentState.linkedMediaKey,
        torrent,
        nowIso
      )
    ) {
      reason = 'TX_LOOP_REPEAT_RELEASE';
    } else if (
      isStalledTorrent(
        torrent,
        torrentState,
        input.config.transmissionGuard.stallNoProgressForMs,
        input.config.transmissionGuard.stallNearCompleteForMs,
        now
      )
    ) {
      reason = 'TX_STALLED_REMOVE';
    }

    if (!reason) {
      input.activityTracker?.info({
        source: 'transmission',
        stage: 'torrent_scan_progress',
        message: `Inspected torrent ${index + 1} of ${torrents.length}`,
        detail: torrent.name,
        progressCurrent: index + 1,
        progressTotal: torrents.length,
      });
      continue;
    }

    input.activityTracker?.warn({
      source: 'transmission',
      stage: 'torrent_remove',
      message: `Removing torrent ${index + 1} of ${torrents.length}`,
      detail: `${torrent.name} (${reason})`,
      progressCurrent: index + 1,
      progressTotal: torrents.length,
    });
    const isDangerous = reason === 'TX_DANGEROUS_DOWNLOAD_REMOVE';
    const result = await removeTorrentAndSuppress({
      database: input.database,
      client: input.client,
      torrentState,
      deleteLocalData: isDangerous || input.config.transmissionGuard.deleteLocalData,
      suppressDurationMs: isDangerous
        ? new Date(PERMANENT_SUPPRESSION_EXPIRES_AT).getTime() - now.getTime()
        : input.config.transmissionGuard.suppressSameReleaseForMs,
      now,
      reason,
    });
    logger.warn({
      event: 'transmission_removed',
      hashString: torrent.hashString,
      name: torrent.name,
      linkedMediaKey: torrentState.linkedMediaKey,
      reasonCode: reason,
      deleteLocalData: isDangerous || input.config.transmissionGuard.deleteLocalData,
    });
    recordTransmissionRemoval(reason);
    removedCount += 1;
    if (result.suppressionCreated) {
      suppressionCount += 1;
    }
  }

  input.activityTracker?.info({
    source: 'transmission',
    stage: 'torrent_scan_complete',
    message: 'Transmission guard pass completed',
    detail: `${removedCount} removed, ${suppressionCount} suppressions, ${linkedCount} linked`,
    progressCurrent: torrents.length,
    progressTotal: torrents.length,
  });

  updateActiveSuppressionsMetric(
    input.database.repositories.releaseSuppressions.listActive(nowIso).length
  );

  return {
    observedCount: torrents.length,
    removedCount,
    suppressionCount,
    linkedCount,
  };
};
