import { z } from 'zod';

const durationPattern = /^\d+[smhd]$/;

const durationStringSchema = z
  .string()
  .regex(durationPattern, 'Expected a duration like 30m, 24h, or 7d');

const loggingLevelSchema = z.enum(['trace', 'debug', 'info', 'warn', 'error']);

export const rawConfigSchema = z.object({
  server: z.object({
    listen: z.string().min(3),
  }),
  mode: z.enum(['dry-run', 'live']),
  storage: z.object({
    sqlite_path: z.string().min(1),
  }),
  auth: z.object({
    enabled: z.boolean(),
    session_secret_env: z.string().min(1).optional().default('APP_SESSION_SECRET'),
    session_absolute_ttl: durationStringSchema,
    session_idle_ttl: durationStringSchema,
  }),
  instances: z.object({
    sonarr: z.object({
      url: z.string().url(),
      api_key_env: z.string().min(1).optional().default('SONARR_API_KEY'),
    }),
    radarr: z.object({
      url: z.string().url(),
      api_key_env: z.string().min(1).optional().default('RADARR_API_KEY'),
    }),
    prowlarr: z.object({
      url: z.string().url(),
      api_key_env: z.string().min(1).optional().default('PROWLARR_API_KEY'),
    }),
    transmission: z.object({
      url: z.string().url(),
      username_env: z.string().min(1).optional().default('TRANSMISSION_RPC_USERNAME'),
      password_env: z.string().min(1).optional().default('TRANSMISSION_RPC_PASSWORD'),
    }),
  }),
  scheduler: z.object({
    cycle_every: durationStringSchema,
    startup_grace_period: durationStringSchema,
    max_run_duration: durationStringSchema,
  }),
  sync: z.object({
    wanted_page_size: z.number().int().positive().default(250),
    full_scan_page_threshold: z.number().int().positive().default(20),
    max_wanted_pages_per_collection: z.number().int().positive().default(4),
  }),
  policies: z.object({
    sonarr: z.object({
      max_searches_per_cycle: z.number().int().positive(),
      missing_retry_intervals: z.array(durationStringSchema).min(1),
      cutoff_retry_intervals: z.array(durationStringSchema).min(1),
      recent_release_window_days: z.number().int().nonnegative(),
      exclude_unreleased: z.boolean(),
      exclude_unmonitored: z.boolean(),
    }),
    radarr: z.object({
      max_searches_per_cycle: z.number().int().positive(),
      missing_retry_intervals: z.array(durationStringSchema).min(1),
      cutoff_retry_intervals: z.array(durationStringSchema).min(1),
      recent_release_window_days: z.number().int().nonnegative(),
      exclude_unreleased: z.boolean(),
      exclude_unmonitored: z.boolean(),
    }),
  }),
  transmission_guard: z.object({
    enabled: z.boolean(),
    stall_no_progress_for: durationStringSchema,
    suppress_same_release_for: durationStringSchema,
    item_cooldown_after_loop: durationStringSchema,
    delete_local_data: z.boolean(),
  }),
  safety: z.object({
    panic_disable_search: z.boolean(),
    stop_on_prowlarr_outage: z.boolean(),
    max_global_dispatch_per_cycle: z.number().int().positive(),
    min_global_dispatch_spacing: durationStringSchema,
    rolling_search_limits: z.object({
      per_15m: z.number().int().positive(),
      per_1h: z.number().int().positive(),
      per_24h: z.number().int().positive(),
    }),
  }),
  logging: z.object({
    level: loggingLevelSchema,
  }),
});

export type RawConfig = z.infer<typeof rawConfigSchema>;

export const resolvedSearchPolicySchema = z.object({
  maxSearchesPerCycle: z.number().int().positive(),
  missingRetryIntervalsMs: z.array(z.number().int().positive()).min(1),
  cutoffRetryIntervalsMs: z.array(z.number().int().positive()).min(1),
  recentReleaseWindowDays: z.number().int().nonnegative(),
  excludeUnreleased: z.boolean(),
  excludeUnmonitored: z.boolean(),
});

