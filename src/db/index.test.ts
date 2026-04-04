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
        ].includes(table)
      ),
      [
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
      ]
    );

    assert.equal(database.appliedMigrations.length, 1);
  } finally {
    database.close();
  }
});

test('initializeDatabase does not reapply migrations on a second startup', async () => {
  const databasePath = await createDatabasePath();
  const firstDatabase = await initializeDatabase(databasePath);

  try {
    assert.equal(firstDatabase.appliedMigrations.length, 1);
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
    assert.equal(row?.total, 1);
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

    const serviceState = database.repositories.serviceState.get<{
      completed: boolean;
    }>('bootstrap_state');
    const user = database.repositories.appUsers.findByUsername('admin');
    const mediaItem =
      database.repositories.mediaItemState.getByMediaKey('radarr:movie:1');

    assert.deepEqual(serviceState?.value, { completed: false });
    assert.equal(database.repositories.appUsers.count(), 1);
    assert.equal(user?.username, 'admin');
    assert.equal(mediaItem?.title, 'Example Movie');
    assert.equal(database.repositories.mediaItemState.count(), 1);
  } finally {
    database.close();
  }
});
