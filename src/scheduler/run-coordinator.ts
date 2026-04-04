import { randomUUID } from 'node:crypto';

import type { DatabaseContext, RunHistoryRecord } from '@/src/db';

export type CoordinatedRunType = 'scheduled' | 'sync_only' | 'manual_dry' | 'manual_live';

export type CoordinatedRunStatus = 'success' | 'partial' | 'failed';

export interface RunExecutionContext {
  runId: string;
  runType: CoordinatedRunType;
  startedAt: string;
  startupGraceActive: boolean;
  liveDispatchAllowed: boolean;
}

export interface RunExecutionResult {
  status: CoordinatedRunStatus;
  candidateCount?: number;
  dispatchCount?: number;
  skipCount?: number;
  errorCount?: number;
  summary?: Record<string, unknown>;
}

export interface RunInvocationResult {
  accepted: boolean;
  runId: string | null;
  reason: 'started' | 'run_in_progress';
  startupGraceActive: boolean;
}

export interface SchedulerCoordinatorOptions {
  database: DatabaseContext;
  cadenceMs: number;
  startupGracePeriodMs: number;
  lockTtlMs: number;
  executeRun: (context: RunExecutionContext) => Promise<RunExecutionResult>;
  now?: () => Date;
  createInterval?: (callback: () => void, delay: number) => unknown;
  clearScheduledInterval?: (handle: unknown) => void;
}

interface SchedulerLockState {
  runId: string;
  runType: CoordinatedRunType;
  startedAt: string;
  expiresAt: string;
}

const SCHEDULER_LOCK_KEY = 'scheduler_lock';

const createRunId = (runType: CoordinatedRunType): string => {
  return `${runType}_${randomUUID()}`;
};

const createLockState = (
  runId: string,
  runType: CoordinatedRunType,
  startedAt: Date,
  lockTtlMs: number
): SchedulerLockState => {
  return {
    runId,
    runType,
    startedAt: startedAt.toISOString(),
    expiresAt: new Date(startedAt.getTime() + lockTtlMs).toISOString(),
  };
};

const createRunningRunHistoryRecord = (
  runId: string,
  runType: CoordinatedRunType,
  startedAt: string
): RunHistoryRecord => {
  return {
    id: runId,
    runType,
    startedAt,
    finishedAt: null,
    status: 'running',
    candidateCount: 0,
    dispatchCount: 0,
    skipCount: 0,
    errorCount: 0,
    summary: {},
  };
};

const acquireSchedulerLock = (
  database: DatabaseContext,
  lockState: SchedulerLockState,
  nowIso: string
): boolean => {
  return database.connection.transaction(() => {
    const existing =
      database.repositories.serviceState.get<SchedulerLockState>(SCHEDULER_LOCK_KEY);

    if (existing && existing.value.expiresAt > nowIso) {
      return false;
    }

    database.repositories.serviceState.set({
      key: SCHEDULER_LOCK_KEY,
      value: lockState,
      updatedAt: nowIso,
    });

    return true;
  })();
};

const releaseSchedulerLock = (
  database: DatabaseContext,
  runId: string,
  nowIso: string
): void => {
  database.connection.transaction(() => {
    const existing =
      database.repositories.serviceState.get<SchedulerLockState>(SCHEDULER_LOCK_KEY);

    if (!existing || existing.value.runId !== runId) {
      return;
    }

    database.repositories.serviceState.delete(SCHEDULER_LOCK_KEY);
    database.repositories.serviceState.set({
      key: 'scheduler_lock_last_released_at',
      value: { runId, releasedAt: nowIso },
      updatedAt: nowIso,
    });
  })();
};

const getCounts = (result: RunExecutionResult) => {
  return {
    candidateCount: result.candidateCount ?? 0,
    dispatchCount: result.dispatchCount ?? 0,
    skipCount: result.skipCount ?? 0,
    errorCount: result.errorCount ?? 0,
  };
};

export const createSchedulerCoordinator = (options: SchedulerCoordinatorOptions) => {
  const now = options.now ?? (() => new Date());
  const createScheduledInterval =
    options.createInterval ??
    ((callback: () => void, delay: number) => setInterval(callback, delay));
  const clearScheduledInterval =
    options.clearScheduledInterval ??
    ((handle: unknown) => clearInterval(handle as NodeJS.Timeout));
  const startedAt = now();
  let intervalHandle: unknown = null;

  const isStartupGraceActive = (referenceTime: Date = now()): boolean => {
    return referenceTime.getTime() < startedAt.getTime() + options.startupGracePeriodMs;
  };

  const run = async (runType: CoordinatedRunType): Promise<RunInvocationResult> => {
    const runStart = now();
    const runId = createRunId(runType);
    const lockState = createLockState(runId, runType, runStart, options.lockTtlMs);
    const runStartedAtIso = runStart.toISOString();
    const startupGraceActive = isStartupGraceActive(runStart);

    if (!acquireSchedulerLock(options.database, lockState, runStartedAtIso)) {
      return {
        accepted: false,
        runId: null,
        reason: 'run_in_progress',
        startupGraceActive,
      };
    }

    options.database.repositories.runHistory.create(
      createRunningRunHistoryRecord(runId, runType, runStartedAtIso)
    );

    try {
      const executionResult = await options.executeRun({
        runId,
        runType,
        startedAt: runStartedAtIso,
        startupGraceActive,
        liveDispatchAllowed:
          runType === 'manual_live' || runType === 'scheduled'
            ? !startupGraceActive
            : false,
      });

      const counts = getCounts(executionResult);
      options.database.repositories.runHistory.update({
        id: runId,
        runType,
        startedAt: runStartedAtIso,
        finishedAt: now().toISOString(),
        status: executionResult.status,
        candidateCount: counts.candidateCount,
        dispatchCount: counts.dispatchCount,
        skipCount: counts.skipCount,
        errorCount: counts.errorCount,
        summary: executionResult.summary ?? {},
      });
    } catch (error) {
      options.database.repositories.runHistory.update({
        id: runId,
        runType,
        startedAt: runStartedAtIso,
        finishedAt: now().toISOString(),
        status: 'failed',
        candidateCount: 0,
        dispatchCount: 0,
        skipCount: 0,
        errorCount: 1,
        summary: {
          error:
            error instanceof Error
              ? {
                  name: error.name,
                  message: error.message,
                }
              : {
                  message: 'Unknown scheduler error',
                },
        },
      });
    } finally {
      releaseSchedulerLock(options.database, runId, now().toISOString());
    }

    return {
      accepted: true,
      runId,
      reason: 'started',
      startupGraceActive,
    };
  };

  return {
    start(): void {
      if (intervalHandle) {
        return;
      }

      intervalHandle = createScheduledInterval(() => {
        void run('scheduled');
      }, options.cadenceMs);
    },
    stop(): void {
      if (!intervalHandle) {
        return;
      }

      clearScheduledInterval(intervalHandle);
      intervalHandle = null;
    },
    isStartupGraceActive,
    runScheduledCycle(): Promise<RunInvocationResult> {
      return run('scheduled');
    },
    runManual(
      runType: Exclude<CoordinatedRunType, 'scheduled'>
    ): Promise<RunInvocationResult> {
      return run(runType);
    },
  };
};
