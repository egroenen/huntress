import { z } from 'zod';

import { joinUrl, requestJson, type HttpRequestOptions } from './http';
import type {
  ArrCommandResponse,
  ArrQueueDeleteOptions,
  ArrQueueRecord,
  ArrReleaseRecord,
  ArrWantedPageResult,
  ArrSystemStatus,
  RadarrMovieRecord,
  SonarrEpisodeRecord,
  SonarrSeriesRecord,
  ArrWantedRecord,
} from './types';

const arrSystemStatusSchema = z.object({
  appName: z.string(),
  version: z.string(),
  instanceName: z.string().nullable().optional(),
  isDebug: z.boolean().nullable().optional(),
  isProduction: z.boolean().nullable().optional(),
  startupPath: z.string().nullable().optional(),
  urlBase: z.string().nullable().optional(),
});

const arrQueueEntrySchema = z.object({
  id: z.number(),
  title: z.string(),
  status: z.string().nullable().optional(),
  trackedDownloadState: z.string().nullable().optional(),
  trackedDownloadStatus: z.string().nullable().optional(),
  protocol: z.string().nullable().optional(),
  downloadId: z.string().nullable().optional(),
  estimatedCompletionTime: z.string().nullable().optional(),
});

const arrQueueResponseSchema = z.array(arrQueueEntrySchema.passthrough());
const arrCommandResponseSchema = z
  .object({
    id: z.number().nullable().optional(),
    name: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
  })
  .passthrough();

