import { createHash } from 'node:crypto';

import type { MediaItemStateRecord } from '@/src/db';
import { logger } from '@/src/observability';
import type { RuntimeContext } from '@/src/server/runtime';

interface MediaDisplayCacheRecord {
  mediaKey: string;
  mediaType: 'sonarr_episode' | 'radarr_movie';
  arrId: number;
  parentArrId: number | null;
  externalPath: string | null;
  title: string;
  cachedAt: string;
}

const MEDIA_DISPLAY_CACHE_PREFIX = 'media_display_cache:';

const buildStateHash = (record: MediaItemStateRecord): string => {
  return createHash('sha256')
    .update(
      JSON.stringify({
        mediaKey: record.mediaKey,
        mediaType: record.mediaType,
        arrId: record.arrId,
        parentArrId: record.parentArrId,
        externalPath: record.externalPath,
        title: record.title,
        monitored: record.monitored,
        releaseDate: record.releaseDate,
        wantedState: record.wantedState,
        inQueue: record.inQueue,
      })
    )
    .digest('hex');
};

const buildDisplayCacheKey = (mediaKey: string): string =>
  `${MEDIA_DISPLAY_CACHE_PREFIX}${mediaKey}`;

const SONARR_EPISODE_MARKER_PATTERN = /^(?:S\d{1,2}\s?E\d{1,3}|\d{1,2}x\d{1,3})\b/i;

const hasSonarrDisplayContext = (title: string): boolean => {
  const trimmedTitle = title.trim();

  if (!trimmedTitle || SONARR_EPISODE_MARKER_PATTERN.test(trimmedTitle)) {
    return false;
  }

  return (
    /\s-\s/.test(trimmedTitle) ||
    /\sS\d{1,2}\s?E\d{1,3}\b/i.test(trimmedTitle) ||
    /\s\d{1,2}x\d{1,3}\b/i.test(trimmedTitle)
  );
};

const formatEpisodeCode = (
  seasonNumber: number | null,
  episodeNumber: number | null
): string | null => {
  if (seasonNumber === null || episodeNumber === null) {
    return null;
  }

  return `S${seasonNumber} E${episodeNumber}`;
};

const formatSonarrDisplayTitle = (input: {
  seriesTitle: string;
  episodeTitle: string;
  seasonNumber: number | null;
  episodeNumber: number | null;
}): string => {
  const episodeCode = formatEpisodeCode(input.seasonNumber, input.episodeNumber);
  const cleanedEpisodeTitle = input.episodeTitle.trim();

  if (episodeCode && cleanedEpisodeTitle) {
    return `${input.seriesTitle} - ${episodeCode} - ${cleanedEpisodeTitle}`;
  }

  if (episodeCode) {
    return `${input.seriesTitle} - ${episodeCode}`;
  }

  return `${input.seriesTitle} - ${cleanedEpisodeTitle}`;
};

const toDisplayRecord = (record: MediaDisplayCacheRecord): MediaItemStateRecord => {
  const nextRecord: MediaItemStateRecord = {
    mediaKey: record.mediaKey,
    mediaType: record.mediaType,
    arrId: record.arrId,
    parentArrId: record.parentArrId,
    externalPath: record.externalPath,
    title: record.title,
    monitored: false,
    releaseDate: null,
    wantedState: 'ignored',
    inQueue: false,
    retryCount: 0,
    lastSearchAt: null,
    lastGrabAt: null,
    nextEligibleAt: null,
    suppressedUntil: null,
    suppressionReason: null,
    lastSeenAt: record.cachedAt,
    stateHash: '',
  };

  nextRecord.stateHash = buildStateHash(nextRecord);
  return nextRecord;
};

const getCachedDisplayRecord = (
  runtime: RuntimeContext,
  mediaKey: string
): MediaDisplayCacheRecord | null => {
  return (
    runtime.database.repositories.serviceState.get<MediaDisplayCacheRecord>(
      buildDisplayCacheKey(mediaKey)
    )?.value ?? null
  );
};

const setCachedDisplayRecord = (
  runtime: RuntimeContext,
  record: MediaDisplayCacheRecord
): void => {
  runtime.database.repositories.serviceState.set({
    key: buildDisplayCacheKey(record.mediaKey),
    value: record,
    updatedAt: record.cachedAt,
  });
};

const parseMediaKey = (
  mediaKey: string
):
  | {
      mediaType: 'sonarr_episode';
      arrId: number;
    }
  | {
      mediaType: 'radarr_movie';
      arrId: number;
    }
  | null => {
  const parts = mediaKey.split(':');

  if (parts.length !== 3) {
    return null;
  }

  const arrId = Number.parseInt(parts[2] ?? '', 10);

  if (!Number.isInteger(arrId) || arrId <= 0) {
    return null;
  }

  if (parts[0] === 'sonarr' && parts[1] === 'episode') {
    return { mediaType: 'sonarr_episode', arrId };
  }

  if (parts[0] === 'radarr' && parts[1] === 'movie') {
    return { mediaType: 'radarr_movie', arrId };
  }

  return null;
};

