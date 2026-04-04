import 'server-only';

import type { RedactedResolvedConfig } from '@/src/config';
import { getSearchCandidatePreview, type CandidateDecision } from '@/src/domain';
import type { ProwlarrHealthRecord } from '@/src/integrations';
import { getRuntimeContext, type RuntimeContext } from '@/src/server/runtime';
import type { DependencyHealthCard } from '@/src/ui';

const summarizeProwlarrHealth = (
  healthRecords: ProwlarrHealthRecord[]
): Pick<DependencyHealthCard, 'status' | 'summary' | 'detail'> => {
  if (healthRecords.length === 0) {
    return {
      status: 'healthy',
      summary: 'No active health warnings reported.',
      detail: null,
    };
  }

  const degradedRecord =
    healthRecords.find((record) => record.level?.toLowerCase() === 'warning') ?? null;
  const blockingRecord =
    healthRecords.find((record) => record.level?.toLowerCase() === 'error') ?? null;
  const primaryRecord = blockingRecord ?? degradedRecord ?? healthRecords[0] ?? null;

  return {
    status: blockingRecord ? 'unavailable' : 'degraded',
    summary: primaryRecord?.message ?? 'Prowlarr reported a health issue.',
    detail: primaryRecord
      ? [primaryRecord.level, primaryRecord.source].filter(Boolean).join(' / ') || null
      : null,
  };
};

const buildUnavailableCard = (name: string, error: unknown): DependencyHealthCard => {
  return {
    name,
    status: 'unavailable',
    summary: 'Dependency probe failed.',
    detail: error instanceof Error ? error.message : 'Unknown error',
  };
};

