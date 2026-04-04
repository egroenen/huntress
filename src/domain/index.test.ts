import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { initializeDatabase } from '@/src/db';
import { createRadarrClient, createSonarrClient } from '@/src/integrations';

import { syncArrState } from './state-sync';

interface TestServerContext {
  url: string;
  close(): Promise<void>;
}

const createDatabasePath = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'edarr-domain-'));
  return join(directory, 'orchestrator.sqlite');
};

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

test('syncArrState persists wanted state and queue status for Sonarr and Radarr', async () => {
  const server = await startJsonServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');

    if (request.url === '/sonarr/api/v3/wanted/missing') {
      response.end(
        JSON.stringify([
          {
            id: 101,
            seriesId: 55,
            title: 'Pilot',
            monitored: true,
            airDateUtc: '2026-03-30T00:00:00Z',
            series: { title: 'Example Show' },
          },
        ])
      );
      return;
    }

    if (request.url === '/sonarr/api/v3/wanted/cutoff') {
      response.end(
        JSON.stringify([
          {
            id: 102,
            seriesId: 55,
            title: 'Second Episode',
            monitored: true,
            airDateUtc: '2026-03-31T00:00:00Z',
            series: { title: 'Example Show' },
          },
        ])
      );
      return;
    }

    if (request.url === '/sonarr/api/v3/queue/details') {
      response.end(
        JSON.stringify([
          {
            id: 1,
            title: 'Example Show - Pilot',
            episodeId: 101,
          },
        ])
      );
      return;
    }

    if (request.url === '/radarr/api/v3/wanted/missing') {
      response.end(
        JSON.stringify([
          {
            id: 201,
            title: 'Example Movie',
            monitored: true,
            digitalRelease: '2026-03-20T00:00:00Z',
          },
        ])
      );
      return;
    }

    if (request.url === '/radarr/api/v3/wanted/cutoff') {
      response.end(
        JSON.stringify([
          {
            id: 202,
            title: 'Upgrade Movie',
            monitored: true,
            physicalRelease: '2026-03-21T00:00:00Z',
            qualityCutoffNotMet: true,
          },
        ])
      );
      return;
    }

    if (request.url === '/radarr/api/v3/queue/details') {
      response.end(
        JSON.stringify([
          {
            id: 2,
            title: 'Upgrade Movie',
            movieId: 202,
          },
        ])
      );
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'not found' }));
  });

  const databasePath = await createDatabasePath();
  const database = await initializeDatabase(databasePath);

  try {
    const summary = await syncArrState({
      database,
      clients: {
        sonarr: createSonarrClient({
          baseUrl: `${server.url}/sonarr`,
          apiKey: 'sonarr-key',
        }),
        radarr: createRadarrClient({
          baseUrl: `${server.url}/radarr`,
          apiKey: 'radarr-key',
        }),
      },
      now: new Date('2026-04-04T12:00:00.000Z'),
    });

    const sonarrMissing =
      database.repositories.mediaItemState.getByMediaKey('sonarr:episode:101');
    const sonarrCutoff =
      database.repositories.mediaItemState.getByMediaKey('sonarr:episode:102');
    const radarrMissing =
      database.repositories.mediaItemState.getByMediaKey('radarr:movie:201');
    const radarrCutoff =
      database.repositories.mediaItemState.getByMediaKey('radarr:movie:202');

    assert.equal(summary.sonarr.missingCount, 1);
    assert.equal(summary.sonarr.cutoffCount, 1);
    assert.equal(summary.radarr.missingCount, 1);
    assert.equal(summary.radarr.cutoffCount, 1);

    assert.equal(sonarrMissing?.wantedState, 'missing');
    assert.equal(sonarrMissing?.inQueue, true);
    assert.equal(sonarrCutoff?.wantedState, 'cutoff_unmet');
    assert.equal(sonarrCutoff?.inQueue, false);

    assert.equal(radarrMissing?.wantedState, 'missing');
    assert.equal(radarrMissing?.inQueue, false);
    assert.equal(radarrCutoff?.wantedState, 'cutoff_unmet');
    assert.equal(radarrCutoff?.inQueue, true);
  } finally {
    database.close();
    await server.close();
  }
});