const fetchMissingDisplayRecord = async (
  runtime: RuntimeContext,
  mediaKey: string
): Promise<MediaDisplayCacheRecord | null> => {
  const parsed = parseMediaKey(mediaKey);

  if (!parsed) {
    return null;
  }

  const cachedAt = new Date().toISOString();

  if (parsed.mediaType === 'sonarr_episode' && runtime.clients.sonarr) {
    const episode = await runtime.clients.sonarr.getEpisode(parsed.arrId);
    const series = await runtime.clients.sonarr.getSeries(episode.seriesId);
    const record: MediaDisplayCacheRecord = {
      mediaKey,
      mediaType: 'sonarr_episode',
      arrId: episode.id,
      parentArrId: series.id,
      externalPath: series.titleSlug ? `series/${series.titleSlug}` : null,
      title: formatSonarrDisplayTitle({
        seriesTitle: series.title,
        episodeTitle: episode.title,
        seasonNumber: episode.seasonNumber,
        episodeNumber: episode.episodeNumber,
      }),
      cachedAt,
    };

    setCachedDisplayRecord(runtime, record);
    return record;
  }

  if (parsed.mediaType === 'radarr_movie' && runtime.clients.radarr) {
    const movie = await runtime.clients.radarr.getMovie(parsed.arrId);
    const record: MediaDisplayCacheRecord = {
      mediaKey,
      mediaType: 'radarr_movie',
      arrId: movie.id,
      parentArrId: null,
      externalPath: movie.titleSlug ? `movie/${movie.titleSlug}` : null,
      title: movie.title,
      cachedAt,
    };

    setCachedDisplayRecord(runtime, record);
    return record;
  }

  return null;
};

const hydrateSonarrRecord = async (
  runtime: RuntimeContext,
  record: MediaItemStateRecord
): Promise<MediaItemStateRecord> => {
  if (!runtime.clients.sonarr || record.mediaType !== 'sonarr_episode') {
    return record;
  }

  const needsPath = !record.externalPath;
  const needsTitle = !hasSonarrDisplayContext(record.title);

  if (!needsPath && !needsTitle) {
    return record;
  }

  const episode = await runtime.clients.sonarr.getEpisode(record.arrId);
  const seriesId = record.parentArrId ?? episode.seriesId;
  const series = await runtime.clients.sonarr.getSeries(seriesId);
  const nextRecord: MediaItemStateRecord = {
    ...record,
    parentArrId: series.id,
    externalPath: record.externalPath ?? (series.titleSlug ? `series/${series.titleSlug}` : null),
    title: formatSonarrDisplayTitle({
      seriesTitle: series.title,
      episodeTitle: episode.title,
      seasonNumber: episode.seasonNumber,
      episodeNumber: episode.episodeNumber,
    }),
  };

  nextRecord.stateHash = buildStateHash(nextRecord);
  runtime.database.repositories.mediaItemState.upsert(nextRecord);
  return nextRecord;
};

const hydrateRadarrRecord = async (
  runtime: RuntimeContext,
  record: MediaItemStateRecord
): Promise<MediaItemStateRecord> => {
  if (!runtime.clients.radarr || record.mediaType !== 'radarr_movie' || record.externalPath) {
    return record;
  }

  const movie = await runtime.clients.radarr.getMovie(record.arrId);
  const nextRecord: MediaItemStateRecord = {
    ...record,
    externalPath: movie.titleSlug ? `movie/${movie.titleSlug}` : null,
  };

  nextRecord.stateHash = buildStateHash(nextRecord);
  runtime.database.repositories.mediaItemState.upsert(nextRecord);
  return nextRecord;
};

export const hydrateMediaDisplayRecords = async (
  runtime: RuntimeContext,
  mediaKeys: Iterable<string>
): Promise<Map<string, MediaItemStateRecord>> => {
  const uniqueMediaKeys = Array.from(new Set(mediaKeys));
  const records = new Map<string, MediaItemStateRecord>();

  for (const mediaKey of uniqueMediaKeys) {
    const record = runtime.database.repositories.mediaItemState.getByMediaKey(mediaKey);

    if (record) {
      records.set(mediaKey, record);
      continue;
    }

    const cachedRecord = getCachedDisplayRecord(runtime, mediaKey);

    if (cachedRecord) {
      records.set(mediaKey, toDisplayRecord(cachedRecord));
    }
  }

  await Promise.all(
    Array.from(records.entries()).map(async ([mediaKey, record]) => {
      try {
        const hydrated =
          record.mediaType === 'sonarr_episode'
            ? await hydrateSonarrRecord(runtime, record)
            : record.mediaType === 'radarr_movie'
              ? await hydrateRadarrRecord(runtime, record)
              : record;

        records.set(mediaKey, hydrated);
      } catch (error) {
        logger.debug(
          {
            error,
            event: 'media_display_hydration_failed',
            mediaKey,
          },
          'Failed to enrich cached media display record'
        );

        // Keep the stored record if enrichment fails; the page can still render.
      }
    })
  );

  const missingMediaKeys = uniqueMediaKeys.filter((mediaKey) => !records.has(mediaKey));

  await Promise.all(
    missingMediaKeys.map(async (mediaKey) => {
      try {
        const fetchedRecord = await fetchMissingDisplayRecord(runtime, mediaKey);

        if (fetchedRecord) {
          records.set(mediaKey, toDisplayRecord(fetchedRecord));
        }
      } catch (error) {
        logger.debug(
          {
            error,
            event: 'media_display_fetch_failed',
            mediaKey,
          },
          'Failed to fetch missing media display record'
        );

        // Best-effort enrichment only. The page can fall back to raw media keys.
      }
    })
  );

  return records;
};
