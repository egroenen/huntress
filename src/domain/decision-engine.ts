import type { ResolvedConfig } from '@/src/config';
import type { MediaItemStateRecord } from '@/src/db';

export type DecisionApp = 'sonarr' | 'radarr';
export type SearchDecision = 'dispatch' | 'skip';
export type PriorityBucket =
  | 'missing_recent'
  | 'missing_backlog'
  | 'cutoff_recent'
  | 'cutoff_backlog';

export type ReasonCode =
  | 'MANUAL_OVERRIDE_FETCH'
  | 'ELIGIBLE_MISSING_RECENT'
  | 'ELIGIBLE_MISSING_BACKLOG'
  | 'ELIGIBLE_CUTOFF_RECENT'
  | 'ELIGIBLE_CUTOFF_BACKLOG'
  | 'SKIP_UNMONITORED'
  | 'SKIP_UNRELEASED'
  | 'SKIP_IGNORED_STATE'
  | 'SKIP_IN_QUEUE'
  | 'SKIP_ITEM_SUPPRESSED'
  | 'SKIP_COOLDOWN_ACTIVE'
  | 'SKIP_GLOBAL_PANIC_DISABLE'
  | 'SKIP_GLOBAL_SEARCH_BLOCKED'
  | 'SKIP_APP_UNAVAILABLE'
  | 'SKIP_GLOBAL_BUDGET_EXHAUSTED'
  | 'SKIP_APP_BUDGET_EXHAUSTED'
  | 'THROTTLE_GLOBAL_DISPATCH_SPACING'
  | 'THROTTLE_GLOBAL_15M_BUDGET'
  | 'THROTTLE_GLOBAL_1H_BUDGET'
  | 'THROTTLE_GLOBAL_24H_BUDGET';

type DispatchReasonCode = Extract<
  ReasonCode,
  | 'ELIGIBLE_MISSING_RECENT'
  | 'ELIGIBLE_MISSING_BACKLOG'
  | 'ELIGIBLE_CUTOFF_RECENT'
  | 'ELIGIBLE_CUTOFF_BACKLOG'
>;

type SkipReasonCode = Exclude<ReasonCode, DispatchReasonCode>;

export interface CandidateDecision {
  mediaKey: string;
  app: DecisionApp;
  title: string;
  wantedState: MediaItemStateRecord['wantedState'];
  decision: SearchDecision;
  reasonCode: ReasonCode;
  priorityBucket: PriorityBucket | null;
  retryCount: number;
  nextEligibleAt: string | null;
  sortKey: string | null;
}

export interface EvaluateCandidateInput {
  app: DecisionApp;
  items: MediaItemStateRecord[];
  policy: ResolvedConfig['policies']['sonarr'];
  now: Date;
  panicDisableSearch: boolean;
  globalSearchBlocked: boolean;
  appAvailable: boolean;
  appDispatchLimit: number;
  globalDispatchLimit: number;
}

interface EligibleCandidate {
  item: MediaItemStateRecord;
  bucket: PriorityBucket;
  reasonCode: DispatchReasonCode;
  sortKey: string;
}

const BUCKET_ORDER: Record<PriorityBucket, number> = {
  missing_recent: 0,
  missing_backlog: 1,
  cutoff_recent: 2,
  cutoff_backlog: 3,
};

const isFutureDate = (value: string | null, now: Date): boolean => {
  if (!value) {
    return false;
  }

  const parsedDate = new Date(value);
  return Number.isFinite(parsedDate.getTime()) && parsedDate.getTime() > now.getTime();
};

const isRecentRelease = (
  value: string | null,
  now: Date,
  recentWindowDays: number
): boolean => {
  if (!value) {
    return false;
  }

  const parsedDate = new Date(value);
  if (!Number.isFinite(parsedDate.getTime())) {
    return false;
  }

  const ageMs = now.getTime() - parsedDate.getTime();
  return ageMs >= 0 && ageMs <= recentWindowDays * 86_400_000;
};

const getPriorityBucket = (
  item: MediaItemStateRecord,
  now: Date,
  recentWindowDays: number
): PriorityBucket | null => {
  const recent = isRecentRelease(item.releaseDate, now, recentWindowDays);

  if (item.wantedState === 'missing') {
    return recent ? 'missing_recent' : 'missing_backlog';
  }

  if (item.wantedState === 'cutoff_unmet') {
    return recent ? 'cutoff_recent' : 'cutoff_backlog';
  }

  return null;
};

const getDispatchReasonCode = (bucket: PriorityBucket): DispatchReasonCode => {
  switch (bucket) {
    case 'missing_recent':
      return 'ELIGIBLE_MISSING_RECENT';
    case 'missing_backlog':
      return 'ELIGIBLE_MISSING_BACKLOG';
    case 'cutoff_recent':
      return 'ELIGIBLE_CUTOFF_RECENT';
    case 'cutoff_backlog':
      return 'ELIGIBLE_CUTOFF_BACKLOG';
  }
};

const getDateSortValue = (value: string | null, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsedDate = new Date(value);
  return Number.isFinite(parsedDate.getTime()) ? parsedDate.getTime() : fallback;
};

const buildSortKey = (item: MediaItemStateRecord, bucket: PriorityBucket): string => {
  const nextEligibleSort = getDateSortValue(item.nextEligibleAt, 0);
  const releaseDateSort = getDateSortValue(item.releaseDate, 0);
  const lastSearchSort = getDateSortValue(item.lastSearchAt, 0);

  return [
    BUCKET_ORDER[bucket].toString().padStart(2, '0'),
    nextEligibleSort.toString().padStart(16, '0'),
    (Number.MAX_SAFE_INTEGER - releaseDateSort).toString().padStart(16, '0'),
    lastSearchSort.toString().padStart(16, '0'),
    item.mediaKey,
  ].join(':');
};

