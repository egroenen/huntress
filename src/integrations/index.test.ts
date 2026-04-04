import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import test from 'node:test';

import { IntegrationError } from './http';
import { createProwlarrClient } from './prowlarr';
import { createRadarrClient } from './radarr';
import { createSonarrClient } from './sonarr';
import { createTransmissionClient } from './transmission';

interface TestServerContext {
  url: string;
  close(): Promise<void>;
}

const startJsonServer = async (
  handler: (request: IncomingMessage, response: ServerResponse) => void
): Promise<TestServerContext> => {
  const server = createServer(handler);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Failed to determine test server address');
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    close(): Promise<void> {
      return new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },
  };
};

test('Sonarr client probes system status and normalizes wanted/queue responses', async () => {
  const server = await startJsonServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');

    if (url.pathname === '/api/v3/system/status') {
      response.end(
        JSON.stringify({
          appName: 'Sonarr',
          version: '4.0.0',
          instanceName: 'tv',
          isDebug: false,
          isProduction: true,
          startupPath: '/app',
          urlBase: '',
        })
      );
      return;
    }

    if (url.pathname === '/api/v3/wanted/missing') {
      assert.equal(url.searchParams.get('pageSize'), '250');
      const page = Number(url.searchParams.get('page') ?? '1');
      response.end(
        JSON.stringify([
          ...(page === 1
            ? [
                {
                  id: 101,
                  seriesId: 8,
                  title: 'Pilot',
                  monitored: true,
                  hasFile: false,
                  airDateUtc: '2024-01-01T00:00:00Z',
                  series: { title: 'Example Series' },
                },
              ]
            : []),
        ])
      );
      return;
    }

    if (url.pathname === '/api/v3/wanted/cutoff' && url.searchParams.get('page') === '2') {
      assert.equal(url.searchParams.get('pageSize'), '250');
      response.end(
        JSON.stringify({
          page: 2,
          pageSize: 1,
          totalRecords: 2,
          records: [
            {
              id: 103,
              seriesId: 8,
              title: 'Third Episode',
              monitored: true,
              hasFile: true,
              airDateUtc: '2024-01-03T00:00:00Z',
            },
          ],
        })
      );
      return;
    }

    if (url.pathname === '/api/v3/wanted/cutoff') {
      assert.equal(url.searchParams.get('pageSize'), '250');
      response.end(
        JSON.stringify({
          page: 1,
          pageSize: 1,
          totalRecords: 2,
          records: [
            {
              id: 102,
              seriesId: 8,
              title: 'Second Episode',
              monitored: true,
              hasFile: true,
              airDateUtc: '2024-01-02T00:00:00Z',
            },
          ],
        })
      );
      return;
    }

    if (url.pathname === '/api/v3/queue/details') {
      response.end(
        JSON.stringify([
          {
            id: 1,
            title: 'Example Queue Item',
            status: 'downloading',
            trackedDownloadState: 'downloading',
            trackedDownloadStatus: 'ok',
            protocol: 'torrent',
            downloadId: 'dl-1',
            estimatedCompletionTime: '2026-01-01T01:00:00Z',
          },
        ])
      );
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'not found' }));
  });

  try {
    const client = createSonarrClient({
      baseUrl: server.url,
      apiKey: 'sonarr-key',
      wantedPageSize: 250,
    });

    const [status, missing, cutoff, queue] = await Promise.all([
      client.probeSystemStatus(),
      client.getWantedMissing(),
      client.getWantedCutoff(),
      client.getQueueDetails(),
    ]);

    assert.equal(status.appName, 'Sonarr');
    assert.equal(missing[0]?.title, 'Example Series - Pilot');
    assert.equal(cutoff.length, 2);
    assert.equal(cutoff[0]?.qualityCutoffNotMet, true);
    assert.equal(queue[0]?.downloadId, 'dl-1');
  } finally {
    await server.close();
  }
});

