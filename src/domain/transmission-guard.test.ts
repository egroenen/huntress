import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import type { ResolvedConfig } from '@/src/config';
import { initializeDatabase } from '@/src/db';
import { createTransmissionClient } from '@/src/integrations';

import { runTransmissionGuard } from './transmission-guard.js';

interface TestServerContext {
  url: string;
  close(): Promise<void>;
}

const createDatabasePath = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'edarr-transmission-'));
  return join(directory, 'orchestrator.sqlite');
};

const startTransmissionServer = async (
  handler: (request: IncomingMessage, response: ServerResponse, body: unknown) => void
): Promise<TestServerContext> => {
  let sessionEstablished = false;
  const server = createServer(async (request, response) => {
    const sessionId = request.headers['x-transmission-session-id'];
    if (!sessionEstablished && !sessionId) {
      response.statusCode = 409;
      response.setHeader('X-Transmission-Session-Id', 'session-1');
      response.end();
      return;
    }

    sessionEstablished = true;
    let rawBody = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      rawBody += chunk;
    });
    request.on('end', () => {
      const parsed = rawBody ? (JSON.parse(rawBody) as unknown) : null;
      handler(request, response, parsed);
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to determine server address');
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
      deleteLocalData: true,
    },
    safety: {
      panicDisableSearch: false,
      stopOnProwlarrOutage: true,
      maxGlobalDispatchPerCycle: 8,
      minGlobalDispatchSpacingMs: 45_000,
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

const seedMediaItem = async (databasePath: string) => {
  const database = await initializeDatabase(databasePath);
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
    stateHash: 'movie-state',
  });
  return database;
};

test('runTransmissionGuard removes errored torrents and creates suppressions', async () => {
  const observedBodies: unknown[] = [];
  const server = await startTransmissionServer((_, response, body) => {
    observedBodies.push(body);
    const method =
      typeof body === 'object' && body !== null && 'method' in body
        ? (body as { method: string }).method
        : null;

    if (method === 'torrent-get') {
      response.end(
        JSON.stringify({
          result: 'success',
          arguments: {
            torrents: [
              {
                id: 1,
                hashString: 'hash-1',
                name: 'Example Movie 1080p',
                status: 4,
                percentDone: 0.2,
                error: 3,
                errorString: 'Tracker error',
                eta: 0,
                rateDownload: 0,
                rateUpload: 0,
                addedDate: 1,
                doneDate: 0,
                activityDate: 1,
              },
            ],
          },
        })
      );
      return;
    }

    if (method === 'torrent-remove') {
      response.end(JSON.stringify({ result: 'success', arguments: {} }));
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ result: 'unknown', arguments: {} }));
  });

  const databasePath = await createDatabasePath();
  const database = await seedMediaItem(databasePath);
  const config = createResolvedConfig();

  try {
    const summary = await runTransmissionGuard({
      database,
      config,
      client: createTransmissionClient({
        baseUrl: server.url,
        username: 'user',
        password: 'pass',
      }),
      now: new Date('2026-04-04T12:00:00.000Z'),
    });

    const suppression = database.repositories.releaseSuppressions.listActive(
      '2026-04-04T12:00:00.000Z'
    )[0];
    const mediaItem =
      database.repositories.mediaItemState.getByMediaKey('radarr:movie:201');
    const torrentState =
      database.repositories.transmissionTorrentState.getByHash('hash-1');

    assert.equal(summary.removedCount, 1);
    assert.equal(summary.suppressionCount, 1);
    assert.equal(summary.linkedCount, 1);
    assert.equal(suppression?.reason, 'TX_ERROR_REMOVE');
    assert.equal(mediaItem?.suppressionReason, 'TX_ERROR_REMOVE');
    assert.equal(torrentState?.removalReason, 'TX_ERROR_REMOVE');
    assert.deepEqual(
      observedBodies
        .filter((body) => typeof body === 'object' && body !== null)
        .map((body) => (body as { method: string }).method),
      ['torrent-get', 'torrent-remove']
    );
  } finally {
    database.close();
    await server.close();
  }
});

