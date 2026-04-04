import { randomUUID } from 'node:crypto';

import type { DatabaseContext, RunHistoryRecord } from '@/src/db';
import {
  createActivityTracker,
  logger,
  recordRunCompletion,
  type ActivityTracker,
} from '@/src/observability';

export type CoordinatedRunType = 'scheduled' | 'sync_only' | 'manual_dry' | 'manual_live';

export type CoordinatedRunStatus = 'success' | 'partial' | 'failed';

export interface RunExecutionContext {
  runId: string;
  runType: CoordinatedRunType;
  startedAt: string;
  startupGraceActive: boolean;
  liveDispatchAllowed: boolean;
  activity: ActivityTracker;
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

export interface SchedulerCoordinatorStatus {
  startedAt: string;
  startupGraceActive: boolean;
  nextScheduledRunAt: string | null;
  maxRunDurationMs: number;
  activeRun: {
    runId: string;
    runType: CoordinatedRunType;
    startedAt: string;
    expiresAt: string;
    durationMs: number;
    overrun: boolean;
  } | null;
}

export interface SchedulerCoordinatorOptions {
  database: DatabaseContext;
  cadenceMs: number;
  startupGracePeriodMs: number;
  maxRunDurationMs: number;
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
const ABANDONED_RUN_PREFIX = 'abandoned_run:';

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

const getAbandonedRunKey = (runId: string) => `${ABANDONED_RUN_PREFIX}${runId}`;

const markRunAbandoned = (
  database: DatabaseContext,
  input: {
    runId: string;
    runType: CoordinatedRunType;
    reason: string;
    nowIso: string;
  }
): void => {
  database.repositories.serviceState.set({
    key: getAbandonedRunKey(input.runId),
    value: {
      runId: input.runId,
      runType: input.runType,
      reason: input.reason,
      markedAt: input.nowIso,
    },
    updatedAt: input.nowIso,
  });
};

const isRunAbandoned = (database: DatabaseContext, runId: string): boolean => {
  return database.repositories.serviceState.get(getAbandonedRunKey(runId)) !== null;
};

const createRunTimeoutError = (runType: CoordinatedRunType, timeoutMs: number): Error => {
  const error = new Error(
    `${runType.replace('_', ' ')} run exceeded max duration of ${timeoutMs}ms`
  );
  error.name = 'RunTimeoutError';
  return error;
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
  let nextScheduledRunAt: Date | null = null;

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
      logger.warn({
        event: 'run_rejected',
        runId,
        runType,
        reason: 'run_in_progress',
      });
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
    const activityTracker = createActivityTracker(options.database, {
      runId,
      runType,
    });
    activityTracker.info({
      source: 'scheduler',
      stage: 'cycle_started',
      message: `${runType.replace('_', ' ')} run started`,
      detail: startupGraceActive ? 'Startup grace active' : null,
    });
    logger.info({
      event: 'cycle_started',
      runId,
      runType,
      startupGraceActive,
    });

    try {
      const timeoutPromise = new Promise<RunExecutionResult>((_, reject) => {
        const timeoutHandle = setTimeout(() => {
          reject(createRunTimeoutError(runType, options.maxRunDurationMs));
        }, options.maxRunDurationMs);
        if (typeof timeoutHandle === 'object' && timeoutHandle !== null && 'unref' in timeoutHandle) {
          (timeoutHandle as NodeJS.Timeout).unref();
        }
      });
      const executionPromise = options.executeRun({
        runId,
        runType,
        startedAt: runStartedAtIso,
        startupGraceActive,
        liveDispatchAllowed:
          runType === 'manual_live' || runType === 'scheduled'
            ? !startupGraceActive
            : false,
        activity: activityTracker,
      });
      const executionResult = await Promise.race([executionPromise, timeoutPromise]);

      if (isRunAbandoned(options.database, runId)) {
        activityTracker.warn({
          source: 'scheduler',
          stage: 'cycle_abandoned',
          message: `${runType.replace('_', ' ')} run was abandoned before completion`,
          detail: 'Ignoring late completion from the abandoned run.',
        });
        return {
          accepted: true,
          runId,
          reason: 'started',
          startupGraceActive,
        };
      }

      const counts = getCounts(executionResult);
      const finishedAtIso = now().toISOString();
      options.database.repositories.runHistory.update({
        id: runId,
        runType,
        startedAt: runStartedAtIso,
        finishedAt: finishedAtIso,
        status: executionResult.status,
        candidateCount: counts.candidateCount,
        dispatchCount: counts.dispatchCount,
        skipCount: counts.skipCount,
        errorCount: counts.errorCount,
        summary: executionResult.summary ?? {},
      });
      recordRunCompletion({
        runType,
        status: executionResult.status,
        durationMs: new Date(finishedAtIso).getTime() - runStart.getTime(),
      });
      logger.info({
        event: 'cycle_finished',
        runId,
        runType,
        status: executionResult.status,
        ...counts,
      });
    } catch (error) {
      const finishedAtIso = now().toISOString();
      if (error instanceof Error && error.name === 'RunTimeoutError') {
        markRunAbandoned(options.database, {
          runId,
          runType,
          reason: error.message,
          nowIso: finishedAtIso,
        });
      }

      if (isRunAbandoned(options.database, runId)) {
        options.database.repositories.runHistory.update({
          id: runId,
          runType,
          startedAt: runStartedAtIso,
          finishedAt: finishedAtIso,
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
            recovered: true,
          },
        });
      } else {
      options.database.repositories.runHistory.update({
        id: runId,
        runType,
        startedAt: runStartedAtIso,
        finishedAt: finishedAtIso,
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
      }
      recordRunCompletion({
        runType,
        status: 'failed',
        durationMs: new Date(finishedAtIso).getTime() - runStart.getTime(),
      });
      logger.error({
        event: 'cycle_failed',
        runId,
        runType,
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
              }
            : {
              message: 'Unknown scheduler error',
            },
      });
      activityTracker.error({
        source: 'scheduler',
        stage: 'cycle_failed',
        message: `${runType.replace('_', ' ')} run failed`,
        detail: error instanceof Error ? error.message : 'Unknown scheduler error',
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

      nextScheduledRunAt = new Date(now().getTime() + options.cadenceMs);
      intervalHandle = createScheduledInterval(() => {
        nextScheduledRunAt = new Date(now().getTime() + options.cadenceMs);
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
    getStatus(): SchedulerCoordinatorStatus {
      const referenceTime = now();
      const lockState =
        options.database.repositories.serviceState.get<SchedulerLockState>(
          SCHEDULER_LOCK_KEY
        );

      return {
        startedAt: startedAt.toISOString(),
        startupGraceActive: isStartupGraceActive(referenceTime),
        nextScheduledRunAt: nextScheduledRunAt?.toISOString() ?? null,
        maxRunDurationMs: options.maxRunDurationMs,
        activeRun:
          lockState && lockState.value.expiresAt > referenceTime.toISOString()
            ? {
                runId: lockState.value.runId,
                runType: lockState.value.runType,
                startedAt: lockState.value.startedAt,
                expiresAt: lockState.value.expiresAt,
                durationMs:
                  referenceTime.getTime() -
                  new Date(lockState.value.startedAt).getTime(),
                overrun:
                  referenceTime.getTime() -
                    new Date(lockState.value.startedAt).getTime() >
                  options.maxRunDurationMs,
              }
            : null,
      };
    },
    recoverActiveRun(reason = 'Operator recovery requested'): {
      recovered: boolean;
      runId: string | null;
    } {
      const referenceTime = now();
      const lockState =
        options.database.repositories.serviceState.get<SchedulerLockState>(
          SCHEDULER_LOCK_KEY
        );

      if (!lockState || lockState.value.expiresAt <= referenceTime.toISOString()) {
        return {
          recovered: false,
          runId: null,
        };
      }

      const finishedAtIso = referenceTime.toISOString();
      markRunAbandoned(options.database, {
        runId: lockState.value.runId,
        runType: lockState.value.runType,
        reason,
        nowIso: finishedAtIso,
      });
      options.database.repositories.runHistory.update({
        id: lockState.value.runId,
        runType: lockState.value.runType,
        startedAt: lockState.value.startedAt,
        finishedAt: finishedAtIso,
        status: 'failed',
        candidateCount: 0,
        dispatchCount: 0,
        skipCount: 0,
        errorCount: 1,
        summary: {
          error: {
            name: 'RunRecoveredError',
            message: reason,
          },
          recovered: true,
        },
      });
      createActivityTracker(options.database, {
        runId: lockState.value.runId,
        runType: lockState.value.runType,
      }).warn({
        source: 'scheduler',
        stage: 'manual_recovery',
        message: `${lockState.value.runType.replace('_', ' ')} run was manually recovered`,
        detail: reason,
      });
      releaseSchedulerLock(options.database, lockState.value.runId, finishedAtIso);

      return {
        recovered: true,
        runId: lockState.value.runId,
      };
    },
  };
};