test('Radarr client normalizes wanted movie responses', async () => {
  const server = await startJsonServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');

    if (url.pathname === '/api/v3/system/status') {
      response.end(
        JSON.stringify({
          appName: 'Radarr',
          version: '5.0.0',
        })
      );
      return;
    }

    if (url.pathname === '/api/v3/wanted/missing' && url.searchParams.get('page') === '2') {
      assert.equal(url.searchParams.get('pageSize'), '250');
      response.end(
        JSON.stringify({
          page: 2,
          pageSize: 1,
          totalRecords: 2,
          records: [
            {
              id: 79,
              title: 'Movie Three',
              monitored: true,
              hasFile: false,
              digitalRelease: '2024-02-05T00:00:00Z',
            },
          ],
        })
      );
      return;
    }

    if (url.pathname === '/api/v3/wanted/missing') {
      assert.equal(url.searchParams.get('pageSize'), '250');
      response.end(
        JSON.stringify({
          page: 1,
          pageSize: 1,
          totalRecords: 2,
          records: [
            {
              id: 77,
              title: 'Movie One',
              monitored: true,
              hasFile: false,
              digitalRelease: '2024-02-03T00:00:00Z',
            },
          ],
        })
      );
      return;
    }

    if (url.pathname === '/api/v3/wanted/cutoff') {
      assert.equal(url.searchParams.get('pageSize'), '250');
      response.end(
        JSON.stringify([
          {
            id: 78,
            title: 'Movie Two',
            monitored: true,
            qualityCutoffNotMet: false,
            physicalRelease: '2024-02-04T00:00:00Z',
          },
        ])
      );
      return;
    }

    if (url.pathname === '/api/v3/queue/details') {
      response.end(JSON.stringify([]));
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'not found' }));
  });

  try {
    const client = createRadarrClient({
      baseUrl: server.url,
      apiKey: 'radarr-key',
      wantedPageSize: 250,
    });

    const missing = await client.getWantedMissing();
    const cutoff = await client.getWantedCutoff();

    assert.equal(missing.length, 2);
    assert.equal(missing[0]?.itemType, 'movie');
    assert.equal(missing[0]?.releaseDate, '2024-02-03T00:00:00Z');
    assert.equal(cutoff[0]?.qualityCutoffNotMet, false);
  } finally {
    await server.close();
  }
});

test('Prowlarr client normalizes health and indexer status', async () => {
  const server = await startJsonServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');

    if (url.pathname === '/api/v1/health') {
      response.end(
        JSON.stringify([
          {
            source: 'IndexerStatusCheck',
            type: 'warning',
            message: 'Indexer degraded',
          },
        ])
      );
      return;
    }

    if (url.pathname === '/api/v1/indexerstatus') {
      response.end(
        JSON.stringify([
          {
            indexerId: 5,
            disabledTill: '2026-04-05T05:13:31Z',
            mostRecentFailure: '2026-04-04T05:13:31Z',
          },
        ])
      );
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'not found' }));
  });

  try {
    const client = createProwlarrClient({
      baseUrl: server.url,
      apiKey: 'prowlarr-key',
    });

    const [health, indexers] = await Promise.all([
      client.getHealth(),
      client.getIndexerStatus(),
    ]);

    assert.equal(health[0]?.message, 'Indexer degraded');
    assert.equal(health[0]?.level, 'warning');
    assert.equal(indexers[0]?.enabled, true);
    assert.equal(indexers[0]?.name, 'Indexer #5');
    assert.equal(indexers[0]?.status, 'failed');
  } finally {
    await server.close();
  }
});

