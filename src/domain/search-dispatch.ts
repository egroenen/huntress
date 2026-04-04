import type { ResolvedConfig } from '@/src/config';
import type {
  DatabaseContext,
  MediaItemStateRecord,
  SearchAttemptRecord,
} from '@/src/db';
import type { RadarrApiClient, SonarrApiClient } from '@/src/integrations';

import {
  evaluateCandidateDecisions,
  getRetryIntervalMs,
  type CandidateDecision,
  type ReasonCode,
} from './decision-engine';

export interface SearchDispatchClients {
  sonarr: SonarrApiClient;
  radarr: RadarrApiClient;
}

export interface SearchDispatchRunInput {
  database: DatabaseContext;
  config: ResolvedConfig;
  clients: SearchDispatchClients;
  runId: string;
  live: boolean;
  now?: Date;
  sleep?: (durationMs: number) => Promise<void>;
}

export interface SearchDispatchRunSummary {
  candidateCount: number;
  dispatchCount: number;
  skipCount: number;
  errorCount: number;
  summary: Record<string, unknown>;
}

interface RuntimeThrottleState {
  latestDispatchAt: string | null;
  dispatchedSince15m: number;
  dispatchedSince1h: number;
  dispatchedSince24h: number;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const createAttempt = (record: SearchAttemptRecord): SearchAttemptRecord => record;

const getAppItems = (
  database: DatabaseContext,
  mediaType: 'sonarr_episode' | 'radarr_movie'
): MediaItemStateRecord[] => {
  return database.repositories.mediaItemState.listByMediaType(mediaType);
};

const buildDecisionSet = (
  database: DatabaseContext,
  config: ResolvedConfig,
  now: Date
): CandidateDecision[] => {
  const sonarrItems = getAppItems(database, 'sonarr_episode');
  const sonarrDecisions = evaluateCandidateDecisions({
    app: 'sonarr',
    items: sonarrItems,
    policy: config.policies.sonarr,
    now,
    panicDisableSearch: config.safety.panicDisableSearch,
    globalSearchBlocked: false,
    appAvailable: true,
    appDispatchLimit: config.policies.sonarr.maxSearchesPerCycle,
    globalDispatchLimit: config.safety.maxGlobalDispatchPerCycle,
  });

  const sonarrReservedDispatches = sonarrDecisions.filter(
    (decision) => decision.decision === 'dispatch'
  ).length;

  const radarrItems = getAppItems(database, 'radarr_movie');
  const radarrDecisions = evaluateCandidateDecisions({
    app: 'radarr',
    items: radarrItems,
    policy: config.policies.radarr,
    now,
    panicDisableSearch: config.safety.panicDisableSearch,
    globalSearchBlocked: false,
    appAvailable: true,
    appDispatchLimit: config.policies.radarr.maxSearchesPerCycle,
    globalDispatchLimit: Math.max(
      config.safety.maxGlobalDispatchPerCycle - sonarrReservedDispatches,
      0
    ),
  });

  return [...sonarrDecisions, ...radarrDecisions];
};

export const getSearchCandidatePreview = (input: {
  database: DatabaseContext;
  config: ResolvedConfig;
  now?: Date;
}): CandidateDecision[] => {
  return buildDecisionSet(input.database, input.config, input.now ?? new Date());
};

const createItemMap = (database: DatabaseContext): Map<string, MediaItemStateRecord> => {
  const items = [
    ...database.repositories.mediaItemState.listByMediaType('sonarr_episode'),
    ...database.repositories.mediaItemState.listByMediaType('radarr_movie'),
  ];

  return new Map(items.map((item) => [item.mediaKey, item]));
};

const getThrottleState = (
  database: DatabaseContext,
  nowIso: string
): RuntimeThrottleState => {
  const now = new Date(nowIso).getTime();

  return {
    latestDispatchAt:
      database.repositories.searchAttempts.getLatestLiveDispatchAttemptAt(),
    dispatchedSince15m: database.repositories.searchAttempts.countLiveDispatchesSince(
      new Date(now - 15 * MINUTE_MS).toISOString()
    ),
    dispatchedSince1h: database.repositories.searchAttempts.countLiveDispatchesSince(
      new Date(now - HOUR_MS).toISOString()
    ),
    dispatchedSince24h: database.repositories.searchAttempts.countLiveDispatchesSince(
      new Date(now - DAY_MS).toISOString()
    ),
  };
};

const getRollingThrottleReason = (
  config: ResolvedConfig,
  throttleState: RuntimeThrottleState
): ReasonCode | null => {
  if (throttleState.dispatchedSince15m >= config.safety.rollingSearchLimits.per15m) {
    return 'THROTTLE_GLOBAL_15M_BUDGET';
  }

  if (throttleState.dispatchedSince1h >= config.safety.rollingSearchLimits.per1h) {
    return 'THROTTLE_GLOBAL_1H_BUDGET';
  }

  if (throttleState.dispatchedSince24h >= config.safety.rollingSearchLimits.per24h) {
    return 'THROTTLE_GLOBAL_24H_BUDGET';
  }

  return null;
};

const updateThrottleStateAfterDispatch = (
  throttleState: RuntimeThrottleState,
  dispatchedAtIso: string
): void => {
  throttleState.latestDispatchAt = dispatchedAtIso;
  throttleState.dispatchedSince15m += 1;
  throttleState.dispatchedSince1h += 1;
  throttleState.dispatchedSince24h += 1;
};

const updateMediaItemAfterDispatch = (
  database: DatabaseContext,
  config: ResolvedConfig,
  item: MediaItemStateRecord,
  dispatchedAtIso: string
): void => {
  const policy =
    item.mediaType === 'sonarr_episode' ? config.policies.sonarr : config.policies.radarr;
  const nextRetryCount = item.retryCount + 1;
  const retryIntervalMs = getRetryIntervalMs(policy, item.wantedState, item.retryCount);

  database.repositories.mediaItemState.upsert({
    ...item,
    retryCount: nextRetryCount,
    lastSearchAt: dispatchedAtIso,
    nextEligibleAt: retryIntervalMs
      ? new Date(new Date(dispatchedAtIso).getTime() + retryIntervalMs).toISOString()
      : item.nextEligibleAt,
  });
};

const dispatchCandidate = async (
  clients: SearchDispatchClients,
  item: MediaItemStateRecord
) => {
  if (item.mediaType === 'sonarr_episode') {
    return clients.sonarr.searchEpisode(item.arrId);
  }

  return clients.radarr.searchMovie(item.arrId);
};

export const executeSearchDispatchRun = async (
  input: SearchDispatchRunInput
): Promise<SearchDispatchRunSummary> => {
  const runNow = input.now ?? new Date();
  const nowIso = runNow.toISOString();
  let currentAttemptTimeMs = runNow.getTime();
  const sleep =
    input.sleep ??
    ((durationMs: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, durationMs)));
  const decisions = buildDecisionSet(input.database, input.config, runNow);
  const itemMap = createItemMap(input.database);
  const attempts: SearchAttemptRecord[] = [];
  const throttleState = getThrottleState(input.database, nowIso);

