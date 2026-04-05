import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { initializeDatabase } from './index';

const createDatabasePath = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'edarr-db-'));
  return join(directory, 'orchestrator.sqlite');
};

test('initializeDatabase creates the schema on an empty database', async () => {
  const databasePath = await createDatabasePath();
  const database = await initializeDatabase(databasePath);

  try {
    const tables = database.connection
      .prepare<[], { name: string }>(
        `
          SELECT name
          FROM sqlite_master
          WHERE type = 'table'
          ORDER BY name ASC
        `
      )
      .all()
      .map((row) => row.name);

    assert.deepEqual(
      tables.filter((table) =>
        [
          'activity_log',
          'app_session',
          'app_user',
          'login_attempt',
          'media_item_state',
          'release_suppression',
          'run_history',
          'schema_migrations',
          'search_attempt',
          'service_state',
          'sqlite_sequence',
          'transmission_torrent_state',
          'wanted_page_coverage',
        ].includes(table)
      ),
      [
        'activity_log',
        'app_session',
        'app_user',
        'login_attempt',
        'media_item_state',
        'release_suppression',
        'run_history',
        'schema_migrations',
        'search_attempt',
        'service_state',
        'sqlite_sequence',
        'transmission_torrent_state',
        'wanted_page_coverage',
      ]
    );

    assert.equal(database.appliedMigrations.length, 4);
  } finally {
    database.close();
  }
});

test('initializeDatabase does not reapply migrations on a second startup', async () => {
  const databasePath = await createDatabasePath();
  const firstDatabase = await initializeDatabase(databasePath);

  try {
    assert.equal(firstDatabase.appliedMigrations.length, 4);
  } finally {
    firstDatabase.close();
  }

  const secondDatabase = await initializeDatabase(databasePath);

  try {
    const row = secondDatabase.connection
      .prepare<
        [],
        { total: number } | undefined
      >('SELECT COUNT(*) AS total FROM schema_migrations')
      .get();

    assert.equal(secondDatabase.appliedMigrations.length, 0);
    assert.equal(row?.total, 4);
  } finally {
    secondDatabase.close();
  }
});

test('repositories can write and read core records', async () => {
  const databasePath = await createDatabasePath();
  const database = await initializeDatabase(databasePath);

  try {
    database.repositories.serviceState.set({
      key: 'bootstrap_state',
      value: { completed: false },
      updatedAt: '2026-04-04T00:00:00.000Z',
    });

    database.repositories.appUsers.create({
      id: 'user-1',
      username: 'admin',
      passwordHash: 'hash',
      createdAt: '2026-04-04T00:00:00.000Z',
      updatedAt: '2026-04-04T00:00:00.000Z',
      disabled: false,
    });

    database.repositories.mediaItemState.upsert({
      mediaKey: 'radarr:movie:1',
      mediaType: 'radarr_movie',
      arrId: 1,
      parentArrId: null,
      externalPath: 'movie/example-movie',
      title: 'Example Movie',
      monitored: true,
      releaseDate: '2026-04-01',
      wantedState: 'missing',
      inQueue: false,
      retryCount: 0,
      lastSearchAt: null,
      lastGrabAt: null,
      nextEligibleAt: null,
      suppressedUntil: null,
      suppressionReason: null,
      lastSeenAt: '2026-04-04T00:00:00.000Z',
      stateHash: 'state-hash-1',
    });
    database.repositories.wantedPageCoverage.upsert({
      app: 'sonarr',
      collectionKind: 'missing',
      pageNumber: 4,
      lastFetchedAt: '2026-04-04T00:02:00.000Z',
      lastFetchStatus: 'success',
      lastObservedTotalPages: 12,
      lastObservedTotalRecords: 2400,
    });

    const serviceState = database.repositories.serviceState.get<{
      completed: boolean;
    }>('bootstrap_state');
    const user = database.repositories.appUsers.findByUsername('admin');
    const mediaItem =
      database.repositories.mediaItemState.getByMediaKey('radarr:movie:1');
    const coverage = database.repositories.wantedPageCoverage.listByCollection(
      'sonarr',
      'missing'
    );
    database.repositories.activityLog.insert({
      occurredAt: '2026-04-04T00:01:00.000Z',
      level: 'info',
      source: 'scheduler',
      stage: 'sync_start',
      message: 'Starting sync',
      detail: null,
      runId: 'run-1',
      runType: 'sync_only',
      progressCurrent: 1,
      progressTotal: 10,
      metadata: { sample: true },
    });
    const activity = database.repositories.activityLog.listRecent(1);

    assert.deepEqual(serviceState?.value, { completed: false });
    assert.equal(database.repositories.appUsers.count(), 1);
    assert.equal(user?.username, 'admin');
    assert.equal(mediaItem?.title, 'Example Movie');
    assert.equal(mediaItem?.externalPath, 'movie/example-movie');
    assert.equal(database.repositories.mediaItemState.count(), 1);
    assert.equal(coverage[0]?.pageNumber, 4);
    assert.equal(activity[0]?.message, 'Starting sync');
  } finally {
    database.close();
  }
});