export const probeDependencyHealth = async (
  runtime: RuntimeContext
): Promise<DependencyHealthCard[]> => {
  const connectionStatus = runtime.connectionStatus;

  if (
    !runtime.clients.sonarr &&
    !runtime.clients.radarr &&
    !runtime.clients.prowlarr &&
    !runtime.clients.transmission
  ) {
    return [
      {
        name: 'Sonarr',
        status: 'degraded',
        summary: 'Not configured yet.',
        detail: connectionStatus.sonarr.summary,
      },
      {
        name: 'Radarr',
        status: 'degraded',
        summary: 'Not configured yet.',
        detail: connectionStatus.radarr.summary,
      },
      {
        name: 'Prowlarr',
        status: 'degraded',
        summary: 'Not configured yet.',
        detail: connectionStatus.prowlarr.summary,
      },
      {
        name: 'Transmission',
        status: 'degraded',
        summary: 'Not configured yet.',
        detail: connectionStatus.transmission.summary,
      },
    ];
  }

  const [sonarr, radarr, prowlarrHealth, prowlarrIndexerStatus, transmission] =
    await Promise.allSettled([
      runtime.clients.sonarr?.probeSystemStatus(),
      runtime.clients.radarr?.probeSystemStatus(),
      runtime.clients.prowlarr?.getHealth(),
      runtime.clients.prowlarr?.getIndexerStatus(),
      runtime.clients.transmission?.probeSession(),
    ]);

  const dependencyCards: DependencyHealthCard[] = [];

  dependencyCards.push(
    runtime.clients.sonarr === null
      ? {
          name: 'Sonarr',
          status: 'degraded',
          summary: 'Not configured yet.',
          detail: connectionStatus.sonarr.summary,
        }
      : sonarr.status === 'fulfilled' && sonarr.value
        ? {
            name: 'Sonarr',
            status: 'healthy',
            summary: sonarr.value.version
              ? `Connected to Sonarr ${sonarr.value.version}.`
              : 'Connected successfully.',
            detail: sonarr.value.appName ?? null,
          }
        : buildUnavailableCard(
            'Sonarr',
            sonarr.status === 'rejected'
              ? sonarr.reason
              : new Error('Sonarr probe returned no result')
          )
  );

  dependencyCards.push(
    runtime.clients.radarr === null
      ? {
          name: 'Radarr',
          status: 'degraded',
          summary: 'Not configured yet.',
          detail: connectionStatus.radarr.summary,
        }
      : radarr.status === 'fulfilled' && radarr.value
        ? {
            name: 'Radarr',
            status: 'healthy',
            summary: radarr.value.version
              ? `Connected to Radarr ${radarr.value.version}.`
              : 'Connected successfully.',
            detail: radarr.value.appName ?? null,
          }
        : buildUnavailableCard(
            'Radarr',
            radarr.status === 'rejected'
              ? radarr.reason
              : new Error('Radarr probe returned no result')
          )
  );

  if (runtime.clients.prowlarr === null) {
    dependencyCards.push({
      name: 'Prowlarr',
      status: 'degraded',
      summary: 'Not configured yet.',
      detail: connectionStatus.prowlarr.summary,
    });
  } else if (
    prowlarrHealth.status === 'fulfilled' &&
    prowlarrHealth.value &&
    prowlarrIndexerStatus.status === 'fulfilled' &&
    prowlarrIndexerStatus.value
  ) {
    const healthSummary = summarizeProwlarrHealth(prowlarrHealth.value);
    const enabledIndexerCount = prowlarrIndexerStatus.value.filter(
      (record) => record.enabled
    ).length;
    const failingIndexerCount = prowlarrIndexerStatus.value.filter(
      (record) => record.enabled && record.status && record.status.toLowerCase() !== 'ok'
    ).length;

    dependencyCards.push({
      name: 'Prowlarr',
      status:
        healthSummary.status === 'healthy' && failingIndexerCount === 0
          ? 'healthy'
          : failingIndexerCount > 0
            ? 'degraded'
            : healthSummary.status,
      summary:
        healthSummary.status === 'healthy'
          ? `${enabledIndexerCount} enabled indexers reporting healthy.`
          : healthSummary.summary,
      detail:
        failingIndexerCount > 0
          ? `${failingIndexerCount} enabled indexers are not healthy.`
          : (healthSummary.detail ?? null),
    });
  } else {
    dependencyCards.push(
      buildUnavailableCard(
        'Prowlarr',
        prowlarrHealth.status === 'rejected'
          ? prowlarrHealth.reason
          : prowlarrIndexerStatus.status === 'rejected'
            ? prowlarrIndexerStatus.reason
            : new Error('Unknown Prowlarr failure')
      )
    );
  }

  dependencyCards.push(
    runtime.clients.transmission === null
      ? {
          name: 'Transmission',
          status: 'degraded',
          summary: 'Not configured yet.',
          detail: connectionStatus.transmission.summary,
        }
      : transmission.status === 'fulfilled' && transmission.value
        ? {
            name: 'Transmission',
            status: 'healthy',
            summary: transmission.value.version
              ? `Transmission ${transmission.value.version} reachable.`
              : 'Transmission RPC reachable.',
            detail:
              transmission.value.rpcVersion !== null
                ? `RPC v${transmission.value.rpcVersion}`
                : null,
          }
        : buildUnavailableCard(
            'Transmission',
            transmission.status === 'rejected'
              ? transmission.reason
              : new Error('Transmission probe returned no result')
          )
  );

  return dependencyCards;
};

export const getDashboardCandidateSnapshot = (
  runtime: RuntimeContext
): {
  all: CandidateDecision[];
  sonarr: CandidateDecision[];
  radarr: CandidateDecision[];
} => {
  const all = getSearchCandidatePreview({
    database: runtime.database,
    config: runtime.config,
    clients: {
      sonarr: runtime.clients.sonarr,
      radarr: runtime.clients.radarr,
    },
  });

  return {
    all,
    sonarr: all.filter((decision) => decision.app === 'sonarr'),
    radarr: all.filter((decision) => decision.app === 'radarr'),
  };
};

export const getRedactedConfig = async (): Promise<RedactedResolvedConfig> => {
  const runtime = await getRuntimeContext();
  return runtime.redactedConfig;
};