test('Transmission client refreshes session id after a 409 challenge', async () => {
  let sawSessionHeader = false;

  const server = await startJsonServer((request, response) => {
    if (request.headers['x-transmission-session-id'] !== 'session-123') {
      response.statusCode = 409;
      response.setHeader('X-Transmission-Session-Id', 'session-123');
      response.end();
      return;
    }

    sawSessionHeader = true;
    response.setHeader('Content-Type', 'application/json');
    response.end(
      JSON.stringify({
        arguments: {
          torrents: [
            {
              id: 1,
              hashString: 'abc',
              name: 'Example Torrent',
              status: 4,
              percentDone: 0.5,
              error: 0,
              errorString: '',
              eta: 600,
              rateDownload: 1024,
              rateUpload: 0,
              addedDate: 100,
              doneDate: 0,
              activityDate: 200,
            },
          ],
        },
        result: 'success',
      })
    );
  });

  try {
    const client = createTransmissionClient({
      baseUrl: server.url,
      username: 'user',
      password: 'pass',
    });

    const torrents = await client.getTorrents();

    assert.equal(sawSessionHeader, true);
    assert.equal(torrents[0]?.hashString, 'abc');
  } finally {
    await server.close();
  }
});

test('Transmission probe returns session metadata', async () => {
  let requestCount = 0;

  const server = await startJsonServer((request, response) => {
    requestCount += 1;

    if (requestCount === 1) {
      response.statusCode = 409;
      response.setHeader('X-Transmission-Session-Id', 'session-abc');
      response.end();
      return;
    }

    response.setHeader('Content-Type', 'application/json');
    response.end(
      JSON.stringify({
        arguments: {
          'rpc-version': 17,
          'rpc-version-minimum': 15,
          version: '4.0.6',
        },
        result: 'success',
      })
    );
  });

  try {
    const client = createTransmissionClient({
      baseUrl: server.url,
      username: 'user',
      password: 'pass',
    });

    const session = await client.probeSession();

    assert.equal(session.rpcVersion, 17);
    assert.equal(session.version, '4.0.6');
  } finally {
    await server.close();
  }
});

test('Transmission probe works without basic auth when the RPC endpoint is open', async () => {
  let authorizationHeader: string | undefined;

  const server = await startJsonServer((request, response) => {
    authorizationHeader =
      typeof request.headers.authorization === 'string'
        ? request.headers.authorization
        : undefined;

    if (request.headers['x-transmission-session-id'] !== 'session-open') {
      response.statusCode = 409;
      response.setHeader('X-Transmission-Session-Id', 'session-open');
      response.end();
      return;
    }

    response.setHeader('Content-Type', 'application/json');
    response.end(
      JSON.stringify({
        arguments: {
          'rpc-version': 17,
          'rpc-version-minimum': 15,
          version: '4.0.6',
        },
        result: 'success',
      })
    );
  });

  try {
    const client = createTransmissionClient({
      baseUrl: server.url,
    });

    const session = await client.probeSession();

    assert.equal(session.rpcVersion, 17);
    assert.equal(authorizationHeader, undefined);
  } finally {
    await server.close();
  }
});

test('request timeouts surface as IntegrationError', async () => {
  const server = await startJsonServer((_request, response) => {
    setTimeout(() => {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ appName: 'Sonarr', version: '4.0.0' }));
    }, 100);
  });

  try {
    const client = createSonarrClient({
      baseUrl: server.url,
      apiKey: 'sonarr-key',
      timeoutMs: 10,
    });

    await assert.rejects(
      async () => client.probeSystemStatus(),
      (error: unknown) => {
        assert.ok(error instanceof IntegrationError);
        assert.equal(error.code, 'timeout');
        return true;
      }
    );
  } finally {
    await server.close();
  }
});

test('invalid responses surface as IntegrationError', async () => {
  const server = await startJsonServer((_request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ appName: 'Sonarr' }));
  });

  try {
    const client = createSonarrClient({
      baseUrl: server.url,
      apiKey: 'sonarr-key',
    });

    await assert.rejects(
      async () => client.probeSystemStatus(),
      (error: unknown) => {
        assert.ok(error instanceof IntegrationError);
        assert.equal(error.code, 'invalid_response');
        return true;
      }
    );
  } finally {
    await server.close();
  }
});