test('database state persists cleanly across restart boundaries', async () => {
  const databasePath = await createDatabasePath();
  const firstDatabase = await initializeDatabase(databasePath);

  try {
    firstDatabase.repositories.runHistory.create({
      id: 'run-1',
      runType: 'manual_live',
      startedAt: '2026-04-04T12:00:00.000Z',
      finishedAt: '2026-04-04T12:00:05.000Z',
      status: 'success',
      candidateCount: 1,
      dispatchCount: 1,
      skipCount: 0,
      errorCount: 0,
      summary: {
        phase: 'persisted-before-restart',
      },
    });

    firstDatabase.repositories.mediaItemState.upsert({
      mediaKey: 'sonarr:episode:123',
      mediaType: 'sonarr_episode',
      arrId: 123,
      parentArrId: 12,
      externalPath: 'series/restart-proof-show',
      title: 'Restart Proof Episode',
      monitored: true,
      releaseDate: '2026-04-01T00:00:00.000Z',
      wantedState: 'missing',
      inQueue: false,
      retryCount: 2,
      lastSearchAt: '2026-04-04T06:00:00.000Z',
      lastGrabAt: null,
      nextEligibleAt: '2026-04-05T06:00:00.000Z',
      suppressedUntil: null,
      suppressionReason: null,
      lastSeenAt: '2026-04-04T12:00:00.000Z',
      stateHash: 'restart-state-hash',
    });

    firstDatabase.repositories.searchAttempts.insertMany([
      {
        runId: 'run-1',
        mediaKey: 'sonarr:episode:123',
        app: 'sonarr',
        wantedState: 'missing',
        decision: 'dispatch',
        reasonCode: 'ELIGIBLE_MISSING_RECENT',
        dryRun: false,
        arrCommandId: 555,
        attemptedAt: '2026-04-04T12:00:00.000Z',
        completedAt: '2026-04-04T12:00:01.000Z',
        outcome: 'accepted',
      },
    ]);
  } finally {
    firstDatabase.close();
  }

  const secondDatabase = await initializeDatabase(databasePath);

  try {
    const latestRun = secondDatabase.repositories.runHistory.getLatest();
    const mediaItem =
      secondDatabase.repositories.mediaItemState.getByMediaKey('sonarr:episode:123');
    const attempts = secondDatabase.repositories.searchAttempts.listByRunId('run-1');

    assert.equal(latestRun?.id, 'run-1');
    assert.equal(latestRun?.summary.phase, 'persisted-before-restart');
    assert.equal(mediaItem?.retryCount, 2);
    assert.equal(mediaItem?.nextEligibleAt, '2026-04-05T06:00:00.000Z');
    assert.deepEqual(
      attempts.map((attempt) => [
        attempt.mediaKey,
        attempt.arrCommandId,
        attempt.outcome,
      ]),
      [['sonarr:episode:123', 555, 'accepted']]
    );
  } finally {
    secondDatabase.close();
  }
});

test('run history and attempt repositories support paged queries', async () => {
  const databasePath = await createDatabasePath();
  const database = await initializeDatabase(databasePath);

  try {
    for (let index = 1; index <= 3; index += 1) {
      database.repositories.runHistory.create({
        id: `run-${index}`,
        runType: 'scheduled',
        startedAt: `2026-04-0${index}T12:00:00.000Z`,
        finishedAt: `2026-04-0${index}T12:05:00.000Z`,
        status: 'success',
        candidateCount: index,
        dispatchCount: index,
        skipCount: 0,
        errorCount: 0,
        summary: {},
      });
    }

    database.repositories.searchAttempts.insertMany([
      {
        runId: 'run-3',
        mediaKey: 'sonarr:episode:1',
        app: 'sonarr',
        wantedState: 'missing',
        decision: 'dispatch',
        reasonCode: 'ELIGIBLE_MISSING_RECENT',
        dryRun: false,
        arrCommandId: 1,
        attemptedAt: '2026-04-03T12:00:00.000Z',
        completedAt: '2026-04-03T12:00:01.000Z',
        outcome: 'accepted',
      },
      {
        runId: 'run-3',
        mediaKey: 'sonarr:episode:2',
        app: 'sonarr',
        wantedState: 'missing',
        decision: 'skip',
        reasonCode: 'SKIP_COOLDOWN_ACTIVE',
        dryRun: false,
        arrCommandId: null,
        attemptedAt: '2026-04-03T12:00:02.000Z',
        completedAt: null,
        outcome: null,
      },
      {
        runId: 'run-3',
        mediaKey: 'sonarr:episode:3',
        app: 'sonarr',
        wantedState: 'missing',
        decision: 'skip',
        reasonCode: 'SKIP_ITEM_SUPPRESSED',
        dryRun: false,
        arrCommandId: null,
        attemptedAt: '2026-04-03T12:00:03.000Z',
        completedAt: null,
        outcome: null,
      },
    ]);

    assert.equal(database.repositories.runHistory.countAll(), 3);
    assert.deepEqual(
      database.repositories.runHistory.listPage(2, 0).map((run) => run.id),
      ['run-3', 'run-2']
    );
    assert.deepEqual(
      database.repositories.runHistory.listPage(2, 2).map((run) => run.id),
      ['run-1']
    );

    assert.equal(database.repositories.searchAttempts.countByRunId('run-3'), 3);
    assert.deepEqual(
      database
        .repositories.searchAttempts.listPageByRunId('run-3', 2, 0)
        .map((attempt) => attempt.mediaKey),
      ['sonarr:episode:1', 'sonarr:episode:2']
    );
    assert.deepEqual(
      database
        .repositories.searchAttempts.listPageByRunId('run-3', 2, 2)
        .map((attempt) => attempt.mediaKey),
      ['sonarr:episode:3']
    );
  } finally {
    database.close();
  }
});
