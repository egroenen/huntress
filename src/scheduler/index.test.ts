import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { initializeDatabase } from '@/src/db';

import { createSchedulerCoordinator } from './run-coordinator';

const createDatabasePath = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'edarr-scheduler-'));
  return join(directory, 'orchestrator.sqlite');
};

test('manual runs create run history and reject overlaps', async () => {
  const databasePath = await createDatabasePath();
  const database = await initializeDatabase(databasePath);

  let resolveRun: () => void = () => {
    throw new Error('Expected the first run resolver to be assigned');
  };
  const firstRunFinished = new Promise<void>((resolve) => {
    resolveRun = resolve;
  });

  let callCount = 0;
  const coordinator = createSchedulerCoordinator({
    database,
    cadenceMs: 60_000,
    startupGracePeriodMs: 60_000,
    maxRunDurationMs: 5 * 60_000,
    lockTtlMs: 60_000,
    async executeRun(context) {
      callCount += 1;

      if (callCount === 1) {
        assert.equal(context.runType, 'manual_live');
        assert.equal(context.startupGraceActive, true);
        assert.equal(context.liveDispatchAllowed, false);
        await firstRunFinished;
      }

      return {
        status: 'success',
        candidateCount: 2,
        dispatchCount: 0,
        skipCount: 2,
      };
    },
  });

  try {
    const firstRunPromise = coordinator.runManual('manual_live');
    const secondRunResult = await coordinator.runManual('manual_dry');

    assert.equal(secondRunResult.accepted, false);
    assert.equal(secondRunResult.reason, 'run_in_progress');

    resolveRun();
    const firstRunResult = await firstRunPromise;
    const runHistory = firstRunResult.runId
      ? database.repositories.runHistory.getById(firstRunResult.runId)
      : null;

    assert.equal(firstRunResult.accepted, true);
    assert.equal(runHistory?.status, 'success');
    assert.equal(runHistory?.candidateCount, 2);
    assert.equal(
      database.repositories.serviceState.get('scheduler_lock'),
      null,
      'lock should be released after completion'
    );
  } finally {
    database.close();
  }
});

test('stale scheduler locks are reclaimed before a new run starts', async () => {
  const databasePath = await createDatabasePath();
  const database = await initializeDatabase(databasePath);
  const now = new Date('2026-04-04T12:00:00.000Z');

  database.repositories.serviceState.set({
    key: 'scheduler_lock',
    value: {
      runId: 'stale-run',
      runType: 'scheduled',
      startedAt: '2026-04-04T09:00:00.000Z',
      expiresAt: '2026-04-04T10:00:00.000Z',
    },
    updatedAt: now.toISOString(),
  });

  const coordinator = createSchedulerCoordinator({
    database,
    cadenceMs: 60_000,
    startupGracePeriodMs: 0,
    maxRunDurationMs: 5 * 60_000,
    lockTtlMs: 60_000,
    now: () => now,
    async executeRun() {
      return {
        status: 'success',
      };
    },
  });

  try {
    const result = await coordinator.runManual('sync_only');
    const runHistory = result.runId
      ? database.repositories.runHistory.getById(result.runId)
      : null;

    assert.equal(result.accepted, true);
    assert.equal(runHistory?.runType, 'sync_only');
    assert.equal(runHistory?.status, 'success');
  } finally {
    database.close();
  }
});

test('scheduled cadence triggers scheduled runs', async () => {
  const databasePath = await createDatabasePath();
  const database = await initializeDatabase(databasePath);

  let scheduledCallback: () => void = () => {
    throw new Error('Expected the scheduler to register an interval callback');
  };
  let registeredScheduledCallback = false;
  let scheduledIntervalMs: number | null = null;
  let executeCount = 0;

  const coordinator = createSchedulerCoordinator({
    database,
    cadenceMs: 5_000,
    startupGracePeriodMs: 0,
    maxRunDurationMs: 5 * 60_000,
    lockTtlMs: 60_000,
    createInterval(callback: () => void, intervalMs: number) {
      scheduledCallback = callback;
      registeredScheduledCallback = true;
      scheduledIntervalMs = intervalMs;
      return { fake: true } as unknown;
    },
    clearScheduledInterval() {},
    async executeRun(context) {
      executeCount += 1;
      assert.equal(context.runType, 'scheduled');
      assert.equal(context.liveDispatchAllowed, true);

      return {
        status: 'success',
      };
    },
  });

  try {
    coordinator.start();

    assert.equal(scheduledIntervalMs, 5_000);
    assert.equal(registeredScheduledCallback, true);

    scheduledCallback();
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(executeCount, 1);
    assert.equal(database.repositories.runHistory.getLatest()?.runType, 'scheduled');
  } finally {
    coordinator.stop();
    database.close();
  }
});

test('scheduled and manual live runs stay non-live when live mode is disabled', async () => {
  const databasePath = await createDatabasePath();
  const database = await initializeDatabase(databasePath);
  const seen: Array<{ runType: string; liveDispatchAllowed: boolean }> = [];

  const coordinator = createSchedulerCoordinator({
    database,
    cadenceMs: 5_000,
    startupGracePeriodMs: 0,
    maxRunDurationMs: 5 * 60_000,
    lockTtlMs: 60_000,
    isLiveModeEnabled: () => false,
    async executeRun(context) {
      seen.push({
        runType: context.runType,
        liveDispatchAllowed: context.liveDispatchAllowed,
      });

      return {
        status: 'success',
      };
    },
  });

  try {
    await coordinator.runManual('manual_live');
    await coordinator.runScheduledCycle();

    assert.deepEqual(seen, [
      { runType: 'manual_live', liveDispatchAllowed: false },
      { runType: 'scheduled', liveDispatchAllowed: false },
    ]);
  } finally {
    database.close();
  }
});

test('failed runs mark run history as failed and release the scheduler lock', async () => {
  const databasePath = await createDatabasePath();
  const database = await initializeDatabase(databasePath);

  const coordinator = createSchedulerCoordinator({
    database,
    cadenceMs: 60_000,
    startupGracePeriodMs: 0,
    maxRunDurationMs: 5 * 60_000,
    lockTtlMs: 60_000,
    async executeRun() {
      throw new Error('boom');
    },
  });

  try {
    const result = await coordinator.runManual('sync_only');
    const runHistory = result.runId
      ? database.repositories.runHistory.getById(result.runId)
      : null;

    assert.equal(result.accepted, true);
    assert.equal(runHistory?.status, 'failed');
    assert.equal(runHistory?.errorCount, 1);
    assert.equal(
      database.repositories.serviceState.get('scheduler_lock'),
      null,
      'lock should be released after a failed run'
    );
  } finally {
    database.close();
  }
});