const arrReleaseSchema = z
  .object({
    guid: z.string(),
    indexerId: z.number().int().positive(),
    indexer: z.string().nullable().optional(),
    title: z.string(),
    downloadAllowed: z.boolean().nullable().optional(),
    approved: z.boolean().nullable().optional(),
    rejected: z.boolean().nullable().optional(),
    rejections: z.array(z.string()).nullable().optional(),
    protocol: z.string().nullable().optional(),
    quality: z
      .object({
        quality: z
          .object({
            name: z.string().nullable().optional(),
            resolution: z.number().int().nullable().optional(),
          })
          .passthrough()
          .nullable()
          .optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    qualityWeight: z.number().nullable().optional(),
    customFormatScore: z.number().nullable().optional(),
    size: z.number().nullable().optional(),
    ageHours: z.number().nullable().optional(),
    seeders: z.number().int().nullable().optional(),
    leechers: z.number().int().nullable().optional(),
    languages: z
      .array(
        z
          .object({
            name: z.string().nullable().optional(),
          })
          .passthrough()
      )
      .nullable()
      .optional(),
    infoUrl: z.string().nullable().optional(),
    infoHash: z.string().nullable().optional(),
  })
  .passthrough();

const arrReleaseResponseSchema = z.array(arrReleaseSchema);

const sonarrWantedItemSchema = z
  .object({
    id: z.number(),
    seriesId: z.number(),
    title: z.string(),
    monitored: z.boolean(),
    hasFile: z.boolean().nullable().optional(),
    airDateUtc: z.string().nullable().optional(),
    series: z
      .object({
        title: z.string().optional(),
        titleSlug: z.string().nullable().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const radarrWantedItemSchema = z
  .object({
    id: z.number(),
    title: z.string(),
    titleSlug: z.string().nullable().optional(),
    monitored: z.boolean(),
    hasFile: z.boolean().nullable().optional(),
    qualityCutoffNotMet: z.boolean().nullable().optional(),
    inCinemas: z.string().nullable().optional(),
    physicalRelease: z.string().nullable().optional(),
    digitalRelease: z.string().nullable().optional(),
  })
  .passthrough();

const sonarrSeriesSchema = z
  .object({
    id: z.number(),
    title: z.string(),
    titleSlug: z.string().nullable().optional(),
  })
  .passthrough();

const sonarrEpisodeSchema = z
  .object({
    id: z.number(),
    title: z.string(),
    seasonNumber: z.number().int().nullable().optional(),
    episodeNumber: z.number().int().nullable().optional(),
    seriesId: z.number(),
  })
  .passthrough();

const radarrMovieSchema = z
  .object({
    id: z.number(),
    title: z.string(),
    titleSlug: z.string().nullable().optional(),
  })
  .passthrough();

const sonarrWantedResponseSchema = z.array(sonarrWantedItemSchema);
const radarrWantedResponseSchema = z.array(radarrWantedItemSchema);
const paginatedSonarrWantedResponseSchema = z.object({
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().optional(),
  totalRecords: z.number().int().nonnegative().optional(),
  records: z.array(sonarrWantedItemSchema),
});
const paginatedRadarrWantedResponseSchema = z.object({
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().optional(),
  totalRecords: z.number().int().nonnegative().optional(),
  records: z.array(radarrWantedItemSchema),
});

export interface ArrClientOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  wantedPageSize?: number;
  activityReporter?: (event: {
    source: 'sonarr' | 'radarr';
    stage: string;
    message: string;
    detail?: string | null;
    progressCurrent?: number | null;
    progressTotal?: number | null;
    metadata?: Record<string, unknown>;
  }) => void;
  serviceName?: 'sonarr' | 'radarr';
}

const DEFAULT_WANTED_PAGE_SIZE = 50;

export const createArrHeaders = (apiKey: string): Record<string, string> => {
  return {
    Accept: 'application/json',
    'X-Api-Key': apiKey,
  };
};

const createRequestOptions = (options: ArrClientOptions): HttpRequestOptions => {
  const requestOptions: HttpRequestOptions = {
    headers: createArrHeaders(options.apiKey),
  };

  if (options.timeoutMs !== undefined) {
    requestOptions.timeoutMs = options.timeoutMs;
  }

  return requestOptions;
};

const reportActivity = (
  options: ArrClientOptions,
  event: Parameters<NonNullable<ArrClientOptions['activityReporter']>>[0]
): void => {
  options.activityReporter?.(event);
};

const buildPagedEndpoint = (
  baseUrl: string,
  path: string,
  page: number,
  pageSize?: number
): string => {
  const endpoint = new URL(joinUrl(baseUrl, path));
  endpoint.searchParams.set('page', String(page));
  if (pageSize) {
    endpoint.searchParams.set('pageSize', String(pageSize));
  }

  return endpoint.toString();
};

const buildExternalPath = (prefix: 'series' | 'movie', slug: string | null): string | null => {
  if (!slug) {
    return null;
  }

  const trimmedSlug = slug.trim();

  return trimmedSlug.length > 0 ? `${prefix}/${trimmedSlug}` : null;
};

const toArrReleaseRecord = (entry: z.infer<typeof arrReleaseSchema>): ArrReleaseRecord => {
  return {
    guid: entry.guid,
    guidUrl: entry.guid,
    indexerId: entry.indexerId,
    indexer: entry.indexer ?? null,
    title: entry.title,
    downloadAllowed: entry.downloadAllowed ?? false,
    approved: entry.approved ?? false,
    rejected: entry.rejected ?? false,
    rejections: entry.rejections ?? [],
    protocol: entry.protocol ?? null,
    qualityName: entry.quality?.quality?.name ?? null,
    qualityResolution: entry.quality?.quality?.resolution ?? null,
    qualityWeight: entry.qualityWeight ?? null,
    customFormatScore: entry.customFormatScore ?? 0,
    size: entry.size ?? null,
    ageHours: entry.ageHours ?? null,
    seeders: entry.seeders ?? null,
    leechers: entry.leechers ?? null,
    languages:
      entry.languages
        ?.map((language) => language.name?.trim() ?? null)
        .filter((name): name is string => Boolean(name)) ?? [],
    infoUrl: entry.infoUrl ?? null,
    infoHash: entry.infoHash?.trim() || null,
    payload: entry,
  };
};

const formatEpisodeCode = (
  seasonNumber: unknown,
  episodeNumber: unknown
): string | null => {
  if (
    typeof seasonNumber !== 'number' ||
    typeof episodeNumber !== 'number' ||
    !Number.isInteger(seasonNumber) ||
    !Number.isInteger(episodeNumber)
  ) {
    return null;
  }

  return `S${seasonNumber} E${episodeNumber}`;
};

const buildSonarrWantedTitle = (entry: {
  series?: { title?: string | undefined } | undefined;
  title: string;
  seasonNumber?: unknown;
  episodeNumber?: unknown;
}): string => {
  const segments = [
    entry.series?.title?.trim() || null,
    formatEpisodeCode(entry.seasonNumber, entry.episodeNumber),
    entry.title.trim(),
  ].filter((segment): segment is string => Boolean(segment && segment.length > 0));

  return segments.join(' - ');
};

interface ArrPaginatedResponse<TItem> {
  page?: number | undefined;
  pageSize?: number | undefined;
  totalRecords?: number | undefined;
  records: TItem[];
}

const fetchWantedPage = async <TItem>(input: {
  options: ArrClientOptions;
  path: string;
  page: number;
  arraySchema: z.ZodType<TItem[]>;
  paginatedSchema: z.ZodType<ArrPaginatedResponse<TItem>>;
  stagePrefix: string;
}): Promise<{
  page: number;
  pageSize: number;
  totalPages: number;
  totalRecords: number;
  records: TItem[];
}> => {
  const source = input.options.serviceName ?? 'sonarr';
  const requestedPageSize = input.options.wantedPageSize ?? DEFAULT_WANTED_PAGE_SIZE;
  reportActivity(input.options, {
    source,
    stage: `${input.stagePrefix}_page`,
    message: `Requesting ${source} ${input.path.replace('/api/v3/wanted/', '')} page ${input.page}`,
    progressCurrent: input.page,
    progressTotal: null,
    detail: `${input.path} (pageSize=${requestedPageSize})`,
    metadata: {
      path: input.path,
      page: input.page,
      requestedPageSize,
    },
  });

  const pageRaw = await requestJson(
    buildPagedEndpoint(input.options.baseUrl, input.path, input.page, requestedPageSize),
    z.unknown(),
    createRequestOptions(input.options)
  );

  const arrayResult = input.arraySchema.safeParse(pageRaw);

  if (arrayResult.success) {
    reportActivity(input.options, {
      source,
      stage: `${input.stagePrefix}_page`,
      message: `Loaded ${source} ${input.path.replace('/api/v3/wanted/', '')} page 1 of 1`,
      progressCurrent: 1,
      progressTotal: 1,
      detail: `${arrayResult.data.length} records accumulated`,
      metadata: {
        path: input.path,
        page: 1,
        requestedPageSize,
        pageSize: arrayResult.data.length,
        totalRecords: arrayResult.data.length,
      },
    });

    return {
      page: 1,
      pageSize: arrayResult.data.length,
      totalPages: 1,
      totalRecords: arrayResult.data.length,
      records: arrayResult.data,
    };
  }

  const paginatedResult = input.paginatedSchema.parse(pageRaw);
  const records = [...paginatedResult.records];
  const pageSize = paginatedResult.pageSize ?? paginatedResult.records.length;
  const totalRecords = paginatedResult.totalRecords ?? paginatedResult.records.length;
  const totalPages =
    pageSize > 0 ? Math.max(Math.ceil(totalRecords / pageSize), 1) : 1;

  reportActivity(input.options, {
    source,
    stage: `${input.stagePrefix}_page`,
    message: `Loaded ${source} ${input.path.replace('/api/v3/wanted/', '')} page ${input.page} of ${totalPages}`,
    progressCurrent: input.page,
    progressTotal: totalPages,
    detail: `${records.length} records accumulated`,
    metadata: {
      path: input.path,
      page: input.page,
      requestedPageSize,
      pageSize,
      totalRecords,
    },
  });

  return {
    page: paginatedResult.page ?? input.page,
    pageSize,
    totalPages,
    totalRecords,
    records,
  };
};

const fetchWantedCollection = async <TItem>(input: {
  options: ArrClientOptions;
  path: string;
  arraySchema: z.ZodType<TItem[]>;
  paginatedSchema: z.ZodType<ArrPaginatedResponse<TItem>>;
  stagePrefix: string;
}): Promise<{
  page: number;
  pageSize: number;
  totalPages: number;
  totalRecords: number;
  records: TItem[];
}> => {
  const firstPage = await fetchWantedPage({
    ...input,
    page: 1,
  });

  if (firstPage.totalPages <= 1 || firstPage.totalRecords <= firstPage.records.length) {
    return firstPage;
  }

  const records = [...firstPage.records];

  for (let page = 2; page <= firstPage.totalPages; page += 1) {
    const nextPage = await fetchWantedPage({
      ...input,
      page,
    });

    records.push(...nextPage.records);
  }

  return {
    ...firstPage,
    records,
  };
};

export const fetchArrSystemStatus = async (
  options: ArrClientOptions
): Promise<ArrSystemStatus> => {
  if (options.serviceName) {
    reportActivity(options, {
      source: options.serviceName,
      stage: 'system_status',
      message: `Requesting ${options.serviceName} system status`,
      detail: '/api/v3/system/status',
    });
  }
  const result = await requestJson(
    joinUrl(options.baseUrl, '/api/v3/system/status'),
    arrSystemStatusSchema,
    createRequestOptions(options)
  );

  return {
    appName: result.appName,
    version: result.version,
    instanceName: result.instanceName ?? null,
    isDebug: result.isDebug ?? null,
    isProduction: result.isProduction ?? null,
    startupPath: result.startupPath ?? null,
    urlBase: result.urlBase ?? null,
  };
};

export const fetchArrQueue = async (
  options: ArrClientOptions
): Promise<ArrQueueRecord[]> => {
  if (options.serviceName) {
    reportActivity(options, {
      source: options.serviceName,
      stage: 'queue_details',
      message: `Requesting ${options.serviceName} queue details`,
      detail: '/api/v3/queue/details',
    });
  }
  const result = await requestJson(
    joinUrl(options.baseUrl, '/api/v3/queue/details'),
    arrQueueResponseSchema,
    createRequestOptions(options)
  );

  return result.map((entry) => ({
    id: entry.id,
    title: entry.title,
    status: entry.status ?? null,
    trackedDownloadState: entry.trackedDownloadState ?? null,
    trackedDownloadStatus: entry.trackedDownloadStatus ?? null,
    protocol: entry.protocol ?? null,
    downloadId: entry.downloadId ?? null,
    estimatedCompletionTime: entry.estimatedCompletionTime ?? null,
    payload: entry,
  }));
};

export const fetchArrReleases = async (
  options: ArrClientOptions,
  input: { episodeId?: number; movieId?: number }
): Promise<ArrReleaseRecord[]> => {
  const endpoint = new URL(joinUrl(options.baseUrl, '/api/v3/release'));

  if (input.episodeId) {
    endpoint.searchParams.set('episodeId', String(input.episodeId));
  }

  if (input.movieId) {
    endpoint.searchParams.set('movieId', String(input.movieId));
  }

  if (options.serviceName) {
    reportActivity(options, {
      source: options.serviceName,
      stage: 'release_candidates',
      message: `Requesting ${options.serviceName} release candidates`,
      detail: endpoint.pathname + endpoint.search,
      metadata: {
        episodeId: input.episodeId ?? null,
        movieId: input.movieId ?? null,
      },
    });
  }

  const result = await requestJson(
    endpoint.toString(),
    arrReleaseResponseSchema,
    createRequestOptions(options)
  );

  return result.map((entry) => toArrReleaseRecord(entry));
};

export const fetchSonarrSeries = async (
  options: ArrClientOptions,
  seriesId: number
): Promise<SonarrSeriesRecord> => {
  const result = await requestJson(
    joinUrl(options.baseUrl, `/api/v3/series/${seriesId}`),
    sonarrSeriesSchema,
    createRequestOptions(options)
  );

  return {
    id: result.id,
    title: result.title,
    titleSlug: result.titleSlug ?? null,
  };
};

export const fetchSonarrEpisode = async (
  options: ArrClientOptions,
  episodeId: number
): Promise<SonarrEpisodeRecord> => {
  const result = await requestJson(
    joinUrl(options.baseUrl, `/api/v3/episode/${episodeId}`),
    sonarrEpisodeSchema,
    createRequestOptions(options)
  );

  return {
    id: result.id,
    title: result.title,
    seasonNumber: result.seasonNumber ?? null,
    episodeNumber: result.episodeNumber ?? null,
    seriesId: result.seriesId,
  };
};

export const fetchRadarrMovie = async (
  options: ArrClientOptions,
  movieId: number
): Promise<RadarrMovieRecord> => {
  const result = await requestJson(
    joinUrl(options.baseUrl, `/api/v3/movie/${movieId}`),
    radarrMovieSchema,
    createRequestOptions(options)
  );

  return {
    id: result.id,
    title: result.title,
    titleSlug: result.titleSlug ?? null,
  };
};

export const deleteArrQueueItem = async (
  options: ArrClientOptions,
  queueId: number,
  deleteOptions: ArrQueueDeleteOptions
): Promise<void> => {
  if (options.serviceName) {
    reportActivity(options, {
      source: options.serviceName,
      stage: 'queue_delete',
      message: `Removing ${options.serviceName} queue item ${queueId}`,
      detail: `/api/v3/queue/${queueId}`,
      metadata: {
        queueId,
        removeFromClient: deleteOptions.removeFromClient,
        blocklist: deleteOptions.blocklist,
        skipRedownload: deleteOptions.skipRedownload,
      },
    });
  }

  const endpoint = new URL(joinUrl(options.baseUrl, `/api/v3/queue/${queueId}`));
  endpoint.searchParams.set(
    'removeFromClient',
    deleteOptions.removeFromClient ? 'true' : 'false'
  );
  endpoint.searchParams.set('blocklist', deleteOptions.blocklist ? 'true' : 'false');
  endpoint.searchParams.set(
    'skipRedownload',
    deleteOptions.skipRedownload ? 'true' : 'false'
  );

  await requestJson(endpoint.toString(), z.unknown(), {
    ...createRequestOptions(options),
    method: 'DELETE',
  });
};

export const fetchSonarrWanted = async (
  options: ArrClientOptions,
  kind: 'missing' | 'cutoff'
): Promise<ArrWantedRecord[]> => {
  const result = await fetchWantedCollection({
    options,
    path: `/api/v3/wanted/${kind}`,
    arraySchema: sonarrWantedResponseSchema,
    paginatedSchema: paginatedSonarrWantedResponseSchema,
    stagePrefix: `wanted_${kind}`,
  });

  return result.records.map((entry) => ({
    itemType: 'episode',
    itemId: entry.id,
    parentId: entry.seriesId,
    externalPath: buildExternalPath('series', entry.series?.titleSlug ?? null),
    title: buildSonarrWantedTitle(entry),
    monitored: entry.monitored,
    hasFile: entry.hasFile ?? null,
    qualityCutoffNotMet: kind === 'cutoff' ? true : null,
    releaseDate: entry.airDateUtc ?? null,
    payload: entry,
  }));
};

export const fetchRadarrWanted = async (
  options: ArrClientOptions,
  kind: 'missing' | 'cutoff'
): Promise<ArrWantedRecord[]> => {
  const result = await fetchWantedCollection({
    options,
    path: `/api/v3/wanted/${kind}`,
    arraySchema: radarrWantedResponseSchema,
    paginatedSchema: paginatedRadarrWantedResponseSchema,
    stagePrefix: `wanted_${kind}`,
  });

  return result.records.map((entry) => ({
    itemType: 'movie',
    itemId: entry.id,
    parentId: null,
    externalPath: buildExternalPath('movie', entry.titleSlug ?? null),
    title: entry.title,
    monitored: entry.monitored,
    hasFile: entry.hasFile ?? null,
    qualityCutoffNotMet: kind === 'cutoff' ? (entry.qualityCutoffNotMet ?? true) : null,
    releaseDate: entry.digitalRelease ?? entry.physicalRelease ?? entry.inCinemas ?? null,
    payload: entry,
  }));
};

export const fetchSonarrWantedPage = async (
  options: ArrClientOptions,
  kind: 'missing' | 'cutoff',
  page: number
): Promise<ArrWantedPageResult> => {
  const result = await fetchWantedPage({
    options,
    path: `/api/v3/wanted/${kind}`,
    page,
    arraySchema: sonarrWantedResponseSchema,
    paginatedSchema: paginatedSonarrWantedResponseSchema,
    stagePrefix: `wanted_${kind}`,
  });

  return {
    page: result.page,
    pageSize: result.pageSize,
    totalPages: result.totalPages,
    totalRecords: result.totalRecords,
    records: result.records.map((entry) => ({
      itemType: 'episode',
      itemId: entry.id,
      parentId: entry.seriesId,
      externalPath: buildExternalPath('series', entry.series?.titleSlug ?? null),
      title: buildSonarrWantedTitle(entry),
      monitored: entry.monitored,
      hasFile: entry.hasFile ?? null,
      qualityCutoffNotMet: kind === 'cutoff' ? true : null,
      releaseDate: entry.airDateUtc ?? null,
      payload: entry,
    })),
  };
};

export const fetchRadarrWantedPage = async (
  options: ArrClientOptions,
  kind: 'missing' | 'cutoff',
  page: number
): Promise<ArrWantedPageResult> => {
  const result = await fetchWantedPage({
    options,
    path: `/api/v3/wanted/${kind}`,
    page,
    arraySchema: radarrWantedResponseSchema,
    paginatedSchema: paginatedRadarrWantedResponseSchema,
    stagePrefix: `wanted_${kind}`,
  });

  return {
    page: result.page,
    pageSize: result.pageSize,
    totalPages: result.totalPages,
    totalRecords: result.totalRecords,
    records: result.records.map((entry) => ({
      itemType: 'movie',
      itemId: entry.id,
      parentId: null,
      externalPath: buildExternalPath('movie', entry.titleSlug ?? null),
      title: entry.title,
      monitored: entry.monitored,
      hasFile: entry.hasFile ?? null,
      qualityCutoffNotMet: kind === 'cutoff' ? (entry.qualityCutoffNotMet ?? true) : null,
      releaseDate: entry.digitalRelease ?? entry.physicalRelease ?? entry.inCinemas ?? null,
      payload: entry,
    })),
  };
};

export const dispatchArrCommand = async (
  options: ArrClientOptions,
  payload: Record<string, unknown>
): Promise<ArrCommandResponse> => {
  const result = await requestJson(
    joinUrl(options.baseUrl, '/api/v3/command'),
    arrCommandResponseSchema,
    {
      ...createRequestOptions(options),
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        ...createArrHeaders(options.apiKey),
        'Content-Type': 'application/json',
      },
    }
  );

  return {
    id: result.id ?? null,
    name: result.name ?? null,
    status: result.status ?? null,
  };
};

export const grabArrRelease = async (
  options: ArrClientOptions,
  input: { guid: string; indexerId: number }
): Promise<ArrCommandResponse> => {
  if (options.serviceName) {
    reportActivity(options, {
      source: options.serviceName,
      stage: 'release_grab',
      message: `Submitting ${options.serviceName} release grab`,
      detail: `Indexer ${input.indexerId}`,
      metadata: {
        indexerId: input.indexerId,
      },
    });
  }

  const result = await requestJson(
    joinUrl(options.baseUrl, '/api/v3/release'),
    z.unknown(),
    {
      ...createRequestOptions(options),
      method: 'POST',
      body: JSON.stringify({
        guid: input.guid,
        indexerId: input.indexerId,
      }),
      headers: {
        ...createArrHeaders(options.apiKey),
        'Content-Type': 'application/json',
      },
    }
  );

  if (typeof result === 'object' && result !== null) {
    const record = result as Record<string, unknown>;

    return {
      id: typeof record.id === 'number' ? record.id : null,
      name: typeof record.name === 'string' ? record.name : 'ReleaseGrab',
      status: typeof record.status === 'string' ? record.status : 'queued',
    };
  }

  return {
    id: null,
    name: 'ReleaseGrab',
    status: 'queued',
  };
};
