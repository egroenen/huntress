import { loadConfig } from '@/src/config';
import {
  executeSearchDispatchRun,
  runTransmissionGuard,
  syncArrState,
} from '@/src/domain';
import { getDatabaseContext } from '@/src/db/runtime';
import {
  createProwlarrClient,
  createRadarrClient,
  createSonarrClient,
  createTransmissionClient,
} from '@/src/integrations';
import { configureLogger, logger } from '@/src/observability';
import { createSchedulerCoordinator, type CoordinatedRunType } from '@/src/scheduler';

export interface RuntimeContext {
  config: Awaited<ReturnType<typeof loadConfig>>['config'];
  database: Awaited<ReturnType<typeof getDatabaseContext>>;
  clients: {
    sonarr: ReturnType<typeof createSonarrClient>;
    radarr: ReturnType<typeof createRadarrClient>;
    prowlarr: ReturnType<typeof createProwlarrClient>;
    transmission: ReturnType<typeof createTransmissionClient>;
  };
  scheduler: ReturnType<typeof createSchedulerCoordinator>;
}

declare global {
  var __edarrRuntimeContext: Promise<RuntimeContext> | undefined;
}

const buildRuntimeContext = async (): Promise<RuntimeContext> => {
  const [{ config }, database] = await Promise.all([loadConfig(), getDatabaseContext()]);
  configureLogger(config.logging.level);

  const clients = {
    sonarr: createSonarrClient({
      baseUrl: config.instances.sonarr.url,
      apiKey: config.instances.sonarr.apiKey,
    }),
    radarr: createRadarrClient({
      baseUrl: config.instances.radarr.url,
      apiKey: config.instances.radarr.apiKey,
    }),
    prowlarr: createProwlarrClient({
      baseUrl: config.instances.prowlarr.url,
      apiKey: config.instances.prowlarr.apiKey,
    }),
    transmission: createTransmissionClient({
      baseUrl: config.instances.transmission.url,
      username: config.instances.transmission.username,
      password: config.instances.transmission.password,
    }),
  };

  const scheduler = createSchedulerCoordinator({
    database,
    cadenceMs: config.scheduler.cycleEveryMs,
    startupGracePeriodMs: config.scheduler.startupGracePeriodMs,
    lockTtlMs: Math.max(config.scheduler.cycleEveryMs, 15 * 60_000),
    async executeRun(context) {
      const syncSummary = await syncArrState({
        database,
        clients: {
          sonarr: clients.sonarr,
          radarr: clients.radarr,
        },
      });

      const transmissionSummary = await runTransmissionGuard({
        database,
        config,
        client: clients.transmission,
      });

      if (context.runType === 'sync_only') {
        return {
          status: 'success',
          summary: {
            syncSummary,
            transmissionSummary,
          },
        };
      }

      const dispatchSummary = await executeSearchDispatchRun({
        database,
        config,
        clients: {
          sonarr: clients.sonarr,
          radarr: clients.radarr,
        },
        runId: context.runId,
        live: context.liveDispatchAllowed,
      });

      return {
        status: dispatchSummary.errorCount > 0 ? 'partial' : 'success',
        candidateCount: dispatchSummary.candidateCount,
        dispatchCount: dispatchSummary.dispatchCount,
        skipCount: dispatchSummary.skipCount,
        errorCount: dispatchSummary.errorCount,
        summary: {
          syncSummary,
          transmissionSummary,
          dispatchSummary: dispatchSummary.summary,
          requestedRunType: context.runType,
          liveDispatchAllowed: context.liveDispatchAllowed,
        },
      };
    },
  });

  scheduler.start();
  logger.info({
    event: 'startup_complete',
    mode: config.mode,
    configPath: config.meta.configPath,
    sqlitePath: config.storage.sqlitePath,
    cycleEveryMs: config.scheduler.cycleEveryMs,
  });

  return {
    config,
    database,
    clients,
    scheduler,
  };
};

export const getRuntimeContext = async (): Promise<RuntimeContext> => {
  if (!globalThis.__edarrRuntimeContext) {
    globalThis.__edarrRuntimeContext = buildRuntimeContext();
  }

  return globalThis.__edarrRuntimeContext;
};

export const runManualCycle = async (
  runType: Exclude<CoordinatedRunType, 'scheduled'>
) => {
  const runtime = await getRuntimeContext();
  return runtime.scheduler.runManual(runType);
};
