import { randomUUID } from 'node:crypto';

import { loadConfig } from '@/src/config';
import {
  executeManualFetch,
  executeSearchDispatchRun,
  runTransmissionGuard,
  syncArrState,
} from '@/src/domain';
import { createRepositories } from '@/src/db';
import { getDatabaseContext } from '@/src/db/runtime';
import {
  createProwlarrClient,
  createRadarrClient,
  createSonarrClient,
  createTransmissionClient,
} from '@/src/integrations';
import {
  configureLogger,
  logger,
  type ActivityTracker,
} from '@/src/observability';
import { createSchedulerCoordinator, type CoordinatedRunType } from '@/src/scheduler';
import {
  resolveRuntimeConfig,
  type ConfigurableServiceName,
  type RuntimeConnectionStatus,
} from '@/src/server/runtime-config';

export interface RuntimeContext {
  config: Awaited<ReturnType<typeof loadConfig>>['config'] & {
    auth: Awaited<ReturnType<typeof loadConfig>>['config']['auth'] & {
      sessionSecret: string;
    };
  };
  redactedConfig: Awaited<ReturnType<typeof loadConfig>>['redactedConfig'];
  database: Awaited<ReturnType<typeof getDatabaseContext>>;
  clients: {
    sonarr: ReturnType<typeof createSonarrClient> | null;
    radarr: ReturnType<typeof createRadarrClient> | null;
    prowlarr: ReturnType<typeof createProwlarrClient> | null;
    transmission: ReturnType<typeof createTransmissionClient> | null;
  };
  connectionStatus: Record<ConfigurableServiceName, RuntimeConnectionStatus>;
  sessionSecretSource: 'env' | 'persisted' | 'generated';
  scheduler: ReturnType<typeof createSchedulerCoordinator>;
}

declare global {
  var __edarrRuntimeCore:
    | Promise<{
        loadedConfig: Awaited<ReturnType<typeof loadConfig>>;
        database: Awaited<ReturnType<typeof getDatabaseContext>>;
        scheduler: ReturnType<typeof createSchedulerCoordinator>;
      }>
    | undefined;
}

const createClients = (
  config: RuntimeContext['config'],
  activityTracker?: ActivityTracker
): RuntimeContext['clients'] => {
  const writeActivity = (
    event: {
      source: 'sonarr' | 'radarr' | 'transmission';
      stage: string;
      message: string;
      detail?: string | null;
      progressCurrent?: number | null;
      progressTotal?: number | null;
      metadata?: Record<string, unknown>;
    }
  ) => {
    if (!activityTracker) {
      return;
    }

    activityTracker.info({
      source: event.source,
      stage: event.stage,
      message: event.message,
      detail: event.detail ?? null,
      progressCurrent: event.progressCurrent ?? null,
      progressTotal: event.progressTotal ?? null,
      ...(event.metadata ? { metadata: event.metadata } : {}),
    });
  };

  return {
    sonarr: config.instances.sonarr.apiKey
      ? createSonarrClient({
          baseUrl: config.instances.sonarr.url,
          apiKey: config.instances.sonarr.apiKey,
          wantedPageSize: config.sync.wantedPageSize,
          ...(activityTracker ? { activityReporter: writeActivity } : {}),
        })
      : null,
    radarr: config.instances.radarr.apiKey
      ? createRadarrClient({
          baseUrl: config.instances.radarr.url,
          apiKey: config.instances.radarr.apiKey,
          wantedPageSize: config.sync.wantedPageSize,
          ...(activityTracker ? { activityReporter: writeActivity } : {}),
        })
      : null,
    prowlarr: config.instances.prowlarr.apiKey
      ? createProwlarrClient({
          baseUrl: config.instances.prowlarr.url,
          apiKey: config.instances.prowlarr.apiKey,
        })
      : null,
    transmission: config.instances.transmission.url
      ? createTransmissionClient({
          baseUrl: config.instances.transmission.url,
          username: config.instances.transmission.username,
          password: config.instances.transmission.password,
          ...(activityTracker
            ? {
                activityReporter: (event: {
                  source: 'transmission';
                  stage: string;
                  message: string;
                  detail?: string | null;
                  progressCurrent?: number | null;
                  progressTotal?: number | null;
                  metadata?: Record<string, unknown>;
                }) => {
                  writeActivity(event);
                },
              }
            : {}),
        })
      : null,
  };
};