test('runTransmissionGuard removes stalled torrents using persisted no-progress state', async () => {
  const server = await startTransmissionServer((_, response, body) => {
    const method =
      typeof body === 'object' && body !== null && 'method' in body
        ? (body as { method: string }).method
        : null;

    if (method === 'torrent-get') {
      response.end(
        JSON.stringify({
          result: 'success',
          arguments: {
            torrents: [
              {
                id: 2,
                hashString: 'hash-stalled',
                name: 'Example Movie 720p',
                status: 4,
                percentDone: 0.5,
                error: 0,
                errorString: null,
                eta: 0,
                rateDownload: 0,
                rateUpload: 0,
                addedDate: 1,
                doneDate: 0,
                activityDate: 1,
              },
            ],
          },
        })
      );
      return;
    }

    if (method === 'torrent-remove') {
      response.end(JSON.stringify({ result: 'success', arguments: {} }));
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ result: 'unknown', arguments: {} }));
  });

  const databasePath = await createDatabasePath();
  const database = await seedMediaItem(databasePath);
  const config = createResolvedConfig();
  database.repositories.transmissionTorrentState.upsert({
    hashString: 'hash-stalled',
    name: 'Example Movie 720p',
    status: 4,
    percentDone: 0.5,
    errorCode: 0,
    errorString: null,
    firstSeenAt: '2026-04-03T00:00:00.000Z',
    lastSeenAt: '2026-04-04T00:00:00.000Z',
    linkedMediaKey: 'radarr:movie:201',
    removedAt: null,
    removalReason: null,
    noProgressSince: '2026-04-03T23:00:00.000Z',
  });

  try {
    const summary = await runTransmissionGuard({
      database,
      config,
      client: createTransmissionClient({
        baseUrl: server.url,
        username: 'user',
        password: 'pass',
      }),
      now: new Date('2026-04-04T12:00:00.000Z'),
    });

    assert.equal(summary.removedCount, 1);
    assert.equal(
      database.repositories.transmissionTorrentState.getByHash('hash-stalled')
        ?.removalReason,
      'TX_STALLED_REMOVE'
    );
  } finally {
    database.close();
    await server.close();
  }
});

test('runTransmissionGuard removes torrents that match an active suppressed release', async () => {
  const server = await startTransmissionServer((_, response, body) => {
    const method =
      typeof body === 'object' && body !== null && 'method' in body
        ? (body as { method: string }).method
        : null;

    if (method === 'torrent-get') {
      response.end(
        JSON.stringify({
          result: 'success',
          arguments: {
            torrents: [
              {
                id: 3,
                hashString: 'hash-loop',
                name: 'Example Movie WEB-DL',
                status: 4,
                percentDone: 0.1,
                error: 0,
                errorString: null,
                eta: 0,
                rateDownload: 100,
                rateUpload: 0,
                addedDate: 1,
                doneDate: 0,
                activityDate: 1,
              },
            ],
          },
        })
      );
      return;
    }

    if (method === 'torrent-remove') {
      response.end(JSON.stringify({ result: 'success', arguments: {} }));
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ result: 'unknown', arguments: {} }));
  });

  const databasePath = await createDatabasePath();
  const database = await seedMediaItem(databasePath);
  const config = createResolvedConfig();
  database.repositories.releaseSuppressions.create({
    mediaKey: 'radarr:movie:201',
    fingerprintType: 'release_title',
    fingerprintValue: 'example movie web dl',
    reason: 'TX_ERROR_REMOVE',
    source: 'transmission_guard',
    createdAt: '2026-04-04T10:00:00.000Z',
    expiresAt: '2026-04-11T10:00:00.000Z',
  });

  try {
    const summary = await runTransmissionGuard({
      database,
      config,
      client: createTransmissionClient({
        baseUrl: server.url,
        username: 'user',
        password: 'pass',
      }),
      now: new Date('2026-04-04T12:00:00.000Z'),
    });

    assert.equal(summary.removedCount, 1);
    assert.equal(
      database.repositories.transmissionTorrentState.getByHash('hash-loop')
        ?.removalReason,
      'TX_LOOP_REPEAT_RELEASE'
    );
  } finally {
    database.close();
    await server.close();
  }
});
