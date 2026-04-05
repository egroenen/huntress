import 'server-only';

import type { RedactedResolvedConfig } from '@/src/config';
import {
  getSearchCandidatePreview,
  planReleaseSelection,
  type CandidateDecision,
  type PlannedReleaseSelection,
} from '@/src/domain';
import type { ProwlarrHealthRecord } from '@/src/integrations';
import { logger } from '@/src/observability';
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
    const failingIndexerCount = prowlarrIndexerStatus.value.filter(
      (record) => record.enabled && record.status && record.status.toLowerCase() !== 'ok'
    ).length;
    const failingSummary =
      failingIndexerCount === 1
        ? '1 indexer health issue reported.'
        : `${failingIndexerCount} indexer health issues reported.`;
    const failingDetail =
      prowlarrIndexerStatus.value
        .filter((record) => record.enabled && record.status && record.status.toLowerCase() !== 'ok')
        .map((record) => record.failureMessage ?? record.name)
        .find(Boolean) ?? null;

    dependencyCards.push({
      name: 'Prowlarr',
      status:
        healthSummary.status === 'healthy' && failingIndexerCount === 0
          ? 'healthy'
          : failingIndexerCount > 0
            ? 'degraded'
            : healthSummary.status,
      summary:
        failingIndexerCount > 0
          ? failingSummary
          : healthSummary.status === 'healthy'
            ? 'No active Prowlarr health issues reported.'
          : healthSummary.summary,
      detail:
        failingIndexerCount > 0
          ? failingDetail
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

export interface CandidateReleasePreview {
  available: boolean;
  mode: PlannedReleaseSelection['mode'];
  reason: string;
  selectedReleaseTitle: string | null;
  selectedReleaseQuality: string | null;
  selectedReleaseResolution: number | null;
  selectedReleaseIndexer: string | null;
  upgradePriority: boolean;
}

export const getCandidateReleasePreviewMap = async (
  runtime: RuntimeContext,
  candidates: CandidateDecision[]
): Promise<Map<string, CandidateReleasePreview>> => {
  const dispatchCandidates = candidates.filter(
    (candidate) => candidate.decision === 'dispatch'
  );

  const previews: Array<readonly [string, CandidateReleasePreview] | null> =
    await Promise.all(
      dispatchCandidates.map(async (candidate) => {
      const item = runtime.database.repositories.mediaItemState.getByMediaKey(
        candidate.mediaKey
      );

      if (!item) {
        return null;
      }

      try {
        const preview = await planReleaseSelection({
          database: runtime.database,
          config: runtime.config,
          clients: {
            sonarr: runtime.clients.sonarr,
            radarr: runtime.clients.radarr,
          },
          item,
          app: candidate.app,
          now: new Date(),
        });

        return [
          candidate.mediaKey,
          {
            available: true,
            mode: preview.mode,
            reason: preview.reason,
            selectedReleaseTitle: preview.selectedRelease?.title ?? null,
            selectedReleaseQuality: preview.selectedRelease?.qualityName ?? null,
            selectedReleaseResolution:
              preview.selectedRelease?.qualityResolution ?? null,
            selectedReleaseIndexer: preview.selectedRelease?.indexer ?? null,
            upgradePriority: preview.upgradePriority,
          } satisfies CandidateReleasePreview,
        ] as const;
      } catch (error) {
        logger.warn({
          event: 'release_preview_unavailable',
          app: candidate.app,
          mediaKey: candidate.mediaKey,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        return [
          candidate.mediaKey,
          {
            available: false,
            mode: 'blind_search',
            reason:
              error instanceof Error
                ? `Release preview unavailable: ${error.message}`
                : 'Release preview unavailable due to an unexpected error.',
            selectedReleaseTitle: null,
            selectedReleaseQuality: null,
            selectedReleaseResolution: null,
            selectedReleaseIndexer: null,
            upgradePriority: false,
          } satisfies CandidateReleasePreview,
        ] as const;
      }
      })
    );

  return new Map(
    previews.filter(
      (entry): entry is readonly [string, CandidateReleasePreview] => entry !== null
    )
  );
};

export const getRedactedConfig = async (): Promise<RedactedResolvedConfig> => {
  const runtime = await getRuntimeContext();
  return runtime.redactedConfig;
};