  let dispatchCount = 0;
  let skipCount = 0;
  let errorCount = 0;
  let dryRunDispatchPreviewCount = 0;
  let throttleReason: ReasonCode | null = null;

  for (const decision of decisions) {
    if (decision.decision === 'skip') {
      attempts.push(
        createAttempt({
          runId: input.runId,
          mediaKey: decision.mediaKey,
          app: decision.app,
          wantedState: decision.wantedState,
          decision: decision.decision,
          reasonCode: decision.reasonCode,
          dryRun: !input.live,
          arrCommandId: null,
          attemptedAt: nowIso,
          completedAt: nowIso,
          outcome: 'skipped',
        })
      );
      skipCount += 1;
      continue;
    }

    if (!input.live) {
      attempts.push(
        createAttempt({
          runId: input.runId,
          mediaKey: decision.mediaKey,
          app: decision.app,
          wantedState: decision.wantedState,
          decision: decision.decision,
          reasonCode: decision.reasonCode,
          dryRun: true,
          arrCommandId: null,
          attemptedAt: nowIso,
          completedAt: nowIso,
          outcome: 'dry_run',
        })
      );
      dryRunDispatchPreviewCount += 1;
      continue;
    }

    if (throttleState.latestDispatchAt) {
      const elapsedSinceLastDispatchMs =
        currentAttemptTimeMs - new Date(throttleState.latestDispatchAt).getTime();
      const remainingSpacingMs =
        input.config.safety.minGlobalDispatchSpacingMs - elapsedSinceLastDispatchMs;

      if (remainingSpacingMs > 0) {
        await sleep(remainingSpacingMs);
        currentAttemptTimeMs += remainingSpacingMs;
      }
    }

    const attemptAtIso = new Date(currentAttemptTimeMs).toISOString();
    const activeThrottleReason: ReasonCode | null =
      throttleReason ?? getRollingThrottleReason(input.config, throttleState);

    if (activeThrottleReason) {
      throttleReason = activeThrottleReason;

      attempts.push(
        createAttempt({
          runId: input.runId,
          mediaKey: decision.mediaKey,
          app: decision.app,
          wantedState: decision.wantedState,
          decision: 'skip',
          reasonCode: activeThrottleReason,
          dryRun: false,
          arrCommandId: null,
          attemptedAt: attemptAtIso,
          completedAt: attemptAtIso,
          outcome: 'throttled',
        })
      );
      skipCount += 1;
      continue;
    }

    const item = itemMap.get(decision.mediaKey);
    if (!item) {
      attempts.push(
        createAttempt({
          runId: input.runId,
          mediaKey: decision.mediaKey,
          app: decision.app,
          wantedState: decision.wantedState,
          decision: 'skip',
          reasonCode: 'SKIP_IGNORED_STATE',
          dryRun: false,
          arrCommandId: null,
          attemptedAt: attemptAtIso,
          completedAt: attemptAtIso,
          outcome: 'missing_item_state',
        })
      );
      skipCount += 1;
      continue;
    }

    try {
      const command = await dispatchCandidate(input.clients, item);

      attempts.push(
        createAttempt({
          runId: input.runId,
          mediaKey: decision.mediaKey,
          app: decision.app,
          wantedState: decision.wantedState,
          decision: 'dispatch',
          reasonCode: decision.reasonCode,
          dryRun: false,
          arrCommandId: command.id,
          attemptedAt: attemptAtIso,
          completedAt: attemptAtIso,
          outcome: 'accepted',
        })
      );

      updateMediaItemAfterDispatch(input.database, input.config, item, attemptAtIso);
      updateThrottleStateAfterDispatch(throttleState, attemptAtIso);
      dispatchCount += 1;
    } catch (error) {
      attempts.push(
        createAttempt({
          runId: input.runId,
          mediaKey: decision.mediaKey,
          app: decision.app,
          wantedState: decision.wantedState,
          decision: 'dispatch',
          reasonCode: decision.reasonCode,
          dryRun: false,
          arrCommandId: null,
          attemptedAt: attemptAtIso,
          completedAt: attemptAtIso,
          outcome:
            error instanceof Error ? `failed:${error.name}:${error.message}` : 'failed',
        })
      );
      errorCount += 1;
    }

    currentAttemptTimeMs += 1;
  }

  input.database.repositories.searchAttempts.insertMany(attempts);

  return {
    candidateCount: decisions.length,
    dispatchCount,
    skipCount,
    errorCount,
    summary: {
      dryRun: !input.live,
      dryRunDispatchPreviewCount,
      throttleReason,
      attemptsPersisted: attempts.length,
    },
  };
};