const evaluateHardSkip = (
  item: MediaItemStateRecord,
  input: EvaluateCandidateInput
): SkipReasonCode | null => {
  if (!input.appAvailable) {
    return 'SKIP_APP_UNAVAILABLE';
  }

  if (input.panicDisableSearch) {
    return 'SKIP_GLOBAL_PANIC_DISABLE';
  }

  if (input.globalSearchBlocked) {
    return 'SKIP_GLOBAL_SEARCH_BLOCKED';
  }

  if (item.wantedState === 'ignored') {
    return 'SKIP_IGNORED_STATE';
  }

  if (input.policy.excludeUnmonitored && !item.monitored) {
    return 'SKIP_UNMONITORED';
  }

  if (input.policy.excludeUnreleased && isFutureDate(item.releaseDate, input.now)) {
    return 'SKIP_UNRELEASED';
  }

  if (item.inQueue) {
    return 'SKIP_IN_QUEUE';
  }

  if (
    item.suppressedUntil &&
    new Date(item.suppressedUntil).getTime() > input.now.getTime()
  ) {
    return 'SKIP_ITEM_SUPPRESSED';
  }

  if (
    item.nextEligibleAt &&
    new Date(item.nextEligibleAt).getTime() > input.now.getTime()
  ) {
    return 'SKIP_COOLDOWN_ACTIVE';
  }

  return null;
};

const toSkipDecision = (
  app: DecisionApp,
  item: MediaItemStateRecord,
  reasonCode: SkipReasonCode,
  options?: {
    priorityBucket?: PriorityBucket | null;
    sortKey?: string | null;
  }
): CandidateDecision => {
  return {
    mediaKey: item.mediaKey,
    app,
    title: item.title,
    wantedState: item.wantedState,
    decision: 'skip',
    reasonCode,
    priorityBucket: options?.priorityBucket ?? null,
    retryCount: item.retryCount,
    nextEligibleAt: item.nextEligibleAt,
    sortKey: options?.sortKey ?? null,
  };
};

const toDispatchDecision = (
  app: DecisionApp,
  candidate: EligibleCandidate
): CandidateDecision => {
  return {
    mediaKey: candidate.item.mediaKey,
    app,
    title: candidate.item.title,
    wantedState: candidate.item.wantedState,
    decision: 'dispatch',
    reasonCode: candidate.reasonCode,
    priorityBucket: candidate.bucket,
    retryCount: candidate.item.retryCount,
    nextEligibleAt: candidate.item.nextEligibleAt,
    sortKey: candidate.sortKey,
  };
};

export const getRetryIntervalMs = (
  policy: ResolvedConfig['policies']['sonarr'],
  wantedState: MediaItemStateRecord['wantedState'],
  retryCount: number
): number | null => {
  const ladder =
    wantedState === 'cutoff_unmet'
      ? policy.cutoffRetryIntervalsMs
      : wantedState === 'missing'
        ? policy.missingRetryIntervalsMs
        : null;

  if (!ladder) {
    return null;
  }

  const safeIndex = Math.min(Math.max(retryCount, 0), ladder.length - 1);
  return ladder[safeIndex] ?? null;
};

export const evaluateCandidateDecisions = (
  input: EvaluateCandidateInput
): CandidateDecision[] => {
  const skippedDecisions: CandidateDecision[] = [];
  const eligibleCandidates: EligibleCandidate[] = [];

  for (const item of input.items) {
    const hardSkipReason = evaluateHardSkip(item, input);

    if (hardSkipReason) {
      skippedDecisions.push(toSkipDecision(input.app, item, hardSkipReason));
      continue;
    }

    const bucket = getPriorityBucket(
      item,
      input.now,
      input.policy.recentReleaseWindowDays
    );

    if (!bucket) {
      skippedDecisions.push(toSkipDecision(input.app, item, 'SKIP_IGNORED_STATE'));
      continue;
    }

    eligibleCandidates.push({
      item,
      bucket,
      reasonCode: getDispatchReasonCode(bucket),
      sortKey: buildSortKey(item, bucket),
    });
  }

  eligibleCandidates.sort((left, right) => left.sortKey.localeCompare(right.sortKey));

  let remainingGlobalDispatches = input.globalDispatchLimit;
  let remainingAppDispatches = input.appDispatchLimit;
  const decisions: CandidateDecision[] = [];

  for (const candidate of eligibleCandidates) {
    if (remainingAppDispatches <= 0) {
      decisions.push(
        toSkipDecision(input.app, candidate.item, 'SKIP_APP_BUDGET_EXHAUSTED', {
          priorityBucket: candidate.bucket,
          sortKey: candidate.sortKey,
        })
      );
      continue;
    }

    if (remainingGlobalDispatches <= 0) {
      decisions.push(
        toSkipDecision(input.app, candidate.item, 'SKIP_GLOBAL_BUDGET_EXHAUSTED', {
          priorityBucket: candidate.bucket,
          sortKey: candidate.sortKey,
        })
      );
      continue;
    }

    decisions.push(toDispatchDecision(input.app, candidate));
    remainingAppDispatches -= 1;
    remainingGlobalDispatches -= 1;
  }

  return [...decisions, ...skippedDecisions].sort((left, right) => {
    if (left.decision !== right.decision) {
      return left.decision === 'dispatch' ? -1 : 1;
    }

    return (left.sortKey ?? left.mediaKey).localeCompare(right.sortKey ?? right.mediaKey);
  });
};
