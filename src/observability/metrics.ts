import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';

import type { DependencyHealthCard } from '@/src/ui';

import type { SearchRateSnapshot } from './search-rate';

const registry = new Registry();

collectDefaultMetrics({
  register: registry,
  prefix: 'edarr_',
});

const runCounter = new Counter({
  name: 'edarr_runs_total',
  help: 'Total scheduler and manual runs completed by status.',
  labelNames: ['run_type', 'status'] as const,
  registers: [registry],
});

const runDurationHistogram = new Histogram({
  name: 'edarr_run_duration_seconds',
  help: 'Duration of scheduler and manual runs.',
  labelNames: ['run_type', 'status'] as const,
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120],
  registers: [registry],
});

const candidateDecisionCounter = new Counter({
  name: 'edarr_candidate_decisions_total',
  help: 'Candidate evaluation decisions emitted by the decision engine.',
  labelNames: ['app', 'decision', 'reason_code'] as const,
  registers: [registry],
});

const searchDispatchCounter = new Counter({
  name: 'edarr_search_dispatches_total',
  help: 'Scoped searches submitted to Sonarr or Radarr.',
  labelNames: ['app', 'outcome'] as const,
  registers: [registry],
});

const searchThrottleCounter = new Counter({
  name: 'edarr_search_throttles_total',
  help: 'Search attempts blocked by throttle policies.',
  labelNames: ['reason_code'] as const,
  registers: [registry],
});

const transmissionRemovalCounter = new Counter({
  name: 'edarr_transmission_removals_total',
  help: 'Transmission torrents removed by the guard layer.',
  labelNames: ['reason_code'] as const,
  registers: [registry],
});

const activeSuppressionsGauge = new Gauge({
  name: 'edarr_active_suppressions',
  help: 'Current number of active suppressions.',
  registers: [registry],
});

const dependencyHealthGauge = new Gauge({
  name: 'edarr_dependency_health',
  help: 'Dependency health by component and status.',
  labelNames: ['dependency', 'status'] as const,
  registers: [registry],
});

const searchRateUsedGauge = new Gauge({
  name: 'edarr_search_rate_used',
  help: 'Search dispatches used in each rolling window.',
  labelNames: ['window'] as const,
  registers: [registry],
});

const searchRateRemainingGauge = new Gauge({
  name: 'edarr_search_rate_remaining',
  help: 'Remaining search dispatches available in each rolling window.',
  labelNames: ['window'] as const,
  registers: [registry],
});

const searchRateNextEligibleGauge = new Gauge({
  name: 'edarr_search_rate_next_eligible_timestamp',
  help: 'Unix timestamp at which the next dispatch becomes eligible again.',
  registers: [registry],
});

const searchSpacingRemainingGauge = new Gauge({
  name: 'edarr_search_spacing_remaining_seconds',
  help: 'Seconds remaining before the min global dispatch spacing clears.',
  registers: [registry],
});

export const recordRunCompletion = (input: {
  runType: string;
  status: string;
  durationMs: number;
}): void => {
  runCounter.inc({
    run_type: input.runType,
    status: input.status,
  });
  runDurationHistogram.observe(
    {
      run_type: input.runType,
      status: input.status,
    },
    input.durationMs / 1_000
  );
};

export const recordCandidateDecision = (input: {
  app: string;
  decision: string;
  reasonCode: string;
}): void => {
  candidateDecisionCounter.inc({
    app: input.app,
    decision: input.decision,
    reason_code: input.reasonCode,
  });

  if (input.reasonCode.startsWith('THROTTLE_')) {
    searchThrottleCounter.inc({
      reason_code: input.reasonCode,
    });
  }
};

export const recordSearchDispatch = (input: {
  app: string;
  outcome: 'accepted' | 'failed';
}): void => {
  searchDispatchCounter.inc({
    app: input.app,
    outcome: input.outcome,
  });
};

export const recordTransmissionRemoval = (reasonCode: string): void => {
  transmissionRemovalCounter.inc({
    reason_code: reasonCode,
  });
};

export const updateDependencyHealthMetrics = (
  dependencyCards: DependencyHealthCard[]
): void => {
  for (const dependency of dependencyCards) {
    for (const status of ['healthy', 'degraded', 'unavailable'] as const) {
      dependencyHealthGauge.set(
        {
          dependency: dependency.name.toLowerCase(),
          status,
        },
        dependency.status === status ? 1 : 0
      );
    }
  }
};

export const updateSearchRateMetrics = (snapshot: SearchRateSnapshot): void => {
  for (const window of snapshot.windows) {
    searchRateUsedGauge.set({ window: window.key }, window.used);
    searchRateRemainingGauge.set({ window: window.key }, window.remaining);
  }

  searchRateNextEligibleGauge.set(
    snapshot.nextEligibleAt ? new Date(snapshot.nextEligibleAt).getTime() / 1_000 : 0
  );
  searchSpacingRemainingGauge.set(snapshot.spacing.remainingMs / 1_000);
};

export const updateActiveSuppressionsMetric = (count: number): void => {
  activeSuppressionsGauge.set(count);
};

export const getMetricsText = async (): Promise<string> => {
  return registry.metrics();
};
