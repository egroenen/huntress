import type { ResolvedConfig } from '@/src/config';
import type {
  DatabaseContext,
  MediaItemStateRecord,
  TransmissionTorrentStateRecord,
} from '@/src/db';
import type {
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

const isStalledTorrent = (
  torrent: TransmissionTorrentRecord,
  state: TransmissionTorrentStateRecord,
  stallNoProgressForMs: number,
  now: Date
): boolean => {
  if (torrent.error > 0 || torrent.percentDone >= 1 || torrent.rateDownload > 0) {
    return false;
  }

  if (!state.noProgressSince) {
    return false;
  }

  return (
    now.getTime() - new Date(state.noProgressSince).getTime() >= stallNoProgressForMs
  );
};

const hasActiveSuppressedRelease = (
  database: DatabaseContext,
  linkedMediaKey: string | null,
  torrentName: string,
  nowIso: string
): boolean => {
  if (!linkedMediaKey) {
    return false;
  }

  const fingerprint = normalizeFingerprint(torrentName);
  return database.repositories.releaseSuppressions
    .listActive(nowIso)
    .some(
      (suppression) =>
        suppression.mediaKey === linkedMediaKey &&
        suppression.fingerprintType === 'release_title' &&
        suppression.fingerprintValue === fingerprint
    );
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
  input.database.repositories.releaseSuppressions.create({
    mediaKey: input.torrentState.linkedMediaKey,
    fingerprintType: 'release_title',
    fingerprintValue: normalizeFingerprint(input.torrentState.name),
    reason: input.reason,
    source: 'transmission_guard',
    createdAt: nowIso,
    expiresAt: suppressUntilIso,
  });

  return { suppressionCreated: true };
};

export const runTransmissionGuard = async (input: {
  database: DatabaseContext;
  config: ResolvedConfig;
  client: TransmissionApiClient | null;
  activityTracker?: ActivityTracker;
  now?: Date;
}): Promise<TransmissionGuardRunSummary> => {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
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
      removedCount: 0,
      suppressionCount: 0,
      linkedCount: 0,
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

  let removedCount = 0;
  let suppressionCount = 0;
  let linkedCount = 0;

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
    if (torrent.error > 0) {
      reason = 'TX_ERROR_REMOVE';
    } else if (
      hasActiveSuppressedRelease(
        input.database,
        torrentState.linkedMediaKey,
        torrent.name,
        nowIso
      )
    ) {
      reason = 'TX_LOOP_REPEAT_RELEASE';
    } else if (
      isStalledTorrent(
        torrent,
        torrentState,
        input.config.transmissionGuard.stallNoProgressForMs,
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
    const result = await removeTorrentAndSuppress({
      database: input.database,
      client: input.client,
      torrentState,
      deleteLocalData: input.config.transmissionGuard.deleteLocalData,
      suppressDurationMs: input.config.transmissionGuard.suppressSameReleaseForMs,
      now,
      reason,
    });
    logger.warn({
      event: 'transmission_removed',
      hashString: torrent.hashString,
      name: torrent.name,
      linkedMediaKey: torrentState.linkedMediaKey,
      reasonCode: reason,
      deleteLocalData: input.config.transmissionGuard.deleteLocalData,
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
