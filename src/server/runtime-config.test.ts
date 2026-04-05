import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { loadConfig } from '@/src/config';
import { initializeDatabase } from '@/src/db';

import {
  resolveRuntimeConfig,
  savePersistedConnectionSettings,
  savePersistedSearchSafetyOverrides,
} from './runtime-config';

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
    fetch_all_wanted_pages: false
  radarr:
    url: "http://radarr:7878"
    api_key_env: "RADARR_API_KEY"
    fetch_all_wanted_pages: false
  prowlarr:
    url: "http://prowlarr:9696"
    api_key_env: "PROWLARR_API_KEY"
  transmission:
    url: "http://transmission:9091/transmission/rpc"
    username_env: "TRANSMISSION_RPC_USERNAME"
    password_env: "TRANSMISSION_RPC_PASSWORD"
scheduler:
  cycle_every: "30m"
  startup_grace_period: "10m"
  max_run_duration: "30m"
sync:
  wanted_page_size: 50
  full_scan_page_threshold: 20
  max_wanted_pages_per_collection: 4
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
  const directory = await mkdtemp(join(tmpdir(), 'edarr-runtime-config-'));
  const configPath = join(directory, 'config.yaml');
  await writeFile(configPath, contents, 'utf8');
  return configPath;
};

const createDatabasePath = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'edarr-runtime-db-'));
  return join(directory, 'orchestrator.sqlite');
};

test('resolveRuntimeConfig auto-generates and persists the session secret', async () => {
  const configPath = await createConfigFile(baseConfig);
  const databasePath = await createDatabasePath();
  const database = await initializeDatabase(databasePath);

  try {
    const loadedConfig = await loadConfig({
      argv: ['--config', configPath],
      env: {},
    });

    const first = resolveRuntimeConfig(loadedConfig, database);
    const second = resolveRuntimeConfig(loadedConfig, database);

    assert.ok(first.config.auth.sessionSecret);
    assert.equal(first.config.auth.sessionSecret, second.config.auth.sessionSecret);
    assert.equal(first.sessionSecretSource, 'generated');
  } finally {
    database.close();
  }
});

test('resolveRuntimeConfig prefers persisted connection settings when env secrets are absent', async () => {
  const configPath = await createConfigFile(baseConfig);
  const databasePath = await createDatabasePath();
  const database = await initializeDatabase(databasePath);

  try {
    const loadedConfig = await loadConfig({
      argv: ['--config', configPath],
      env: {},
    });

    savePersistedConnectionSettings(database, {
      sonarr: {
        url: 'http://nas.lan:8989',
        apiKey: 'persisted-sonarr-key',
        fetchAllWantedPages: true,
      },
      radarr: {
        url: 'http://nas.lan:7878',
        apiKey: 'persisted-radarr-key',
        fetchAllWantedPages: false,
      },
      prowlarr: {
        url: 'http://nas.lan:9696',
        apiKey: 'persisted-prowlarr-key',
      },
      transmission: {
        url: 'http://nas.lan:9091/transmission/rpc',
        username: 'transmission-user',
        password: 'transmission-pass',
      },
    });

    const resolved = resolveRuntimeConfig(loadedConfig, database);

    assert.equal(resolved.config.instances.sonarr.url, 'http://nas.lan:8989');
    assert.equal(resolved.config.instances.sonarr.apiKey, 'persisted-sonarr-key');
    assert.equal(resolved.connectionStatus.sonarr.configured, true);
    assert.equal(resolved.connectionStatus.sonarr.secretSource, 'persisted');
    assert.equal(resolved.config.instances.transmission.username, 'transmission-user');
    assert.equal(resolved.connectionStatus.transmission.configured, true);
  } finally {
    database.close();
  }
});

test('resolveRuntimeConfig treats a URL-only transmission setup as configured', async () => {
  const configPath = await createConfigFile(baseConfig);
  const databasePath = await createDatabasePath();
  const database = await initializeDatabase(databasePath);

  try {
    const loadedConfig = await loadConfig({
      argv: ['--config', configPath],
      env: {},
    });

    savePersistedConnectionSettings(database, {
      sonarr: {
        url: 'http://nas.lan:8989',
        apiKey: 'persisted-sonarr-key',
        fetchAllWantedPages: false,
      },
      radarr: {
        url: 'http://nas.lan:7878',
        apiKey: 'persisted-radarr-key',
        fetchAllWantedPages: false,
      },
      prowlarr: {
        url: 'http://nas.lan:9696',
        apiKey: 'persisted-prowlarr-key',
      },
      transmission: {
        url: 'http://nas.lan:9091/transmission/rpc',
        username: null,
        password: null,
      },
    });

    const resolved = resolveRuntimeConfig(loadedConfig, database);

    assert.equal(resolved.connectionStatus.transmission.configured, true);
    assert.equal(resolved.connectionStatus.transmission.secretSource, 'none');
    assert.equal(
      resolved.connectionStatus.transmission.summary,
      'Ready to connect without credentials.'
    );
  } finally {
    database.close();
  }
});

test('resolveRuntimeConfig applies persisted rolling search limit overrides', async () => {
  const configPath = await createConfigFile(baseConfig);
  const databasePath = await createDatabasePath();
  const database = await initializeDatabase(databasePath);

  try {
    const loadedConfig = await loadConfig({
      argv: ['--config', configPath],
      env: {},
    });

    savePersistedSearchSafetyOverrides(database, {
      rollingSearchLimits: {
        per15m: 2,
        per1h: 6,
        per24h: 18,
      },
    });

    const resolved = resolveRuntimeConfig(loadedConfig, database);

    assert.equal(resolved.config.safety.rollingSearchLimits.per15m, 2);
    assert.equal(resolved.config.safety.rollingSearchLimits.per1h, 6);
    assert.equal(resolved.config.safety.rollingSearchLimits.per24h, 18);
  } finally {
    database.close();
  }
});

test('resolveRuntimeConfig applies persisted per-app wanted page fetch settings', async () => {
  const configPath = await createConfigFile(baseConfig);
  const databasePath = await createDatabasePath();
  const database = await initializeDatabase(databasePath);

  try {
    const loadedConfig = await loadConfig({
      argv: ['--config', configPath],
      env: {},
    });

    savePersistedConnectionSettings(database, {
      sonarr: {
        url: 'http://nas.lan:8989',
        apiKey: 'persisted-sonarr-key',
        fetchAllWantedPages: true,
      },
      radarr: {
        url: 'http://nas.lan:7878',
        apiKey: 'persisted-radarr-key',
        fetchAllWantedPages: false,
      },
      prowlarr: {
        url: 'http://nas.lan:9696',
        apiKey: 'persisted-prowlarr-key',
      },
      transmission: {
        url: 'http://nas.lan:9091/transmission/rpc',
        username: null,
        password: null,
      },
    });

    const resolved = resolveRuntimeConfig(loadedConfig, database);

    assert.equal(resolved.config.instances.sonarr.fetchAllWantedPages, true);
    assert.equal(resolved.config.instances.radarr.fetchAllWantedPages, false);
  } finally {
    database.close();
  }
});
