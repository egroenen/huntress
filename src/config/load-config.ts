import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { parseArgs } from 'node:util';

import { parse } from 'yaml';

import {
  type RawConfig,
  type RedactedResolvedConfig,
  type ResolvedConfig,
  rawConfigSchema,
  resolvedConfigSchema,
} from './schema';

const DEFAULT_CONFIG_PATHS = ['/config/config.yaml', './config/config.yaml'];

const redact = (value: string | null): '[redacted]' | null =>
  value ? '[redacted]' : null;

const durationToMs = (value: string): number => {
  const amount = Number.parseInt(value.slice(0, -1), 10);
  const unit = value.slice(-1);

  if (Number.isNaN(amount) || amount <= 0) {
    throw new Error(`Invalid duration value: ${value}`);
  }

  switch (unit) {
    case 's':
      return amount * 1_000;
    case 'm':
      return amount * 60_000;
    case 'h':
      return amount * 3_600_000;
    case 'd':
      return amount * 86_400_000;
    default:
      throw new Error(`Unsupported duration unit: ${value}`);
  }
};

const parseListenAddress = (
  value: string
): { listenHost: string; listenPort: number } => {
  const separatorIndex = value.lastIndexOf(':');

  if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
    throw new Error(`server.listen must use host:port format, received: ${value}`);
  }

  const listenHost = value.slice(0, separatorIndex);
  const listenPort = Number.parseInt(value.slice(separatorIndex + 1), 10);

  if (Number.isNaN(listenPort) || listenPort <= 0) {
    throw new Error(`server.listen port must be a positive integer, received: ${value}`);
  }

  return {
    listenHost,
    listenPort,
  };
};

type EnvSource = Record<string, string | undefined>;

const resolveOptionalEnv = (envName: string, env: EnvSource): string | null =>
  env[envName]?.trim() || null;

const resolveSearchPolicy = (policy: RawConfig['policies']['sonarr']) => {
  return {
    maxSearchesPerCycle: policy.max_searches_per_cycle,
    missingRetryIntervalsMs: policy.missing_retry_intervals.map(durationToMs),
    cutoffRetryIntervalsMs: policy.cutoff_retry_intervals.map(durationToMs),
    recentReleaseWindowDays: policy.recent_release_window_days,
    excludeUnreleased: policy.exclude_unreleased,
    excludeUnmonitored: policy.exclude_unmonitored,
    releaseSelection: policy.release_selection
      ? {
          enabled: policy.release_selection.enabled,
          strategy: policy.release_selection.strategy,
          preferredMinResolution: policy.release_selection.preferred_min_resolution,
          fallbackMinResolution: policy.release_selection.fallback_min_resolution,
          minimumSeeders: policy.release_selection.minimum_seeders,
          minimumCustomFormatScore: policy.release_selection.minimum_custom_format_score,
          requireEnglish: policy.release_selection.require_english,
          upgradeRetryAfterFallbackMs: durationToMs(
            policy.release_selection.upgrade_retry_after_fallback
          ),
        }
      : undefined,
  };
};

const resolveConfigPath = async (
  explicitConfigPath: string | undefined
): Promise<string> => {
  const candidatePaths = explicitConfigPath ? [explicitConfigPath] : DEFAULT_CONFIG_PATHS;

  for (const candidatePath of candidatePaths) {
    try {
      await access(candidatePath, constants.R_OK);
      return candidatePath;
    } catch {
      // Continue to the next candidate path.
    }
  }

  throw new Error(
    `No readable config file found. Looked for: ${candidatePaths.join(', ')}`
  );
};

const loadRawConfig = async (configPath: string): Promise<RawConfig> => {
  const fileContents = await readFile(configPath, 'utf8');
  const parsedYaml = parse(fileContents);

  return rawConfigSchema.parse(parsedYaml);
};

