import type { DatabaseContext } from '@/src/db';
import { createRepositories } from '@/src/db/repositories';

const CURRENT_ACTIVITY_KEY = 'current_activity_snapshot';
const MAX_ACTIVITY_EVENTS = 500;

export type ActivityLevel = 'info' | 'warn' | 'error';

export interface ActivitySnapshot {
  occurredAt: string;
  level: ActivityLevel;
  source: string;
  stage: string;
  message: string;
  detail: string | null;
  runId: string | null;
  runType: string | null;
  progressCurrent: number | null;
  progressTotal: number | null;
  metadata: Record<string, unknown>;
  active: boolean;
}

export interface ActivityFeedState {
  current: ActivitySnapshot | null;
  recent: Array<ActivitySnapshot & { id?: number }>;
  totalRecent: number;
}

export interface ActivityTracker {
  info(input: ActivityWriteInput): void;
  warn(input: ActivityWriteInput): void;
  error(input: ActivityWriteInput): void;
  complete(input?: Omit<ActivityWriteInput, 'level'>): void;
}

interface ActivityTrackerContext {
  runId: string | null;
  runType: string | null;
}

interface ActivityWriteInput {
  source: string;
  stage: string;
  message: string;
  detail?: string | null;
  progressCurrent?: number | null;
  progressTotal?: number | null;
  metadata?: Record<string, unknown>;
}

const buildSnapshot = (
  context: ActivityTrackerContext,
  level: ActivityLevel,
  input: ActivityWriteInput,
  active: boolean
): ActivitySnapshot => {
  return {
    occurredAt: new Date().toISOString(),
    level,
    source: input.source,
    stage: input.stage,
    message: input.message,
    detail: input.detail ?? null,
    runId: context.runId,
    runType: context.runType,
    progressCurrent: input.progressCurrent ?? null,
    progressTotal: input.progressTotal ?? null,
    metadata: input.metadata ?? {},
    active,
  };
};

const persistSnapshot = (
  database: DatabaseContext,
  snapshot: ActivitySnapshot
): void => {
  database.connection.transaction(() => {
    const insertedId = database.repositories.activityLog.insert({
      occurredAt: snapshot.occurredAt,
      level: snapshot.level,
      source: snapshot.source,
      stage: snapshot.stage,
      message: snapshot.message,
      detail: snapshot.detail,
      runId: snapshot.runId,
      runType: snapshot.runType,
      progressCurrent: snapshot.progressCurrent,
      progressTotal: snapshot.progressTotal,
      metadata: snapshot.metadata,
    });
    if (insertedId % 25 === 0) {
      database.repositories.activityLog.pruneToLimit(MAX_ACTIVITY_EVENTS);
    }
    database.repositories.serviceState.set({
      key: CURRENT_ACTIVITY_KEY,
      value: snapshot,
      updatedAt: snapshot.occurredAt,
    });
  })();
};

export const createActivityTracker = (
  database: DatabaseContext,
  context: ActivityTrackerContext
): ActivityTracker => {
  const write = (
    level: ActivityLevel,
    input: ActivityWriteInput,
    active: boolean
  ): void => {
    persistSnapshot(database, buildSnapshot(context, level, input, active));
  };

  return {
    info(input) {
      write('info', input, true);
    },
    warn(input) {
      write('warn', input, true);
    },
    error(input) {
      write('error', input, true);
    },
    complete(input) {
      write(
        'info',
        {
          source: input?.source ?? 'scheduler',
          stage: input?.stage ?? 'complete',
          message: input?.message ?? 'Run finished.',
          detail: input?.detail ?? null,
          progressCurrent: input?.progressCurrent ?? null,
          progressTotal: input?.progressTotal ?? null,
          metadata: input?.metadata ?? {},
        },
        false
      );
    },
  };
};

const getActivityLogRepository = (
  database: DatabaseContext
): DatabaseContext['repositories']['activityLog'] => {
  const currentActivityLog = database.repositories.activityLog as
    | (DatabaseContext['repositories']['activityLog'] & {
        countAll?: () => number;
        listPage?: (limit: number, offset: number) => ReturnType<
          DatabaseContext['repositories']['activityLog']['listRecent']
        >;
      })
    | undefined;

  if (
    currentActivityLog &&
    typeof currentActivityLog.countAll === 'function' &&
    typeof currentActivityLog.listPage === 'function'
  ) {
    return currentActivityLog;
  }

  database.repositories = createRepositories(database.connection);
  return database.repositories.activityLog;
};

export const getActivityFeedState = (
  database: DatabaseContext,
  options?: {
    limit?: number;
    offset?: number;
  }
): ActivityFeedState => {
  const current =
    database.repositories.serviceState.get<ActivitySnapshot>(CURRENT_ACTIVITY_KEY)?.value ??
    null;
  const limit = options?.limit ?? 150;
  const offset = options?.offset ?? 0;
  const activityLog = getActivityLogRepository(database);

  return {
    current,
    totalRecent: activityLog.countAll(),
    recent: activityLog.listPage(limit, offset).map((event) => {
      const snapshot: ActivitySnapshot & { id?: number } = {
        occurredAt: event.occurredAt,
        level: event.level,
        source: event.source,
        stage: event.stage,
        message: event.message,
        detail: event.detail,
        runId: event.runId,
        runType: event.runType,
        progressCurrent: event.progressCurrent,
        progressTotal: event.progressTotal,
        metadata: event.metadata,
        active: current?.occurredAt === event.occurredAt && current?.stage === event.stage,
      };

      if (event.id !== undefined) {
        snapshot.id = event.id;
      }

      return snapshot;
    }),
  };
};
