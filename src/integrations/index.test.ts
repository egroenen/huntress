import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import test from 'node:test';

import { IntegrationError } from './http.js';
import { createProwlarrClient } from './prowlarr.js';
import { createRadarrClient } from './radarr.js';
import { createSonarrClient } from './sonarr.js';
import { createTransmissionClient } from './transmission.js';

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

    if (request.url === '/api/v3/system/status') {
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

    if (request.url === '/api/v3/wanted/missing') {
      response.end(
        JSON.stringify([
          {
            id: 101,
            seriesId: 8,
            title: 'Pilot',
            monitored: true,
            hasFile: false,
            airDateUtc: '2024-01-01T00:00:00Z',
            series: { title: 'Example Series' },
          },
        ])
      );
      return;
    }

    if (request.url === '/api/v3/wanted/cutoff') {
      response.end(
        JSON.stringify([
          {
            id: 102,
            seriesId: 8,
            title: 'Second Episode',
            monitored: true,
            hasFile: true,
            airDateUtc: '2024-01-02T00:00:00Z',
          },
        ])
      );
      return;
    }

    if (request.url === '/api/v3/queue/details') {
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
    });

    const [status, missing, cutoff, queue] = await Promise.all([
      client.probeSystemStatus(),
      client.getWantedMissing(),
      client.getWantedCutoff(),
      client.getQueueDetails(),
    ]);

    assert.equal(status.appName, 'Sonarr');
    assert.equal(missing[0]?.title, 'Example Series - Pilot');
    assert.equal(cutoff[0]?.qualityCutoffNotMet, true);
    assert.equal(queue[0]?.downloadId, 'dl-1');
  } finally {
    await server.close();
  }
});

test('Radarr client normalizes wanted movie responses', async () => {
  const server = await startJsonServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');

    if (request.url === '/api/v3/system/status') {
      response.end(
        JSON.stringify({
          appName: 'Radarr',
          version: '5.0.0',
        })
      );
      return;
    }

    if (request.url === '/api/v3/wanted/missing') {
      response.end(
        JSON.stringify([
          {
            id: 77,
            title: 'Movie One',
            monitored: true,
            hasFile: false,
            digitalRelease: '2024-02-03T00:00:00Z',
          },
        ])
      );
      return;
    }

    if (request.url === '/api/v3/wanted/cutoff') {
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

    if (request.url === '/api/v3/queue/details') {
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
    });

    const missing = await client.getWantedMissing();
    const cutoff = await client.getWantedCutoff();

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

    if (request.url === '/api/v1/health') {
      response.end(
        JSON.stringify([
          {
            source: 'IndexerStatusCheck',
            type: 'warning',
            level: 'warn',
            message: 'Indexer degraded',
          },
        ])
      );
      return;
    }

    if (request.url === '/api/v1/indexerstatus') {
      response.end(
        JSON.stringify([
          {
            id: 5,
            name: 'Tracker One',
            enabled: true,
            status: 'ok',
            failureMessage: null,
            protocol: 'torrent',
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
    assert.equal(indexers[0]?.enabled, true);
    assert.equal(indexers[0]?.name, 'Tracker One');
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
