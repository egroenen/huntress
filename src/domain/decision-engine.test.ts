import assert from 'node:assert/strict';
import test from 'node:test';

import type { ResolvedConfig } from '@/src/config';
import type { MediaItemStateRecord } from '@/src/db';

import { evaluateCandidateDecisions, getRetryIntervalMs } from './decision-engine';

const policy: ResolvedConfig['policies']['sonarr'] = {
  maxSearchesPerCycle: 4,
  missingRetryIntervalsMs: [12, 24, 72].map((hours) => hours * 3_600_000),
  cutoffRetryIntervalsMs: [48, 168, 336].map((hours) => hours * 3_600_000),
  recentReleaseWindowDays: 30,
  excludeUnreleased: true,
  excludeUnmonitored: true,
};

const createItem = (
  overrides: Partial<MediaItemStateRecord> = {}
): MediaItemStateRecord => {
  return {
    mediaKey: 'sonarr:episode:1',
    mediaType: 'sonarr_episode',
    arrId: 1,
    parentArrId: 10,
    externalPath: 'series/example-show',
    title: 'Example Item',
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
    lastSeenAt: '2026-04-04T00:00:00.000Z',
    stateHash: 'state-hash',
    ...overrides,
  };
};

const createInput = (items: MediaItemStateRecord[]) => {
  return {
    app: 'sonarr' as const,
    items,
    policy,
    now: new Date('2026-04-04T12:00:00.000Z'),
    panicDisableSearch: false,
    globalSearchBlocked: false,
    appAvailable: true,
    appDispatchLimit: 10,
    globalDispatchLimit: 10,
  };
};

test('evaluateCandidateDecisions returns reason-coded skip results for hard filters', () => {
  const cases = [
    {
      name: 'unmonitored',
      item: createItem({ monitored: false }),
      expected: 'SKIP_UNMONITORED',
    },
    {
      name: 'unreleased',
      item: createItem({ releaseDate: '2026-05-01T00:00:00.000Z' }),
      expected: 'SKIP_UNRELEASED',
    },
    {
      name: 'ignored',
      item: createItem({ wantedState: 'ignored' }),
      expected: 'SKIP_IGNORED_STATE',
    },
    {
      name: 'in queue',
      item: createItem({ inQueue: true }),
      expected: 'SKIP_IN_QUEUE',
    },
    {
      name: 'suppressed',
      item: createItem({ suppressedUntil: '2026-04-05T00:00:00.000Z' }),
      expected: 'SKIP_ITEM_SUPPRESSED',
    },
    {
      name: 'cooldown active',
      item: createItem({ nextEligibleAt: '2026-04-06T00:00:00.000Z' }),
      expected: 'SKIP_COOLDOWN_ACTIVE',
    },
  ] as const;

  for (const testCase of cases) {
    const [decision] = evaluateCandidateDecisions(createInput([testCase.item]));

    assert.equal(decision?.decision, 'skip', testCase.name);
    assert.equal(decision?.reasonCode, testCase.expected, testCase.name);
  }
});

test('evaluateCandidateDecisions respects panic, dependency, and global block states', () => {
  const item = createItem();

  const panicDecision = evaluateCandidateDecisions({
    ...createInput([item]),
    panicDisableSearch: true,
  })[0];
  const blockedDecision = evaluateCandidateDecisions({
    ...createInput([item]),
    globalSearchBlocked: true,
  })[0];
  const unavailableDecision = evaluateCandidateDecisions({
    ...createInput([item]),
    appAvailable: false,
  })[0];

  assert.equal(panicDecision?.reasonCode, 'SKIP_GLOBAL_PANIC_DISABLE');
  assert.equal(blockedDecision?.reasonCode, 'SKIP_GLOBAL_SEARCH_BLOCKED');
  assert.equal(unavailableDecision?.reasonCode, 'SKIP_APP_UNAVAILABLE');
});

test('evaluateCandidateDecisions assigns buckets and sorts deterministically', () => {
  const decisions = evaluateCandidateDecisions(
    createInput([
      createItem({
        mediaKey: 'radarr:movie:5',
        mediaType: 'radarr_movie',
        arrId: 5,
        parentArrId: null,
        title: 'Backlog Missing',
        releaseDate: '2025-12-01T00:00:00.000Z',
        wantedState: 'missing',
      }),
      createItem({
        mediaKey: 'radarr:movie:2',
        mediaType: 'radarr_movie',
        arrId: 2,
        parentArrId: null,
        title: 'Recent Cutoff',
        releaseDate: '2026-04-01T00:00:00.000Z',
        wantedState: 'cutoff_unmet',
      }),
      createItem({
        mediaKey: 'radarr:movie:1',
        mediaType: 'radarr_movie',
        arrId: 1,
        parentArrId: null,
        title: 'Recent Missing Older Search',
        releaseDate: '2026-03-28T00:00:00.000Z',
        wantedState: 'missing',
        lastSearchAt: '2026-03-20T00:00:00.000Z',
      }),
      createItem({
        mediaKey: 'radarr:movie:3',
        mediaType: 'radarr_movie',
        arrId: 3,
        parentArrId: null,
        title: 'Recent Missing Newer Search',
        releaseDate: '2026-03-28T00:00:00.000Z',
        wantedState: 'missing',
        lastSearchAt: '2026-04-01T00:00:00.000Z',
      }),
    ])
  );

  assert.deepEqual(
    decisions.map((decision) => [decision.mediaKey, decision.reasonCode]),
    [
      ['radarr:movie:1', 'ELIGIBLE_MISSING_RECENT'],
      ['radarr:movie:3', 'ELIGIBLE_MISSING_RECENT'],
      ['radarr:movie:5', 'ELIGIBLE_MISSING_BACKLOG'],
      ['radarr:movie:2', 'ELIGIBLE_CUTOFF_RECENT'],
    ]
  );
});

test('evaluateCandidateDecisions applies app and global budgets after sorting', () => {
  const decisions = evaluateCandidateDecisions({
    ...createInput([
      createItem({ mediaKey: 'radarr:movie:1' }),
      createItem({ mediaKey: 'radarr:movie:2' }),
      createItem({ mediaKey: 'radarr:movie:3' }),
    ]),
    appDispatchLimit: 2,
    globalDispatchLimit: 1,
  });

  assert.deepEqual(
    decisions.map((decision) => [
      decision.mediaKey,
      decision.decision,
      decision.reasonCode,
    ]),
    [
      ['radarr:movie:1', 'dispatch', 'ELIGIBLE_MISSING_RECENT'],
      ['radarr:movie:2', 'skip', 'SKIP_GLOBAL_BUDGET_EXHAUSTED'],
      ['radarr:movie:3', 'skip', 'SKIP_GLOBAL_BUDGET_EXHAUSTED'],
    ]
  );
});

test('getRetryIntervalMs uses the appropriate ladder and clamps to the final interval', () => {
  assert.equal(getRetryIntervalMs(policy, 'missing', 0), 12 * 3_600_000);
  assert.equal(getRetryIntervalMs(policy, 'missing', 5), 72 * 3_600_000);
  assert.equal(getRetryIntervalMs(policy, 'cutoff_unmet', 1), 168 * 3_600_000);
  assert.equal(getRetryIntervalMs(policy, 'ignored', 1), null);
});
