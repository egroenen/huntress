import type { RuntimeContext } from '@/src/server/runtime';
import type { DependencyHealthCard } from '@/src/ui';

import { getSearchRateSnapshot, type SearchRateSnapshot } from './search-rate';

export interface ReadinessSnapshot {
  ok: boolean;
  checkedAt: string;
  dependencies: DependencyHealthCard[];
  searchRate: SearchRateSnapshot;
  lastRun: {
    id: string | null;
    status: string | null;
    startedAt: string | null;
    finishedAt: string | null;
  };
}

export const getReadinessSnapshot = async (input: {
  runtime: RuntimeContext;
  dependencyCards: DependencyHealthCard[];
}): Promise<ReadinessSnapshot> => {
  const checkedAt = new Date().toISOString();
  const searchRate = getSearchRateSnapshot(input.runtime.database, input.runtime.config);
  const lastRun = input.runtime.database.repositories.runHistory.getLatest();
  const connectionStatus = input.runtime.connectionStatus ?? {
    sonarr: { configured: true },
    radarr: { configured: true },
    prowlarr: { configured: true },
    transmission: { configured: true },
  };
  const unavailableDependencies = input.dependencyCards.filter(
    (dependency) => dependency.status === 'unavailable'
  );
  const blockingDependencyNames = new Set(['Sonarr', 'Radarr', 'Transmission']);
  const hasBlockingDependencyOutage = unavailableDependencies.some((dependency) =>
    blockingDependencyNames.has(dependency.name)
  );
  const hasBlockingDependencyConfigurationGap =
    !connectionStatus.sonarr.configured ||
    !connectionStatus.radarr.configured ||
    !connectionStatus.transmission.configured;
  const hasBlockingProwlarrOutage =
    input.runtime.config.safety.stopOnProwlarrOutage &&
    (unavailableDependencies.some((dependency) => dependency.name === 'Prowlarr') ||
      !connectionStatus.prowlarr.configured);

  return {
    ok:
      !hasBlockingDependencyOutage &&
      !hasBlockingDependencyConfigurationGap &&
      !hasBlockingProwlarrOutage,
    checkedAt,
    dependencies: input.dependencyCards,
    searchRate,
    lastRun: {
      id: lastRun?.id ?? null,
      status: lastRun?.status ?? null,
      startedAt: lastRun?.startedAt ?? null,
      finishedAt: lastRun?.finishedAt ?? null,
    },
  };
};