const resolveConfig = (
  rawConfig: RawConfig,
  configPath: string,
  env: EnvSource
): ResolvedConfig => {
  const { listenHost, listenPort } = parseListenAddress(rawConfig.server.listen);

  return resolvedConfigSchema.parse({
    server: {
      listenHost,
      listenPort,
    },
    mode: rawConfig.mode,
    storage: {
      sqlitePath: rawConfig.storage.sqlite_path,
    },
    auth: {
      enabled: rawConfig.auth.enabled,
      sessionSecret: resolveOptionalEnv(rawConfig.auth.session_secret_env, env),
      sessionSecretEnv: rawConfig.auth.session_secret_env,
      sessionAbsoluteTtlMs: durationToMs(rawConfig.auth.session_absolute_ttl),
      sessionIdleTtlMs: durationToMs(rawConfig.auth.session_idle_ttl),
    },
    instances: {
      sonarr: {
        url: rawConfig.instances.sonarr.url,
        apiKey: resolveOptionalEnv(rawConfig.instances.sonarr.api_key_env, env),
        apiKeyEnv: rawConfig.instances.sonarr.api_key_env,
        fetchAllWantedPages: rawConfig.instances.sonarr.fetch_all_wanted_pages,
      },
      radarr: {
        url: rawConfig.instances.radarr.url,
        apiKey: resolveOptionalEnv(rawConfig.instances.radarr.api_key_env, env),
        apiKeyEnv: rawConfig.instances.radarr.api_key_env,
        fetchAllWantedPages: rawConfig.instances.radarr.fetch_all_wanted_pages,
      },
      prowlarr: {
        url: rawConfig.instances.prowlarr.url,
        apiKey: resolveOptionalEnv(rawConfig.instances.prowlarr.api_key_env, env),
        apiKeyEnv: rawConfig.instances.prowlarr.api_key_env,
      },
      transmission: {
        url: rawConfig.instances.transmission.url,
        username: resolveOptionalEnv(rawConfig.instances.transmission.username_env, env),
        usernameEnv: rawConfig.instances.transmission.username_env,
        password: resolveOptionalEnv(rawConfig.instances.transmission.password_env, env),
        passwordEnv: rawConfig.instances.transmission.password_env,
      },
    },
    scheduler: {
      cycleEveryMs: durationToMs(rawConfig.scheduler.cycle_every),
      startupGracePeriodMs: durationToMs(rawConfig.scheduler.startup_grace_period),
      maxRunDurationMs: durationToMs(rawConfig.scheduler.max_run_duration),
    },
    sync: {
      wantedPageSize: rawConfig.sync.wanted_page_size,
      fullScanPageThreshold: rawConfig.sync.full_scan_page_threshold,
      maxWantedPagesPerCollection: rawConfig.sync.max_wanted_pages_per_collection,
    },
    policies: {
      sonarr: resolveSearchPolicy(rawConfig.policies.sonarr),
      radarr: resolveSearchPolicy(rawConfig.policies.radarr),
    },
    transmissionGuard: {
      enabled: rawConfig.transmission_guard.enabled,
      stallNoProgressForMs: durationToMs(
        rawConfig.transmission_guard.stall_no_progress_for
      ),
      stallNearCompleteForMs: durationToMs(
        rawConfig.transmission_guard.stall_near_complete_for
      ),
      suppressSameReleaseForMs: durationToMs(
        rawConfig.transmission_guard.suppress_same_release_for
      ),
      itemCooldownAfterLoopMs: durationToMs(
        rawConfig.transmission_guard.item_cooldown_after_loop
      ),
      deleteLocalData: rawConfig.transmission_guard.delete_local_data,
      dangerousExtensions: rawConfig.transmission_guard.dangerous_extensions
        .split(',')
        .map((ext) => ext.trim().toLowerCase())
        .filter((ext) => ext.length > 0)
        .map((ext) => (ext.startsWith('.') ? ext : `.${ext}`)),
    },
    safety: {
      panicDisableSearch: rawConfig.safety.panic_disable_search,
      stopOnProwlarrOutage: rawConfig.safety.stop_on_prowlarr_outage,
      maxGlobalDispatchPerCycle: rawConfig.safety.max_global_dispatch_per_cycle,
      minGlobalDispatchSpacingMs: durationToMs(
        rawConfig.safety.min_global_dispatch_spacing
      ),
      rollingSearchLimits: {
        per15m: rawConfig.safety.rolling_search_limits.per_15m,
        per1h: rawConfig.safety.rolling_search_limits.per_1h,
        per24h: rawConfig.safety.rolling_search_limits.per_24h,
      },
    },
    logging: {
      level: rawConfig.logging.level,
    },
    meta: {
      configPath,
    },
  });
};

const redactConfig = (config: ResolvedConfig): RedactedResolvedConfig => {
  return {
    ...config,
    auth: {
      ...config.auth,
      sessionSecret: redact(config.auth.sessionSecret),
    },
    instances: {
      sonarr: {
        ...config.instances.sonarr,
        apiKey: redact(config.instances.sonarr.apiKey),
      },
      radarr: {
        ...config.instances.radarr,
        apiKey: redact(config.instances.radarr.apiKey),
      },
      prowlarr: {
        ...config.instances.prowlarr,
        apiKey: redact(config.instances.prowlarr.apiKey),
      },
      transmission: {
        ...config.instances.transmission,
        username: redact(config.instances.transmission.username),
        password: redact(config.instances.transmission.password),
      },
    },
  };
};

export interface LoadConfigOptions {
  argv?: string[];
  env?: EnvSource;
}

export interface LoadedConfig {
  config: ResolvedConfig;
  redactedConfig: RedactedResolvedConfig;
}

export const resolveConfigPathFromArgs = (
  argv: string[] = process.argv.slice(2)
): string | undefined => {
  const { values } = parseArgs({
    args: argv,
    options: {
      config: {
        type: 'string',
      },
    },
    strict: false,
    allowPositionals: true,
  });

  return typeof values.config === 'string' ? values.config : undefined;
};

export const loadConfig = async (
  options: LoadConfigOptions = {}
): Promise<LoadedConfig> => {
  const env = options.env ?? process.env;
  const explicitConfigPath = resolveConfigPathFromArgs(options.argv);
  const configPath = await resolveConfigPath(explicitConfigPath ?? env.CONFIG_PATH);
  const rawConfig = await loadRawConfig(configPath);
  const config = resolveConfig(rawConfig, configPath, env);

  return {
    config,
    redactedConfig: redactConfig(config),
  };
};
