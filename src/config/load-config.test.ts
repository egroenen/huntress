import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadConfig } from './load-config';

const baseConfig = `
server:
  listen: "127.0.0.1:47892"
mode: "dry-run"
storage:
  sqlite_path: "/data/orchestrator.db"
auth:
  enabled: true
  session_secret_env: "APP_SESSION_SECRET"
  session_absolute_ttl: "7d"
  session_idle_ttl: "24h"
instances:
  sonarr:
    url: "http://sonarr:8989"
    api_key_env: "SONARR_API_KEY"
  radarr:
    url: "http://radarr:7878"
    api_key_env: "RADARR_API_KEY"
  prowlarr:
    url: "http://prowlarr:9696"
    api_key_env: "PROWLARR_API_KEY"
  transmission:
    url: "http://transmission:9091/transmission/rpc"
    username_env: "TRANSMISSION_RPC_USERNAME"
    password_env: "TRANSMISSION_RPC_PASSWORD"
scheduler:
  cycle_every: "6h"
  startup_grace_period: "10m"
policies:
  sonarr:
    max_searches_per_cycle: 6
    missing_retry_intervals: ["12h", "24h", "72h", "168h"]
    cutoff_retry_intervals: ["48h", "168h", "336h"]
    recent_release_window_days: 30
    exclude_unreleased: true
    exclude_unmonitored: true
  radarr:
    max_searches_per_cycle: 3
    missing_retry_intervals: ["24h", "72h", "168h", "336h"]
    cutoff_retry_intervals: ["72h", "168h", "336h"]
    recent_release_window_days: 30
    exclude_unreleased: true
    exclude_unmonitored: true
transmission_guard:
  enabled: true
  stall_no_progress_for: "12h"
  suppress_same_release_for: "7d"
  item_cooldown_after_loop: "24h"
  delete_local_data: true
safety:
  panic_disable_search: false
  stop_on_prowlarr_outage: true
  max_global_dispatch_per_cycle: 8
  min_global_dispatch_spacing: "45s"
  rolling_search_limits:
    per_15m: 4
    per_1h: 10
    per_24h: 40
logging:
  level: "info"
`;

const createConfigFile = async (contents: string): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'edarr-config-'));
  const configPath = join(directory, 'config.yaml');
  await writeFile(configPath, contents, 'utf8');
  return configPath;
};

const validEnv = {
  APP_SESSION_SECRET: 'super-secret-session-key',
  SONARR_API_KEY: 'sonarr-key',
  RADARR_API_KEY: 'radarr-key',
  PROWLARR_API_KEY: 'prowlarr-key',
  TRANSMISSION_RPC_USERNAME: 'transmission-user',
  TRANSMISSION_RPC_PASSWORD: 'transmission-pass',
};

test('loadConfig resolves a valid config file and redacts secrets', async () => {
  const configPath = await createConfigFile(baseConfig);
  const { config, redactedConfig } = await loadConfig({
    argv: ['--config', configPath],
    env: validEnv,
  });

  assert.equal(config.server.listenHost, '127.0.0.1');
  assert.equal(config.server.listenPort, 47892);
  assert.equal(config.auth.sessionAbsoluteTtlMs, 604_800_000);
  assert.equal(config.auth.sessionIdleTtlMs, 86_400_000);
  assert.equal(config.instances.sonarr.apiKey, 'sonarr-key');
  assert.equal(config.safety.rollingSearchLimits.per15m, 4);
  assert.equal(redactedConfig.instances.sonarr.apiKey, '[redacted]');
  assert.equal(redactedConfig.auth.sessionSecret, '[redacted]');
});

test('loadConfig fails when a required environment variable is missing', async () => {
  const configPath = await createConfigFile(baseConfig);

  await assert.rejects(
    async () =>
      loadConfig({
        argv: ['--config', configPath],
        env: {
          ...validEnv,
          SONARR_API_KEY: undefined,
        },
      }),
    /Missing required environment variable: SONARR_API_KEY/
  );
});

test('loadConfig fails when absolute session TTL is not greater than idle TTL', async () => {
  const configPath = await createConfigFile(
    baseConfig.replace('session_absolute_ttl: "7d"', 'session_absolute_ttl: "24h"')
  );

  await assert.rejects(
    async () =>
      loadConfig({
        argv: ['--config', configPath],
        env: validEnv,
      }),
    /session_absolute_ttl must be greater than auth\.session_idle_ttl/
  );
});
