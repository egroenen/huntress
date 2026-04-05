import { createHash } from 'node:crypto';

import type { MediaItemStateRecord } from '@/src/db';
import type { RuntimeContext } from '@/src/server/runtime';

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

const hasSonarrDisplayContext = (title: string): boolean => {
  return /\s-\s/.test(title) || /\sS\d{1,2}\s?E\d{1,3}\b/i.test(title) || /\s\d{1,2}x\d{1,3}\b/i.test(title);
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
      } catch {
        // Keep the stored record if enrichment fails; the page can still render.
      }
    })
  );

  return records;
};
