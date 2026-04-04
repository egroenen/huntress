import { z } from 'zod';

import { joinUrl, requestJson, type HttpRequestOptions } from './http';
import type {
  ArrCommandResponse,
  ArrQueueRecord,
  ArrWantedPageResult,
  ArrSystemStatus,
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
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const radarrWantedItemSchema = z
  .object({
    id: z.number(),
    title: z.string(),
    monitored: z.boolean(),
    hasFile: z.boolean().nullable().optional(),
    qualityCutoffNotMet: z.boolean().nullable().optional(),
    inCinemas: z.string().nullable().optional(),
    physicalRelease: z.string().nullable().optional(),
    digitalRelease: z.string().nullable().optional(),
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

const DEFAULT_WANTED_PAGE_SIZE = 250;

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
    title: entry.series?.title ? `${entry.series.title} - ${entry.title}` : entry.title,
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
      title: entry.series?.title ? `${entry.series.title} - ${entry.title}` : entry.title,
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
