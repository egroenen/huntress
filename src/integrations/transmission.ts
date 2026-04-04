import { z } from 'zod';

import { IntegrationError } from './http';
import type { TransmissionSessionProbe, TransmissionTorrentRecord } from './types';

const transmissionResponseSchema = z.object({
  arguments: z.record(z.string(), z.unknown()),
  result: z.string(),
});

const transmissionSessionResponseSchema = z.object({
  'rpc-version': z.number().nullable().optional(),
  'rpc-version-minimum': z.number().nullable().optional(),
  version: z.string().nullable().optional(),
});

const transmissionTorrentSchema = z.object({
  id: z.number(),
  hashString: z.string(),
  name: z.string(),
  status: z.number(),
  percentDone: z.number(),
  error: z.number(),
  errorString: z.string().nullable().optional(),
  eta: z.number().nullable().optional(),
  rateDownload: z.number(),
  rateUpload: z.number(),
  addedDate: z.number(),
  doneDate: z.number(),
  activityDate: z.number(),
});

const transmissionTorrentListSchema = z.object({
  torrents: z.array(transmissionTorrentSchema),
});
const transmissionEmptyArgumentsSchema = z.record(z.string(), z.unknown());

interface TransmissionRpcEnvelope {
  method: string;
  arguments?: Record<string, unknown>;
}

export interface TransmissionClientOptions {
  baseUrl: string;
  username?: string | null;
  password?: string | null;
  timeoutMs?: number;
  activityReporter?: (event: {
    source: 'transmission';
    stage: string;
    message: string;
    detail?: string | null;
    progressCurrent?: number | null;
    progressTotal?: number | null;
    metadata?: Record<string, unknown>;
  }) => void;
}

const DEFAULT_TIMEOUT_MS = 10_000;

const createBasicAuth = (username: string, password: string): string => {
  return Buffer.from(`${username}:${password}`).toString('base64');
};

export const createTransmissionClient = (options: TransmissionClientOptions) => {
  let sessionId: string | null = null;

  const reportActivity = (
    event: Parameters<NonNullable<TransmissionClientOptions['activityReporter']>>[0]
  ) => {
    options.activityReporter?.(event);
  };

  const doRpcRequest = async <T>(
    payload: TransmissionRpcEnvelope,
    schema: { parse: (input: unknown) => T }
  ): Promise<T> => {
    reportActivity({
      source: 'transmission',
      stage: payload.method,
      message: `Transmission RPC ${payload.method}`,
      detail: options.baseUrl,
    });
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    );

    const send = async (): Promise<Response> => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (options.username && options.password) {
        headers.Authorization = `Basic ${createBasicAuth(options.username, options.password)}`;
      }

      if (sessionId) {
        headers['X-Transmission-Session-Id'] = sessionId;
      }

      return fetch(options.baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    };

    try {
      let response = await send();

      if (response.status === 409) {
        const newSessionId = response.headers.get('X-Transmission-Session-Id');

        if (!newSessionId) {
          throw new IntegrationError({
            message: 'Transmission 409 response did not include a session id',
            code: 'http',
            endpoint: options.baseUrl,
            status: 409,
          });
        }

        sessionId = newSessionId;
        response = await send();
      }

      const parsedBody = await response.json().catch(async () => {
        return response.text();
      });

      if (!response.ok) {
        throw new IntegrationError({
          message: `Transmission RPC returned HTTP ${response.status}`,
          code: 'http',
          endpoint: options.baseUrl,
          status: response.status,
          body: parsedBody,
        });
      }

      const envelope = transmissionResponseSchema.parse(parsedBody);

      if (envelope.result !== 'success') {
        throw new IntegrationError({
          message: `Transmission RPC failed with result: ${envelope.result}`,
          code: 'invalid_response',
          endpoint: options.baseUrl,
          body: parsedBody,
        });
      }

      return schema.parse(envelope.arguments);
    } catch (error) {
      if (error instanceof IntegrationError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new IntegrationError({
          message: `Transmission RPC request timed out`,
          code: 'timeout',
          endpoint: options.baseUrl,
          cause: error,
        });
      }

      throw new IntegrationError({
        message: `Transmission RPC network error`,
        code: 'network',
        endpoint: options.baseUrl,
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
    }
  };

  return {
    async probeSession(): Promise<TransmissionSessionProbe> {
      const result = await doRpcRequest(
        {
          method: 'session-get',
        },
        transmissionSessionResponseSchema
      );

      return {
        rpcVersion: result['rpc-version'] ?? null,
        rpcVersionMinimum: result['rpc-version-minimum'] ?? null,
        version: result.version ?? null,
      };
    },
    async getTorrents(): Promise<TransmissionTorrentRecord[]> {
      const result = await doRpcRequest(
        {
          method: 'torrent-get',
          arguments: {
            fields: [
              'id',
              'hashString',
              'name',
              'status',
              'percentDone',
              'error',
              'errorString',
              'eta',
              'rateDownload',
              'rateUpload',
              'addedDate',
              'doneDate',
              'activityDate',
            ],
          },
        },
        transmissionTorrentListSchema
      );

      reportActivity({
        source: 'transmission',
        stage: 'torrent_get_complete',
        message: `Loaded ${result.torrents.length} Transmission torrents`,
        detail: null,
        progressCurrent: result.torrents.length,
        progressTotal: result.torrents.length,
      });

      return result.torrents.map((torrent) => ({
        id: torrent.id,
        hashString: torrent.hashString,
        name: torrent.name,
        status: torrent.status,
        percentDone: torrent.percentDone,
        error: torrent.error,
        errorString: torrent.errorString ?? null,
        eta: torrent.eta ?? null,
        rateDownload: torrent.rateDownload,
        rateUpload: torrent.rateUpload,
        addedDate: torrent.addedDate,
        doneDate: torrent.doneDate,
        activityDate: torrent.activityDate,
      }));
    },
    async removeTorrent(hashString: string, deleteLocalData: boolean): Promise<void> {
      reportActivity({
        source: 'transmission',
        stage: 'torrent_remove',
        message: `Removing Transmission torrent ${hashString}`,
        detail: deleteLocalData ? 'Deleting local data' : 'Keeping local data',
      });
      await doRpcRequest(
        {
          method: 'torrent-remove',
          arguments: {
            ids: [hashString],
            'delete-local-data': deleteLocalData,
          },
        },
        transmissionEmptyArgumentsSchema
      );
    },
  };
};

export type TransmissionApiClient = ReturnType<typeof createTransmissionClient>;
