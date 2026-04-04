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
} from './schema.js';

const DEFAULT_CONFIG_PATHS = ['/config/config.yaml', './config/config.yaml'];

const redact = (): '[redacted]' => '[redacted]';

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

const resolveEnv = (envName: string, env: EnvSource): string => {
  const resolvedValue = env[envName];

  if (!resolvedValue) {
    throw new Error(`Missing required environment variable: ${envName}`);
  }

  return resolvedValue;
};

const resolveSearchPolicy = (policy: RawConfig['policies']['sonarr']) => {
  return {
    maxSearchesPerCycle: policy.max_searches_per_cycle,
    missingRetryIntervalsMs: policy.missing_retry_intervals.map(durationToMs),
    cutoffRetryIntervalsMs: policy.cutoff_retry_intervals.map(durationToMs),
    recentReleaseWindowDays: policy.recent_release_window_days,
    excludeUnreleased: policy.exclude_unreleased,
    excludeUnmonitored: policy.exclude_unmonitored,
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
      sessionSecret: resolveEnv(rawConfig.auth.session_secret_env, env),
      sessionSecretEnv: rawConfig.auth.session_secret_env,
      sessionAbsoluteTtlMs: durationToMs(rawConfig.auth.session_absolute_ttl),
      sessionIdleTtlMs: durationToMs(rawConfig.auth.session_idle_ttl),
    },
    instances: {
      sonarr: {
        url: rawConfig.instances.sonarr.url,
        apiKey: resolveEnv(rawConfig.instances.sonarr.api_key_env, env),
        apiKeyEnv: rawConfig.instances.sonarr.api_key_env,
      },
      radarr: {
        url: rawConfig.instances.radarr.url,
        apiKey: resolveEnv(rawConfig.instances.radarr.api_key_env, env),
        apiKeyEnv: rawConfig.instances.radarr.api_key_env,
      },
      prowlarr: {
        url: rawConfig.instances.prowlarr.url,
        apiKey: resolveEnv(rawConfig.instances.prowlarr.api_key_env, env),
        apiKeyEnv: rawConfig.instances.prowlarr.api_key_env,
      },
      transmission: {
        url: rawConfig.instances.transmission.url,
        username: resolveEnv(rawConfig.instances.transmission.username_env, env),
        usernameEnv: rawConfig.instances.transmission.username_env,
        password: resolveEnv(rawConfig.instances.transmission.password_env, env),
        passwordEnv: rawConfig.instances.transmission.password_env,
      },
    },
    scheduler: {
      cycleEveryMs: durationToMs(rawConfig.scheduler.cycle_every),
      startupGracePeriodMs: durationToMs(rawConfig.scheduler.startup_grace_period),
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
      suppressSameReleaseForMs: durationToMs(
        rawConfig.transmission_guard.suppress_same_release_for
      ),
      itemCooldownAfterLoopMs: durationToMs(
        rawConfig.transmission_guard.item_cooldown_after_loop
      ),
      deleteLocalData: rawConfig.transmission_guard.delete_local_data,
    },
    safety: {
      panicDisableSearch: rawConfig.safety.panic_disable_search,
      stopOnProwlarrOutage: rawConfig.safety.stop_on_prowlarr_outage,
      maxGlobalDispatchPerCycle: rawConfig.safety.max_global_dispatch_per_cycle,
      minGlobalDispatchSpacingMs: durationToMs(
        rawConfig.safety.min_global_dispatch_spacing
      ),
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
      sessionSecret: redact(),
    },
    instances: {
      sonarr: {
        ...config.instances.sonarr,
        apiKey: redact(),
      },
      radarr: {
        ...config.instances.radarr,
        apiKey: redact(),
      },
      prowlarr: {
        ...config.instances.prowlarr,
        apiKey: redact(),
      },
      transmission: {
        ...config.instances.transmission,
        username: redact(),
        password: redact(),
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
    strict: true,
    allowPositionals: false,
  });

  return values.config;
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
