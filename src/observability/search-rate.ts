import type { ResolvedConfig } from '@/src/config';
import type { DatabaseContext } from '@/src/db';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

type SearchThrottleReason =
  | 'THROTTLE_GLOBAL_DISPATCH_SPACING'
  | 'THROTTLE_GLOBAL_15M_BUDGET'
  | 'THROTTLE_GLOBAL_1H_BUDGET'
  | 'THROTTLE_GLOBAL_24H_BUDGET';

interface SearchRateWindowSnapshot {
  key: '15m' | '1h' | '24h';
  used: number;
  limit: number;
  remaining: number;
  nextEligibleAt: string | null;
}

export interface SearchRateSnapshot {
  latestDispatchAt: string | null;
  currentThrottleReason: SearchThrottleReason | null;
  nextEligibleAt: string | null;
  spacing: {
    limitMs: number;
    remainingMs: number;
    nextEligibleAt: string | null;
  };
  windows: SearchRateWindowSnapshot[];
}

const createWindowSnapshot = (input: {
  key: SearchRateWindowSnapshot['key'];
  limit: number;
  durationMs: number;
  timestamps: string[];
  now: Date;
}): SearchRateWindowSnapshot => {
  const used = input.timestamps.length;
  const remaining = Math.max(input.limit - used, 0);

  if (used < input.limit) {
    return {
      key: input.key,
      used,
      limit: input.limit,
      remaining,
      nextEligibleAt: null,
    };
  }

  const requiredExpiries = used - input.limit + 1;
  const index = Math.max(requiredExpiries - 1, 0);
  const boundaryTimestamp = input.timestamps[index] ?? null;

  return {
    key: input.key,
    used,
    limit: input.limit,
    remaining,
    nextEligibleAt: boundaryTimestamp
      ? new Date(new Date(boundaryTimestamp).getTime() + input.durationMs).toISOString()
      : null,
  };
};

const getCurrentThrottleReason = (
  windows: SearchRateWindowSnapshot[],
  spacingNextEligibleAt: string | null
): SearchThrottleReason | null => {
  if (spacingNextEligibleAt) {
    return 'THROTTLE_GLOBAL_DISPATCH_SPACING';
  }

  if (windows[0]?.nextEligibleAt) {
    return 'THROTTLE_GLOBAL_15M_BUDGET';
  }

  if (windows[1]?.nextEligibleAt) {
    return 'THROTTLE_GLOBAL_1H_BUDGET';
  }

  if (windows[2]?.nextEligibleAt) {
    return 'THROTTLE_GLOBAL_24H_BUDGET';
  }

  return null;
};

export const getSearchRateSnapshot = (
  database: DatabaseContext,
  config: ResolvedConfig,
  now: Date = new Date()
): SearchRateSnapshot => {
  const nowMs = now.getTime();
  const latestDispatchAt =
    database.repositories.searchAttempts.getLatestLiveDispatchAttemptAt();
  const last24hDispatches =
    database.repositories.searchAttempts.listLiveDispatchAttemptTimesSince(
      new Date(nowMs - DAY_MS).toISOString()
    );

  const dispatches15m = last24hDispatches.filter(
    (attemptedAt) => nowMs - new Date(attemptedAt).getTime() < 15 * MINUTE_MS
  );
  const dispatches1h = last24hDispatches.filter(
    (attemptedAt) => nowMs - new Date(attemptedAt).getTime() < HOUR_MS
  );

  const windows: SearchRateWindowSnapshot[] = [
    createWindowSnapshot({
      key: '15m',
      limit: config.safety.rollingSearchLimits.per15m,
      durationMs: 15 * MINUTE_MS,
      timestamps: dispatches15m,
      now,
    }),
    createWindowSnapshot({
      key: '1h',
      limit: config.safety.rollingSearchLimits.per1h,
      durationMs: HOUR_MS,
      timestamps: dispatches1h,
      now,
    }),
    createWindowSnapshot({
      key: '24h',
      limit: config.safety.rollingSearchLimits.per24h,
      durationMs: DAY_MS,
      timestamps: last24hDispatches,
      now,
    }),
  ];

  const spacingRemainingMs = latestDispatchAt
    ? Math.max(
        config.safety.minGlobalDispatchSpacingMs -
          (nowMs - new Date(latestDispatchAt).getTime()),
        0
      )
    : 0;
  const spacingNextEligibleAt =
    spacingRemainingMs > 0 ? new Date(nowMs + spacingRemainingMs).toISOString() : null;
  const nextEligibleCandidates = [
    spacingNextEligibleAt,
    ...windows.map((window) => window.nextEligibleAt),
  ].filter((value): value is string => value !== null);

  return {
    latestDispatchAt,
    currentThrottleReason: getCurrentThrottleReason(windows, spacingNextEligibleAt),
    nextEligibleAt:
      nextEligibleCandidates.length > 0
        ? (nextEligibleCandidates.sort((left, right) => left.localeCompare(right))[
            nextEligibleCandidates.length - 1
          ] ?? null)
        : null,
    spacing: {
      limitMs: config.safety.minGlobalDispatchSpacingMs,
      remainingMs: spacingRemainingMs,
      nextEligibleAt: spacingNextEligibleAt,
    },
    windows,
  };
};
