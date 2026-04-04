import { z } from 'zod';

import { joinUrl, requestJson, type HttpRequestOptions } from './http';
import type {
  ArrCommandResponse,
  ArrQueueRecord,
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
}

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

const buildPagedEndpoint = (baseUrl: string, path: string, page: number): string => {
  const endpoint = new URL(joinUrl(baseUrl, path));
  endpoint.searchParams.set('page', String(page));

  return endpoint.toString();
};

interface ArrPaginatedResponse<TItem> {
  page?: number | undefined;
  pageSize?: number | undefined;
  totalRecords?: number | undefined;
  records: TItem[];
}

const fetchWantedCollection = async <TItem>(input: {
  options: ArrClientOptions;
  path: string;
  arraySchema: z.ZodType<TItem[]>;
  paginatedSchema: z.ZodType<ArrPaginatedResponse<TItem>>;
}): Promise<TItem[]> => {
  const firstPageRaw = await requestJson(
    buildPagedEndpoint(input.options.baseUrl, input.path, 1),
    z.unknown(),
    createRequestOptions(input.options)
  );

  const arrayResult = input.arraySchema.safeParse(firstPageRaw);

  if (arrayResult.success) {
    return arrayResult.data;
  }

  const paginatedResult = input.paginatedSchema.parse(firstPageRaw);
  const records = [...paginatedResult.records];
  const pageSize = paginatedResult.pageSize ?? paginatedResult.records.length;
  const totalRecords = paginatedResult.totalRecords ?? paginatedResult.records.length;

  if (pageSize <= 0 || totalRecords <= records.length) {
    return records;
  }

  const totalPages = Math.max(Math.ceil(totalRecords / pageSize), 1);

  for (let page = 2; page <= totalPages; page += 1) {
    const nextPage = await requestJson(
      buildPagedEndpoint(input.options.baseUrl, input.path, page),
      input.paginatedSchema,
      createRequestOptions(input.options)
    );

    records.push(...nextPage.records);
  }

  return records;
};

export const fetchArrSystemStatus = async (
  options: ArrClientOptions
): Promise<ArrSystemStatus> => {
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
  });

  return result.map((entry) => ({
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
  });

  return result.map((entry) => ({
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