test('syncArrState preserves retry history and marks disappeared items as ignored', async () => {
  let cycle = 1;
  const server = await startJsonServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');

    if (request.url === '/sonarr/api/v3/wanted/missing') {
      if (cycle === 1) {
        response.end(
          JSON.stringify([
            {
              id: 101,
              seriesId: 55,
              title: 'Old Title',
              monitored: true,
              airDateUtc: '2026-03-30T00:00:00Z',
              series: { title: 'Example Show' },
            },
          ])
        );
        return;
      }

      response.end(
        JSON.stringify([
          {
            id: 101,
            seriesId: 55,
            title: 'Renamed Episode',
            monitored: true,
            airDateUtc: '2026-03-30T00:00:00Z',
            series: { title: 'Example Show' },
          },
        ])
      );
      return;
    }

    if (request.url === '/sonarr/api/v3/wanted/cutoff') {
      response.end(JSON.stringify([]));
      return;
    }

    if (request.url === '/sonarr/api/v3/queue/details') {
      response.end(JSON.stringify([]));
      return;
    }

    if (request.url === '/radarr/api/v3/wanted/missing') {
      response.end(JSON.stringify([]));
      return;
    }

    if (request.url === '/radarr/api/v3/wanted/cutoff') {
      if (cycle === 1) {
        response.end(
          JSON.stringify([
            {
              id: 202,
              title: 'Upgrade Movie',
              monitored: true,
              physicalRelease: '2026-03-21T00:00:00Z',
              qualityCutoffNotMet: true,
            },
          ])
        );
        return;
      }

      response.end(JSON.stringify([]));
      return;
    }

    if (request.url === '/radarr/api/v3/queue/details') {
      response.end(JSON.stringify([]));
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'not found' }));
  });

  const databasePath = await createDatabasePath();
  const database = await initializeDatabase(databasePath);

  try {
    await syncArrState({
      database,
      clients: {
        sonarr: createSonarrClient({
          baseUrl: `${server.url}/sonarr`,
          apiKey: 'sonarr-key',
        }),
        radarr: createRadarrClient({
          baseUrl: `${server.url}/radarr`,
          apiKey: 'radarr-key',
        }),
      },
      now: new Date('2026-04-04T12:00:00.000Z'),
    });

    database.repositories.mediaItemState.upsert({
      mediaKey: 'sonarr:episode:101',
      mediaType: 'sonarr_episode',
      arrId: 101,
      parentArrId: 55,
      title: 'Example Show - Old Title',
      monitored: true,
      releaseDate: '2026-03-30T00:00:00Z',
      wantedState: 'missing',
      inQueue: false,
      retryCount: 3,
      lastSearchAt: '2026-04-01T00:00:00.000Z',
      lastGrabAt: null,
      nextEligibleAt: '2026-04-07T00:00:00.000Z',
      suppressedUntil: null,
      suppressionReason: null,
      lastSeenAt: '2026-04-04T12:00:00.000Z',
      stateHash: 'custom-state-hash',
    });

    cycle = 2;

    const summary = await syncArrState({
      database,
      clients: {
        sonarr: createSonarrClient({
          baseUrl: `${server.url}/sonarr`,
          apiKey: 'sonarr-key',
        }),
        radarr: createRadarrClient({
          baseUrl: `${server.url}/radarr`,
          apiKey: 'radarr-key',
        }),
      },
      now: new Date('2026-04-05T12:00:00.000Z'),
    });

    const sonarrRecord =
      database.repositories.mediaItemState.getByMediaKey('sonarr:episode:101');
    const disappearedRadarrRecord =
      database.repositories.mediaItemState.getByMediaKey('radarr:movie:202');

    assert.equal(summary.radarr.ignoredCount, 1);
    assert.equal(sonarrRecord?.title, 'Example Show - Renamed Episode');
    assert.equal(sonarrRecord?.retryCount, 3);
    assert.equal(sonarrRecord?.lastSearchAt, '2026-04-01T00:00:00.000Z');
    assert.equal(disappearedRadarrRecord?.wantedState, 'ignored');
    assert.equal(disappearedRadarrRecord?.lastSeenAt, '2026-04-05T12:00:00.000Z');
    assert.equal(disappearedRadarrRecord?.retryCount, 0);
  } finally {
    database.close();
    await server.close();
  }
});
