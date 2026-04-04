import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import type { ResolvedConfig } from '@/src/config';
import { initializeDatabase } from '@/src/db';
import { createRadarrClient, createSonarrClient } from '@/src/integrations';

import { executeSearchDispatchRun } from './search-dispatch.js';

interface TestServerContext {
  url: string;
  close(): Promise<void>;
}

const createDatabasePath = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'edarr-dispatch-'));
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

const createResolvedConfig = (): ResolvedConfig => {
  return {
    server: {
      listenHost: '127.0.0.1',
      listenPort: 47892,
    },
    mode: 'dry-run',
    storage: {
      sqlitePath: '/tmp/edarr.sqlite',
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
        url: 'http://sonarr:8989',
        apiKey: 'sonarr-key',
        apiKeyEnv: 'SONARR_API_KEY',
      },
      radarr: {
        url: 'http://radarr:7878',
        apiKey: 'radarr-key',
        apiKeyEnv: 'RADARR_API_KEY',
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
      deleteLocalData: false,
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
  };
};

const seedEligibleItems = async (databasePath: string) => {
  const database = await initializeDatabase(databasePath);

  database.repositories.mediaItemState.upsert({
    mediaKey: 'sonarr:episode:101',
    mediaType: 'sonarr_episode',
    arrId: 101,
    parentArrId: 55,
    title: 'Example Show - Pilot',
    monitored: true,
    releaseDate: '2026-03-30T00:00:00.000Z',
    wantedState: 'missing',
    inQueue: false,
    retryCount: 0,
    lastSearchAt: null,
    lastGrabAt: null,
    nextEligibleAt: null,
    suppressedUntil: null,
    suppressionReason: null,
    lastSeenAt: '2026-04-04T12:00:00.000Z',
    stateHash: 'state-sonarr',
  });

  database.repositories.mediaItemState.upsert({
    mediaKey: 'radarr:movie:201',
    mediaType: 'radarr_movie',
    arrId: 201,
    parentArrId: null,
    title: 'Example Movie',
    monitored: true,
    releaseDate: '2026-03-20T00:00:00.000Z',
    wantedState: 'missing',
    inQueue: false,
    retryCount: 0,
    lastSearchAt: null,
    lastGrabAt: null,
    nextEligibleAt: null,
    suppressedUntil: null,
    suppressionReason: null,
    lastSeenAt: '2026-04-04T12:00:00.000Z',
    stateHash: 'state-radarr',
  });

  return database;
};

const createRunHistoryRecord = (runId: string, runType: 'manual_dry' | 'manual_live') => {
  return {
    id: runId,
    runType,
    startedAt: '2026-04-04T12:00:00.000Z',
    finishedAt: null,
    status: 'running',
    candidateCount: 0,
    dispatchCount: 0,
    skipCount: 0,
    errorCount: 0,
    summary: {},
  } as const;
};

test('executeSearchDispatchRun persists dry-run decisions without sending commands', async () => {
  let commandPosts = 0;
  const server = await startJsonServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');

    if (request.method === 'POST' && request.url?.endsWith('/api/v3/command')) {
      commandPosts += 1;
      response.end(JSON.stringify({ id: 1, name: 'noop', status: 'queued' }));
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'not found' }));
  });

  const databasePath = await createDatabasePath();
  const database = await seedEligibleItems(databasePath);
  const config = createResolvedConfig();
  database.repositories.runHistory.create(
    createRunHistoryRecord('run-dry', 'manual_dry')
  );

  try {
    const summary = await executeSearchDispatchRun({
      database,
      config,
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
      runId: 'run-dry',
      live: false,
      now: new Date('2026-04-04T12:00:00.000Z'),
    });

    const attempts = database.repositories.searchAttempts.listByRunId('run-dry');

    assert.equal(commandPosts, 0);
    assert.equal(summary.dispatchCount, 0);
    assert.equal(summary.errorCount, 0);
    assert.equal(summary.summary.dryRunDispatchPreviewCount, 2);
    assert.deepEqual(
      attempts.map((attempt) => [
        attempt.mediaKey,
        attempt.decision,
        attempt.dryRun,
        attempt.outcome,
      ]),
      [
        ['sonarr:episode:101', 'dispatch', true, 'dry_run'],
        ['radarr:movie:201', 'dispatch', true, 'dry_run'],
      ]
    );
    assert.equal(
      database.repositories.mediaItemState.getByMediaKey('sonarr:episode:101')
        ?.retryCount,
      0
    );
  } finally {
    database.close();
    await server.close();
  }
});