const buildRuntimeCore = async () => {
  const [loadedConfig, database] = await Promise.all([
    loadConfig(),
    getDatabaseContext(),
  ]);
  configureLogger(loadedConfig.config.logging.level);

  const resolved = resolveRuntimeConfig(loadedConfig, database);
  const createRuntimeState = () => {
    const nextResolved = resolveRuntimeConfig(loadedConfig, database);

    return {
      config: nextResolved.config as RuntimeContext['config'],
      redactedConfig: nextResolved.redactedConfig,
      clients: createClients(nextResolved.config as RuntimeContext['config']),
      connectionStatus: nextResolved.connectionStatus,
      sessionSecretSource: nextResolved.sessionSecretSource,
    };
  };

  const scheduler = createSchedulerCoordinator({
    database,
    cadenceMs: resolved.config.scheduler.cycleEveryMs,
    startupGracePeriodMs: resolved.config.scheduler.startupGracePeriodMs,
    maxRunDurationMs: resolved.config.scheduler.maxRunDurationMs,
    lockTtlMs: Math.max(
      resolved.config.scheduler.maxRunDurationMs,
      resolved.config.scheduler.cycleEveryMs,
      15 * 60_000
    ),
    isLiveModeEnabled: () => createRuntimeState().config.mode === 'live',
    async executeRun(context) {
      const activityTracker = context.activity;
      const baseRuntimeState = createRuntimeState();
      const runtimeState = {
        ...baseRuntimeState,
        clients: createClients(baseRuntimeState.config, activityTracker),
      };

      activityTracker.info({
        source: 'scheduler',
        stage: 'sync_start',
        message: `Starting ${context.runType.replace('_', ' ')} run`,
        detail: context.startupGraceActive ? 'Startup grace is active.' : null,
      });

      const syncSummary = await syncArrState({
        database,
        clients: {
          sonarr: runtimeState.clients.sonarr,
          radarr: runtimeState.clients.radarr,
        },
        syncConfig: {
          ...runtimeState.config.sync,
          sonarrFetchAllPages: runtimeState.config.instances.sonarr.fetchAllWantedPages,
          radarrFetchAllPages: runtimeState.config.instances.radarr.fetchAllWantedPages,
        },
        activityTracker,
      });

      activityTracker.info({
        source: 'transmission',
        stage: 'transmission_guard_start',
        message: 'Starting Transmission guard pass',
      });
      const transmissionSummary = await runTransmissionGuard({
        database,
        config: runtimeState.config,
        client: runtimeState.clients.transmission,
        sonarrClient: runtimeState.clients.sonarr,
        radarrClient: runtimeState.clients.radarr,
        activityTracker,
      });

      if (context.runType === 'sync_only') {
        activityTracker.complete({
          source: 'scheduler',
          stage: 'complete',
          message: 'Sync-only run completed',
          detail: `Synced Sonarr and Radarr, observed ${transmissionSummary.observedCount} torrents.`,
        });
        return {
          status: 'success',
          summary: {
            syncSummary,
            transmissionSummary,
          },
        };
      }

      activityTracker.info({
        source: 'dispatch',
        stage: 'dispatch_start',
        message: 'Starting search dispatch stage',
      });
      const dispatchSummary = await executeSearchDispatchRun({
        database,
        config: runtimeState.config,
        clients: {
          sonarr: runtimeState.clients.sonarr,
          radarr: runtimeState.clients.radarr,
        },
        runId: context.runId,
        live: context.liveDispatchAllowed,
        activityTracker,
      });

      activityTracker.complete({
        source: 'scheduler',
        stage: 'complete',
        message: `${context.runType.replace('_', ' ')} run completed`,
        detail: `${dispatchSummary.dispatchCount} dispatches, ${dispatchSummary.skipCount} skips, ${dispatchSummary.errorCount} errors.`,
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
    mode: resolved.config.mode,
    configPath: resolved.config.meta.configPath,
    sqlitePath: resolved.config.storage.sqlitePath,
    cycleEveryMs: resolved.config.scheduler.cycleEveryMs,
  });

  return {
    loadedConfig,
    database,
    scheduler,
  };
};

export const getRuntimeContext = async (): Promise<RuntimeContext> => {
  if (!globalThis.__edarrRuntimeCore) {
    globalThis.__edarrRuntimeCore = buildRuntimeCore();
  }

  const runtimeCore = await globalThis.__edarrRuntimeCore;
  runtimeCore.database.repositories = createRepositories(runtimeCore.database.connection);
  const resolved = resolveRuntimeConfig(runtimeCore.loadedConfig, runtimeCore.database);

  return {
    config: resolved.config as RuntimeContext['config'],
    redactedConfig: resolved.redactedConfig,
    database: runtimeCore.database,
    clients: createClients(resolved.config as RuntimeContext['config']),
    connectionStatus: resolved.connectionStatus,
    sessionSecretSource: resolved.sessionSecretSource,
    scheduler: runtimeCore.scheduler,
  };
};

export const runManualCycle = async (
  runType: Exclude<CoordinatedRunType, 'scheduled'>
) => {
  const runtime = await getRuntimeContext();
  return runtime.scheduler.runManual(runType);
};

export const recoverActiveRun = async (reason?: string) => {
  const runtime = await getRuntimeContext();
  return runtime.scheduler.recoverActiveRun(reason);
};

export const runManualFetch = async (mediaKey: string) => {
  const runtime = await getRuntimeContext();

  if (runtime.config.mode !== 'live') {
    logger.warn({
      event: 'manual_fetch_rejected',
      mediaKey,
      reason: 'dry_run_mode',
    });

    return {
      accepted: false,
      runId: null,
      reason: 'not-live',
    };
  }

  const startedAt = new Date();
  const startedAtIso = startedAt.toISOString();
  const runId = `manual_fetch_${randomUUID()}`;

  runtime.database.repositories.runHistory.create({
    id: runId,
    runType: 'manual_live',
    startedAt: startedAtIso,
    finishedAt: null,
    status: 'running',
    candidateCount: 0,
    dispatchCount: 0,
    skipCount: 0,
    errorCount: 0,
    summary: {
      manualFetch: true,
      mediaKey,
      manualOverride: true,
    },
  });

  try {
    const summary = await executeManualFetch({
      database: runtime.database,
      config: runtime.config,
      clients: {
        sonarr: runtime.clients.sonarr,
        radarr: runtime.clients.radarr,
      },
      runId,
      mediaKey,
      now: startedAt,
    });

    runtime.database.repositories.runHistory.update({
      id: runId,
      runType: 'manual_live',
      startedAt: startedAtIso,
      finishedAt: new Date().toISOString(),
      status: summary.errorCount > 0 ? 'failed' : 'success',
      candidateCount: summary.candidateCount,
      dispatchCount: summary.dispatchCount,
      skipCount: summary.skipCount,
      errorCount: summary.errorCount,
      summary: summary.summary,
    });

    return {
      accepted: true,
      runId,
      reason: null,
    };
  } catch (error) {
    runtime.database.repositories.runHistory.update({
      id: runId,
      runType: 'manual_live',
      startedAt: startedAtIso,
      finishedAt: new Date().toISOString(),
      status: 'failed',
      candidateCount: 1,
      dispatchCount: 0,
      skipCount: 0,
      errorCount: 1,
      summary: {
        manualFetch: true,
        mediaKey,
        manualOverride: true,
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
              }
            : {
                message: 'Unknown manual fetch error',
              },
      },
    });

    return {
      accepted: true,
      runId,
      reason:
        error instanceof Error ? error.message : 'Unknown manual fetch error',
    };
  }
};
