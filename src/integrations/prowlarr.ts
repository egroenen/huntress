import { z } from 'zod';

import { joinUrl, requestJson, type HttpRequestOptions } from './http';
import type { ProwlarrHealthRecord, ProwlarrIndexerStatusRecord } from './types';

const prowlarrHealthResponseSchema = z.array(
  z
    .object({
      source: z.string().nullable().optional(),
      type: z.string().nullable().optional(),
      level: z.string().nullable().optional(),
      message: z.string(),
    })
    .passthrough()
);

const prowlarrIndexerStatusResponseSchema = z.array(
  z
    .object({
      id: z.number(),
      name: z.string(),
      enable: z.boolean().optional(),
      enabled: z.boolean().optional(),
      status: z.string().nullable().optional(),
      failureMessage: z.string().nullable().optional(),
      protocol: z.string().nullable().optional(),
    })
    .passthrough()
);

export interface ProwlarrClientOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
}

const createHeaders = (apiKey: string): Record<string, string> => {
  return {
    Accept: 'application/json',
    'X-Api-Key': apiKey,
  };
};

const createRequestOptions = (options: ProwlarrClientOptions): HttpRequestOptions => {
  const requestOptions: HttpRequestOptions = {
    headers: createHeaders(options.apiKey),
  };

  if (options.timeoutMs !== undefined) {
    requestOptions.timeoutMs = options.timeoutMs;
  }

  return requestOptions;
};

export const createProwlarrClient = (options: ProwlarrClientOptions) => {
  return {
    async getHealth(): Promise<ProwlarrHealthRecord[]> {
      const result = await requestJson(
        joinUrl(options.baseUrl, '/api/v1/health'),
        prowlarrHealthResponseSchema,
        createRequestOptions(options)
      );

      return result.map((entry) => ({
        source: entry.source ?? null,
        type: entry.type ?? null,
        level: entry.level ?? null,
        message: entry.message,
      }));
    },
    async getIndexerStatus(): Promise<ProwlarrIndexerStatusRecord[]> {
      const result = await requestJson(
        joinUrl(options.baseUrl, '/api/v1/indexerstatus'),
        prowlarrIndexerStatusResponseSchema,
        createRequestOptions(options)
      );

      return result.map((entry) => ({
        id: entry.id,
        name: entry.name,
        enabled: entry.enabled ?? entry.enable ?? false,
        status: entry.status ?? null,
        failureMessage: entry.failureMessage ?? null,
        protocol: entry.protocol ?? null,
      }));
    },
  };
};

export type ProwlarrApiClient = ReturnType<typeof createProwlarrClient>;