test('executeSearchDispatchRun dispatches scoped Arr commands and updates retry state', async () => {
  const requestBodies: unknown[] = [];
  const server = await startJsonServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json');

    if (request.method === 'POST' && request.url?.endsWith('/api/v3/command')) {
      const body = await new Promise<string>((resolve) => {
        let data = '';
        request.setEncoding('utf8');
        request.on('data', (chunk) => {
          data += chunk;
        });
        request.on('end', () => resolve(data));
      });

      requestBodies.push(JSON.parse(body));
      response.end(
        JSON.stringify({
          id: request.url.startsWith('/sonarr') ? 11 : 22,
          name: 'search',
          status: 'queued',
        })
      );
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'not found' }));
  });

  const databasePath = await createDatabasePath();
  const database = await seedEligibleItems(databasePath);
  const config = createResolvedConfig();
  database.repositories.runHistory.create(
    createRunHistoryRecord('run-live', 'manual_live')
  );

  try {
    const summary = await executeSearchDispatchRun({
      database,
      config,
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
      runId: 'run-live',
      live: true,
      now: new Date('2026-04-04T12:00:00.000Z'),
    });

    const attempts = database.repositories.searchAttempts.listByRunId('run-live');
    const sonarrRecord =
      database.repositories.mediaItemState.getByMediaKey('sonarr:episode:101');
    const radarrRecord =
      database.repositories.mediaItemState.getByMediaKey('radarr:movie:201');

    assert.equal(summary.dispatchCount, 2);
    assert.equal(summary.skipCount, 0);
    assert.equal(summary.errorCount, 0);
    assert.deepEqual(requestBodies, [
      { name: 'EpisodeSearch', episodeIds: [101] },
      { name: 'MoviesSearch', movieIds: [201] },
    ]);
    assert.deepEqual(
      attempts.map((attempt) => [
        attempt.mediaKey,
        attempt.arrCommandId,
        attempt.outcome,
      ]),
      [
        ['sonarr:episode:101', 11, 'accepted'],
        ['radarr:movie:201', 22, 'accepted'],
      ]
    );
    assert.equal(sonarrRecord?.retryCount, 1);
    assert.equal(radarrRecord?.retryCount, 1);
    assert.ok(sonarrRecord?.lastSearchAt);
    assert.ok(radarrRecord?.nextEligibleAt);
  } finally {
    database.close();
    await server.close();
  }
});

test('executeSearchDispatchRun stops live dispatch when rolling search budgets are exhausted', async () => {
  let commandPosts = 0;
  const server = await startJsonServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');

    if (request.method === 'POST' && request.url?.endsWith('/api/v3/command')) {
      commandPosts += 1;
      response.end(JSON.stringify({ id: 1, name: 'search', status: 'queued' }));
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'not found' }));
  });

  const databasePath = await createDatabasePath();
  const database = await seedEligibleItems(databasePath);
  const config = createResolvedConfig();
  config.safety.rollingSearchLimits.per15m = 1;
  config.safety.rollingSearchLimits.per1h = 10;
  config.safety.rollingSearchLimits.per24h = 40;
  database.repositories.runHistory.create(
    createRunHistoryRecord('run-throttle', 'manual_live')
  );
  database.repositories.runHistory.create(
    createRunHistoryRecord('prior-run', 'manual_live')
  );

  database.repositories.searchAttempts.insertMany([
    {
      runId: 'prior-run',
      mediaKey: 'prior:item',
      app: 'sonarr',
      wantedState: 'missing',
      decision: 'dispatch',
      reasonCode: 'ELIGIBLE_MISSING_RECENT',
      dryRun: false,
      arrCommandId: 99,
      attemptedAt: '2026-04-04T11:55:00.000Z',
      completedAt: '2026-04-04T11:55:00.000Z',
      outcome: 'accepted',
    },
  ]);

  try {
    const summary = await executeSearchDispatchRun({
      database,
      config,
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
      runId: 'run-throttle',
      live: true,
      now: new Date('2026-04-04T12:00:00.000Z'),
    });

    const attempts = database.repositories.searchAttempts.listByRunId('run-throttle');

    assert.equal(commandPosts, 0);
    assert.equal(summary.dispatchCount, 0);
    assert.equal(summary.skipCount, 2);
    assert.equal(summary.summary.throttleReason, 'THROTTLE_GLOBAL_15M_BUDGET');
    assert.deepEqual(
      attempts.map((attempt) => [attempt.mediaKey, attempt.reasonCode, attempt.outcome]),
      [
        ['sonarr:episode:101', 'THROTTLE_GLOBAL_15M_BUDGET', 'throttled'],
        ['radarr:movie:201', 'THROTTLE_GLOBAL_15M_BUDGET', 'throttled'],
      ]
    );
  } finally {
    database.close();
    await server.close();
  }
});
