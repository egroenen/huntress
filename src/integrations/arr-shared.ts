import { z } from 'zod';

import { joinUrl, requestJson, type HttpRequestOptions } from './http.js';
import type {
  ArrCommandResponse,
  ArrQueueRecord,
  ArrSystemStatus,
  ArrWantedRecord,
} from './types.js';

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
  const result = await requestJson(
    joinUrl(options.baseUrl, `/api/v3/wanted/${kind}`),
    sonarrWantedResponseSchema,
    createRequestOptions(options)
  );

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
  const result = await requestJson(
    joinUrl(options.baseUrl, `/api/v3/wanted/${kind}`),
    radarrWantedResponseSchema,
    createRequestOptions(options)
  );

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
