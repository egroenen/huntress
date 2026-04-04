import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import type { ResolvedConfig } from '@/src/config';
import { initializeDatabase } from '@/src/db';
import { GET as healthzGet } from '@/app/api/healthz/route';

import { getReadinessSnapshot } from './health';
import { getMetricsText, recordRunCompletion, updateSearchRateMetrics } from './metrics';
import { getSearchRateSnapshot } from './search-rate';

const createDatabasePath = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'edarr-observability-'));
  return join(directory, 'orchestrator.sqlite');
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
      maxRunDurationMs: 30 * 60_000,
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
      minGlobalDispatchSpacingMs: 30_000,
      rollingSearchLimits: {
        per15m: 2,
        per1h: 4,
        per24h: 8,
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

test('getSearchRateSnapshot reports current throttles and next eligible time', async () => {
  const databasePath = await createDatabasePath();
  const database = await initializeDatabase(databasePath);
  const config = createResolvedConfig();
  const now = new Date('2026-04-04T12:00:00.000Z');

  try {
    database.repositories.runHistory.create({
      id: 'run-1',
      runType: 'manual_live',
      startedAt: '2026-04-04T11:50:00.000Z',
      finishedAt: '2026-04-04T11:50:05.000Z',
      status: 'success',
      candidateCount: 1,
      dispatchCount: 1,
      skipCount: 0,
      errorCount: 0,
      summary: {},
    });
    database.repositories.runHistory.create({
      id: 'run-2',
      runType: 'manual_live',
      startedAt: '2026-04-04T11:59:45.000Z',
      finishedAt: '2026-04-04T11:59:50.000Z',
      status: 'success',
      candidateCount: 1,
      dispatchCount: 1,
      skipCount: 0,
      errorCount: 0,
      summary: {},
    });
    database.repositories.searchAttempts.insertMany([
      {
        runId: 'run-1',
        mediaKey: 'radarr:movie:1',
        app: 'radarr',
        wantedState: 'missing',
        decision: 'dispatch',
        reasonCode: 'ELIGIBLE_MISSING_RECENT',
        dryRun: false,
        arrCommandId: 1,
        attemptedAt: '2026-04-04T11:50:00.000Z',
        completedAt: '2026-04-04T11:50:00.000Z',
        outcome: 'accepted',
      },
      {
        runId: 'run-2',
        mediaKey: 'sonarr:episode:1',
        app: 'sonarr',
        wantedState: 'missing',
        decision: 'dispatch',
        reasonCode: 'ELIGIBLE_MISSING_RECENT',
        dryRun: false,
        arrCommandId: 2,
        attemptedAt: '2026-04-04T11:59:45.000Z',
        completedAt: '2026-04-04T11:59:45.000Z',
        outcome: 'accepted',
      },
    ]);

    const snapshot = getSearchRateSnapshot(database, config, now);

    assert.equal(snapshot.currentThrottleReason, 'THROTTLE_GLOBAL_DISPATCH_SPACING');
    assert.equal(snapshot.windows[0]?.used, 2);
    assert.equal(snapshot.windows[0]?.remaining, 0);
    assert.equal(snapshot.spacing.nextEligibleAt, '2026-04-04T12:00:15.000Z');
    assert.equal(snapshot.nextEligibleAt, '2026-04-04T12:05:00.000Z');
  } finally {
    database.close();
  }
});

test('getReadinessSnapshot reports not ready when a blocking dependency is unavailable', async () => {
  const databasePath = await createDatabasePath();
  const database = await initializeDatabase(databasePath);
  const config = createResolvedConfig();

  try {
    const readiness = await getReadinessSnapshot({
      runtime: {
        config,
        database,
      } as never,
      dependencyCards: [
        {
          name: 'Sonarr',
          status: 'healthy',
          summary: 'ok',
        },
        {
          name: 'Radarr',
          status: 'unavailable',
          summary: 'down',
        },
        {
          name: 'Prowlarr',
          status: 'healthy',
          summary: 'ok',
        },
        {
          name: 'Transmission',
          status: 'healthy',
          summary: 'ok',
        },
      ],
    });

    assert.equal(readiness.ok, false);
    assert.equal(readiness.lastRun.id, null);
  } finally {
    database.close();
  }
});

test('healthz and metrics endpoints return scrapeable observability responses', async () => {
  recordRunCompletion({
    runType: 'manual_dry',
    status: 'success',
    durationMs: 250,
  });
  updateSearchRateMetrics({
    latestDispatchAt: null,
    currentThrottleReason: null,
    nextEligibleAt: null,
    spacing: {
      limitMs: 30_000,
      remainingMs: 0,
      nextEligibleAt: null,
    },
    windows: [
      {
        key: '15m',
        used: 0,
        limit: 2,
        remaining: 2,
        nextEligibleAt: null,
      },
      {
        key: '1h',
        used: 0,
        limit: 4,
        remaining: 4,
        nextEligibleAt: null,
      },
      {
        key: '24h',
        used: 0,
        limit: 8,
        remaining: 8,
        nextEligibleAt: null,
      },
    ],
  });

  const healthResponse = await healthzGet();
  const healthBody = await healthResponse.json();
  const metricsText = await getMetricsText();

  assert.equal(healthBody.ok, true);
  assert.match(metricsText, /edarr_runs_total/);
  assert.match(metricsText, /edarr_search_rate_used/);
});
