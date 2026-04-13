import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { initializeDatabase } from '@/src/db';
import { createRadarrClient, createSonarrClient } from '@/src/integrations';

import { executeSearchDispatchRun, syncArrState } from './index';

interface TestServerContext {
  url: string;
  close(): Promise<void>;
}

const createDatabasePath = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'huntress-domain-'));
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
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');

    if (url.pathname === '/sonarr/api/v3/wanted/missing') {
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

    if (url.pathname === '/sonarr/api/v3/wanted/cutoff') {
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

    if (url.pathname === '/sonarr/api/v3/queue/details') {
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

    if (url.pathname === '/sonarr/api/v3/series/55') {
      response.end(
        JSON.stringify({
          id: 55,
          title: 'Example Show',
          titleSlug: 'example-show',
        })
      );
      return;
    }

    if (url.pathname === '/radarr/api/v3/wanted/missing') {
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

    if (url.pathname === '/radarr/api/v3/wanted/cutoff') {
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

    if (url.pathname === '/radarr/api/v3/queue/details') {
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

    if (url.pathname === '/radarr/api/v3/movie/201') {
      response.end(
        JSON.stringify({
          id: 201,
          title: 'Example Movie',
          titleSlug: '1142921',
        })
      );
      return;
    }

    if (url.pathname === '/radarr/api/v3/movie/202') {
      response.end(
        JSON.stringify({
          id: 202,
          title: 'Upgrade Movie',
          titleSlug: 'upgrade-movie-2026',
        })
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
    assert.equal(sonarrMissing?.externalPath, 'series/example-show');
    assert.equal(sonarrCutoff?.wantedState, 'cutoff_unmet');
    assert.equal(sonarrCutoff?.inQueue, false);
    assert.equal(sonarrCutoff?.externalPath, 'series/example-show');

    assert.equal(radarrMissing?.wantedState, 'missing');
    assert.equal(radarrMissing?.inQueue, false);
    assert.equal(radarrMissing?.externalPath, 'movie/1142921');
    assert.equal(radarrCutoff?.wantedState, 'cutoff_unmet');
    assert.equal(radarrCutoff?.inQueue, true);
    assert.equal(radarrCutoff?.externalPath, 'movie/upgrade-movie-2026');
  } finally {
    database.close();
    await server.close();
  }
});

test('syncArrState preserves retry history and marks disappeared items as ignored', async () => {
  let cycle = 1;
  const server = await startJsonServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');

    if (url.pathname === '/sonarr/api/v3/wanted/missing') {
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

    if (url.pathname === '/sonarr/api/v3/wanted/cutoff') {
      response.end(JSON.stringify([]));
      return;
    }

    if (url.pathname === '/sonarr/api/v3/queue/details') {
      response.end(JSON.stringify([]));
      return;
    }

    if (url.pathname === '/sonarr/api/v3/series/55') {
      response.end(
        JSON.stringify({
          id: 55,
          title: 'Example Show',
          titleSlug: 'example-show',
        })
      );
      return;
    }

    if (url.pathname === '/radarr/api/v3/wanted/missing') {
      response.end(JSON.stringify([]));
      return;
    }

    if (url.pathname === '/radarr/api/v3/wanted/cutoff') {
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

    if (url.pathname === '/radarr/api/v3/queue/details') {
      response.end(JSON.stringify([]));
      return;
    }

    if (url.pathname === '/radarr/api/v3/movie/202') {
      response.end(
        JSON.stringify({
          id: 202,
          title: 'Upgrade Movie',
          titleSlug: 'upgrade-movie-2026',
        })
      );
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
      externalPath: 'series/example-show',
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
    assert.equal(sonarrRecord?.externalPath, 'series/example-show');
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

test('syncArrState preserves Sonarr series title when later sync payloads omit it', async () => {
  let cycle = 1;
  const server = await startJsonServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');

    if (url.pathname === '/sonarr/api/v3/wanted/missing') {
      response.end(
        JSON.stringify([
          {
            id: 101,
            seriesId: 55,
            title: cycle === 1 ? 'Pilot' : 'S1 E1 - Pilot',
            monitored: true,
            airDateUtc: '2026-03-30T00:00:00Z',
            series: { title: 'Example Show' },
          },
        ])
      );
      return;
    }

    if (url.pathname === '/sonarr/api/v3/wanted/cutoff') {
      response.end(JSON.stringify([]));
      return;
    }

    if (url.pathname === '/sonarr/api/v3/queue/details') {
      response.end(JSON.stringify([]));
      return;
    }

    if (url.pathname === '/sonarr/api/v3/series/55') {
      response.end(
        JSON.stringify({
          id: 55,
          title: 'Example Show',
          titleSlug: 'example-show',
        })
      );
      return;
    }

    if (url.pathname === '/radarr/api/v3/wanted/missing') {
      response.end(JSON.stringify([]));
      return;
    }

    if (url.pathname === '/radarr/api/v3/wanted/cutoff') {
      response.end(JSON.stringify([]));
      return;
    }

    if (url.pathname === '/radarr/api/v3/queue/details') {
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

    cycle = 2;

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
      now: new Date('2026-04-05T12:00:00.000Z'),
    });

    const sonarrRecord =
      database.repositories.mediaItemState.getByMediaKey('sonarr:episode:101');

    assert.equal(sonarrRecord?.title, 'Example Show - S1 E1 - Pilot');
    assert.equal(sonarrRecord?.externalPath, 'series/example-show');
  } finally {
    database.close();
    await server.close();
  }
});

test('syncArrState incrementally expands wanted page coverage for large collections', async () => {
  const requestedMissingPages: number[] = [];

  const server = await startJsonServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');

    if (url.pathname === '/sonarr/api/v3/wanted/missing') {
      const page = Number(url.searchParams.get('page') ?? '1');
      requestedMissingPages.push(page);
      response.end(
        JSON.stringify({
          page,
          pageSize: 1,
          totalRecords: 6,
          records: [
            {
              id: 100 + page,
              seriesId: 88,
              title: `Episode ${page}`,
              monitored: true,
              airDateUtc: `2026-03-0${page}T00:00:00Z`,
              series: { title: 'Paged Show' },
            },
          ],
        })
      );
      return;
    }

    if (url.pathname === '/sonarr/api/v3/wanted/cutoff') {
      response.end(JSON.stringify([]));
      return;
    }

    if (url.pathname === '/sonarr/api/v3/queue/details') {
      response.end(JSON.stringify([]));
      return;
    }

    if (url.pathname === '/radarr/api/v3/wanted/missing') {
      response.end(JSON.stringify([]));
      return;
    }

    if (url.pathname === '/radarr/api/v3/wanted/cutoff') {
      response.end(JSON.stringify([]));
      return;
    }

    if (url.pathname === '/radarr/api/v3/queue/details') {
      response.end(JSON.stringify([]));
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'not found' }));
  });

  const databasePath = await createDatabasePath();
  const database = await initializeDatabase(databasePath);

  try {
    const syncConfig = {
      wantedPageSize: 50,
      fullScanPageThreshold: 2,
      maxWantedPagesPerCollection: 3,
      sonarrFetchAllPages: false,
      radarrFetchAllPages: false,
    };

    const firstSummary = await syncArrState({
      database,
      clients: {
        sonarr: createSonarrClient({
          baseUrl: `${server.url}/sonarr`,
          apiKey: 'sonarr-key',
          wantedPageSize: 50,
        }),
        radarr: createRadarrClient({
          baseUrl: `${server.url}/radarr`,
          apiKey: 'radarr-key',
          wantedPageSize: 50,
        }),
      },
      syncConfig,
      now: new Date('2026-04-04T12:00:00.000Z'),
    });

    const firstRunPages = new Set(requestedMissingPages);
    const firstCoverage = database.repositories.wantedPageCoverage.listByCollection(
      'sonarr',
      'missing'
    );

    assert.equal(firstSummary.sonarr.missingPagesFetched, 3);
    assert.equal(firstSummary.sonarr.missingTotalPages, 6);
    assert.equal(firstRunPages.has(1), true);
    assert.equal(firstRunPages.size, 3);
    assert.equal(firstCoverage.length, 3);

    requestedMissingPages.length = 0;

    const secondSummary = await syncArrState({
      database,
      clients: {
        sonarr: createSonarrClient({
          baseUrl: `${server.url}/sonarr`,
          apiKey: 'sonarr-key',
          wantedPageSize: 50,
        }),
        radarr: createRadarrClient({
          baseUrl: `${server.url}/radarr`,
          apiKey: 'radarr-key',
          wantedPageSize: 50,
        }),
      },
      syncConfig,
      now: new Date('2026-04-05T12:00:00.000Z'),
    });

    const secondRunPages = new Set(requestedMissingPages);
    const secondCoverage = database.repositories.wantedPageCoverage.listByCollection(
      'sonarr',
      'missing'
    );

    assert.equal(secondSummary.sonarr.missingPagesFetched, 3);
    assert.equal(secondSummary.sonarr.missingTotalPages, 6);
    assert.equal(secondRunPages.has(1), true);
    assert.equal(secondRunPages.size, 3);
    assert.equal(secondCoverage.length, 5);
  } finally {
    database.close();
    await server.close();
  }
});

test('sync and dispatch work together in a mocked end-to-end cycle', async () => {
  const commandBodies: unknown[] = [];
  const server = await startJsonServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');

    if (url.pathname === '/sonarr/api/v3/wanted/missing') {
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

    if (url.pathname === '/sonarr/api/v3/wanted/cutoff') {
      response.end(JSON.stringify([]));
      return;
    }

    if (url.pathname === '/sonarr/api/v3/queue/details') {
      response.end(JSON.stringify([]));
      return;
    }

    if (url.pathname === '/radarr/api/v3/wanted/missing') {
      response.end(
        JSON.stringify([
          {
            id: 201,
            title: 'Queued Movie',
            monitored: true,
            digitalRelease: '2026-03-20T00:00:00Z',
          },
        ])
      );
      return;
    }

    if (url.pathname === '/radarr/api/v3/wanted/cutoff') {
      response.end(JSON.stringify([]));
      return;
    }

    if (url.pathname === '/radarr/api/v3/queue/details') {
      response.end(
        JSON.stringify([
          {
            id: 2,
            title: 'Queued Movie',
            movieId: 201,
          },
        ])
      );
      return;
    }

    if (request.method === 'POST' && url.pathname.endsWith('/api/v3/command')) {
      const body = await new Promise<string>((resolve) => {
        let data = '';
        request.setEncoding('utf8');
        request.on('data', (chunk) => {
          data += chunk;
        });
        request.on('end', () => resolve(data));
      });

      commandBodies.push(JSON.parse(body));
      response.end(JSON.stringify({ id: 401, name: 'search', status: 'queued' }));
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'not found' }));
  });

  const databasePath = await createDatabasePath();
  const database = await initializeDatabase(databasePath);
  const now = new Date('2026-04-04T12:00:00.000Z');

  try {
    const sonarr = createSonarrClient({
      baseUrl: `${server.url}/sonarr`,
      apiKey: 'sonarr-key',
    });
    const radarr = createRadarrClient({
      baseUrl: `${server.url}/radarr`,
      apiKey: 'radarr-key',
    });

    await syncArrState({
      database,
      clients: {
        sonarr,
        radarr,
      },
      now,
    });

    database.repositories.runHistory.create({
      id: 'e2e-run',
      runType: 'manual_live',
      startedAt: now.toISOString(),
      finishedAt: null,
      status: 'running',
      candidateCount: 0,
      dispatchCount: 0,
      skipCount: 0,
      errorCount: 0,
      summary: {},
    });

    const summary = await executeSearchDispatchRun({
      database,
      config: {
        server: {
          listenHost: '127.0.0.1',
          listenPort: 47892,
        },
        mode: 'live',
        storage: {
          sqlitePath: databasePath,
        },
        auth: {
          enabled: true,
          sessionSecret: 'secret',
          sessionSecretEnv: 'APP_SESSION_SECRET',
          sessionAbsoluteTtlMs: 7 * 86_400_000,
          sessionIdleTtlMs: 86_400_000,
        },
        instances: {
          sonarr: {
            url: `${server.url}/sonarr`,
            apiKey: 'sonarr-key',
            apiKeyEnv: 'SONARR_API_KEY',
            fetchAllWantedPages: false,
          },
          radarr: {
            url: `${server.url}/radarr`,
            apiKey: 'radarr-key',
            apiKeyEnv: 'RADARR_API_KEY',
            fetchAllWantedPages: false,
          },
          prowlarr: {
            url: 'http://prowlarr:9696',
            apiKey: 'prowlarr-key',
            apiKeyEnv: 'PROWLARR_API_KEY',
          },
          transmission: {
            url: 'http://transmission:9091/transmission/rpc',
            username: 'user',
            usernameEnv: 'TRANSMISSION_RPC_USERNAME',
            password: 'pass',
            passwordEnv: 'TRANSMISSION_RPC_PASSWORD',
          },
        },
        scheduler: {
          cycleEveryMs: 6 * 3_600_000,
          startupGracePeriodMs: 10 * 60_000,
          maxRunDurationMs: 30 * 60_000,
        },
        sync: {
          wantedPageSize: 50,
          fullScanPageThreshold: 20,
          maxWantedPagesPerCollection: 4,
        },
        policies: {
          sonarr: {
            maxSearchesPerCycle: 6,
            missingRetryIntervalsMs: [12, 24, 72, 168].map((hours) => hours * 3_600_000),
            cutoffRetryIntervalsMs: [48, 168, 336].map((hours) => hours * 3_600_000),
            recentReleaseWindowDays: 30,
            excludeUnreleased: true,
            excludeUnmonitored: true,
          },
          radarr: {
            maxSearchesPerCycle: 3,
            missingRetryIntervalsMs: [24, 72, 168, 336].map((hours) => hours * 3_600_000),
            cutoffRetryIntervalsMs: [72, 168, 336].map((hours) => hours * 3_600_000),
            recentReleaseWindowDays: 30,
            excludeUnreleased: true,
            excludeUnmonitored: true,
          },
        },
        transmissionGuard: {
          enabled: true,
          stallNoProgressForMs: 12 * 3_600_000,
          suppressSameReleaseForMs: 7 * 86_400_000,
          itemCooldownAfterLoopMs: 24 * 3_600_000,
          deleteLocalData: true,
        },
        safety: {
          panicDisableSearch: false,
          stopOnProwlarrOutage: true,
          maxGlobalDispatchPerCycle: 8,
          minGlobalDispatchSpacingMs: 1,
          rollingSearchLimits: {
            per15m: 4,
            per1h: 10,
            per24h: 40,
          },
        },
        logging: {
          level: 'info',
        },
        meta: {
          configPath: '/tmp/config.yaml',
        },
      },
      clients: {
        sonarr,
        radarr,
      },
      runId: 'e2e-run',
      live: true,
      now,
    });

    const attempts = database.repositories.searchAttempts.listByRunId('e2e-run');

    assert.equal(summary.dispatchCount, 1);
    assert.equal(summary.skipCount, 1);
    assert.deepEqual(commandBodies, [{ name: 'EpisodeSearch', episodeIds: [101] }]);
    assert.deepEqual(
      attempts.map((attempt) => [attempt.mediaKey, attempt.decision, attempt.outcome]),
      [
        ['sonarr:episode:101', 'dispatch', 'accepted'],
        ['radarr:movie:201', 'skip', 'skipped'],
      ]
    );
  } finally {
    database.close();
    await server.close();
  }
});

test('syncArrState can fetch every Sonarr wanted page when enabled per app', async () => {
  const requestedMissingPages: number[] = [];
  const server = await startJsonServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');

    if (url.pathname === '/sonarr/api/v3/wanted/missing') {
      const page = Number(url.searchParams.get('page') ?? '1');
      requestedMissingPages.push(page);
      response.end(
        JSON.stringify({
          page,
          pageSize: 50,
          totalPages: 6,
          totalRecords: 300,
          records: [
            {
              id: 200 + page,
              seriesId: 99,
              title: `Episode ${page}`,
              monitored: true,
              airDateUtc: `2026-03-0${page}T00:00:00Z`,
              series: { title: 'Fetch All Show' },
            },
          ],
        })
      );
      return;
    }

    if (url.pathname === '/sonarr/api/v3/wanted/cutoff') {
      response.end(JSON.stringify([]));
      return;
    }

    if (url.pathname === '/sonarr/api/v3/queue/details') {
      response.end(JSON.stringify([]));
      return;
    }

    if (url.pathname === '/radarr/api/v3/wanted/missing') {
      response.end(JSON.stringify([]));
      return;
    }

    if (url.pathname === '/radarr/api/v3/wanted/cutoff') {
      response.end(JSON.stringify([]));
      return;
    }

    if (url.pathname === '/radarr/api/v3/queue/details') {
      response.end(JSON.stringify([]));
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
          wantedPageSize: 50,
        }),
        radarr: createRadarrClient({
          baseUrl: `${server.url}/radarr`,
          apiKey: 'radarr-key',
          wantedPageSize: 50,
        }),
      },
      syncConfig: {
        wantedPageSize: 50,
        fullScanPageThreshold: 2,
        maxWantedPagesPerCollection: 3,
        sonarrFetchAllPages: true,
        radarrFetchAllPages: false,
      },
      now: new Date('2026-04-04T12:00:00.000Z'),
    });

    assert.equal(summary.sonarr.missingPagesFetched, 6);
    assert.deepEqual(requestedMissingPages, [1, 2, 3, 4, 5, 6]);
  } finally {
    database.close();
    await server.close();
  }
});