export const resolvedConfigSchema = z
  .object({
    server: z.object({
      listenHost: z.string().min(1),
      listenPort: z.number().int().positive(),
    }),
    mode: z.enum(['dry-run', 'live']),
    storage: z.object({
      sqlitePath: z.string().min(1),
    }),
    auth: z.object({
      enabled: z.boolean(),
      sessionSecret: z.string().min(1).nullable(),
      sessionSecretEnv: z.string().min(1),
      sessionAbsoluteTtlMs: z.number().int().positive(),
      sessionIdleTtlMs: z.number().int().positive(),
    }),
    instances: z.object({
      sonarr: z.object({
        url: z.string().url(),
        apiKey: z.string().min(1).nullable(),
        apiKeyEnv: z.string().min(1),
      }),
      radarr: z.object({
        url: z.string().url(),
        apiKey: z.string().min(1).nullable(),
        apiKeyEnv: z.string().min(1),
      }),
      prowlarr: z.object({
        url: z.string().url(),
        apiKey: z.string().min(1).nullable(),
        apiKeyEnv: z.string().min(1),
      }),
      transmission: z.object({
        url: z.string().url(),
        username: z.string().min(1).nullable(),
        usernameEnv: z.string().min(1),
        password: z.string().min(1).nullable(),
        passwordEnv: z.string().min(1),
      }),
    }),
    scheduler: z.object({
      cycleEveryMs: z.number().int().positive(),
      startupGracePeriodMs: z.number().int().nonnegative(),
      maxRunDurationMs: z.number().int().positive(),
    }),
    sync: z.object({
      wantedPageSize: z.number().int().positive(),
      fullScanPageThreshold: z.number().int().positive(),
      maxWantedPagesPerCollection: z.number().int().positive(),
    }),
    policies: z.object({
      sonarr: resolvedSearchPolicySchema,
      radarr: resolvedSearchPolicySchema,
    }),
    transmissionGuard: z.object({
      enabled: z.boolean(),
      stallNoProgressForMs: z.number().int().positive(),
      suppressSameReleaseForMs: z.number().int().positive(),
      itemCooldownAfterLoopMs: z.number().int().positive(),
      deleteLocalData: z.boolean(),
    }),
    safety: z.object({
      panicDisableSearch: z.boolean(),
      stopOnProwlarrOutage: z.boolean(),
      maxGlobalDispatchPerCycle: z.number().int().positive(),
      minGlobalDispatchSpacingMs: z.number().int().positive(),
      rollingSearchLimits: z.object({
        per15m: z.number().int().positive(),
        per1h: z.number().int().positive(),
        per24h: z.number().int().positive(),
      }),
    }),
    logging: z.object({
      level: loggingLevelSchema,
    }),
    meta: z.object({
      configPath: z.string().min(1),
    }),
  })
  .superRefine((config, ctx) => {
    if (config.auth.sessionAbsoluteTtlMs <= config.auth.sessionIdleTtlMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'auth.session_absolute_ttl must be greater than auth.session_idle_ttl',
        path: ['auth', 'sessionAbsoluteTtlMs'],
      });
    }
  });

export type ResolvedConfig = z.infer<typeof resolvedConfigSchema>;

export interface RedactedResolvedConfig extends Omit<
  ResolvedConfig,
  'auth' | 'instances'
> {
  auth: Omit<ResolvedConfig['auth'], 'sessionSecret'> & {
    sessionSecret: '[redacted]' | null;
  };
  instances: {
    sonarr: Omit<ResolvedConfig['instances']['sonarr'], 'apiKey'> & {
      apiKey: '[redacted]' | null;
    };
    radarr: Omit<ResolvedConfig['instances']['radarr'], 'apiKey'> & {
      apiKey: '[redacted]' | null;
    };
    prowlarr: Omit<ResolvedConfig['instances']['prowlarr'], 'apiKey'> & {
      apiKey: '[redacted]' | null;
    };
    transmission: Omit<
      ResolvedConfig['instances']['transmission'],
      'username' | 'password'
    > & {
      username: '[redacted]' | null;
      password: '[redacted]' | null;
    };
  };
}
