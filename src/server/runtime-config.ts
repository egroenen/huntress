import { randomBytes } from 'node:crypto';

import type { LoadedConfig, RedactedResolvedConfig, ResolvedConfig } from '@/src/config';
import type { DatabaseContext } from '@/src/db';

export type ConfigurableServiceName = 'sonarr' | 'radarr' | 'prowlarr' | 'transmission';

interface PersistedArrConnectionSettings {
  url: string | null;
  apiKey: string | null;
}

interface PersistedWantedFetchConnectionSettings extends PersistedArrConnectionSettings {
  fetchAllWantedPages: boolean;
}

interface PersistedTransmissionConnectionSettings {
  url: string | null;
  username: string | null;
  password: string | null;
}

export interface PersistedConnectionSettings {
  sonarr: PersistedWantedFetchConnectionSettings;
  radarr: PersistedWantedFetchConnectionSettings;
  prowlarr: PersistedArrConnectionSettings;
  transmission: PersistedTransmissionConnectionSettings;
}

export interface PersistedSearchSafetyOverrides {
  rollingSearchLimits: {
    per15m: number | null;
    per1h: number | null;
    per24h: number | null;
  };
}

type SecretSource = 'env' | 'persisted' | 'generated' | 'missing' | 'none';
type UrlSource = 'persisted' | 'config';

export interface RuntimeConnectionStatus {
  service: ConfigurableServiceName;
  configured: boolean;
  urlSource: UrlSource;
  secretSource: SecretSource;
  summary: string;
}

export interface ResolvedRuntimeConfig {
  config: ResolvedConfig;
  redactedConfig: RedactedResolvedConfig;
  sessionSecretSource: 'env' | 'generated';
  connectionStatus: Record<ConfigurableServiceName, RuntimeConnectionStatus>;
}

const GENERATED_SESSION_SECRET_KEY = 'generated_session_secret';
const PERSISTED_CONNECTION_SETTINGS_KEY = 'connection_settings';
const PERSISTED_SEARCH_SAFETY_OVERRIDES_KEY = 'search_safety_overrides';

const trimToNull = (value: string | null | undefined): string | null => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

const redact = (value: string | null): '[redacted]' | null =>
  value ? '[redacted]' : null;

const positiveIntOrNull = (value: number | null | undefined): number | null => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    return null;
  }

  return value;
};

const getPersistedConnectionSettings = (
  database: DatabaseContext
): PersistedConnectionSettings | null => {
  return (
    database.repositories.serviceState.get<PersistedConnectionSettings>(
      PERSISTED_CONNECTION_SETTINGS_KEY
    )?.value ?? null
  );
};

const getPersistedSearchSafetyOverrides = (
  database: DatabaseContext
): PersistedSearchSafetyOverrides | null => {
  return (
    database.repositories.serviceState.get<PersistedSearchSafetyOverrides>(
      PERSISTED_SEARCH_SAFETY_OVERRIDES_KEY
    )?.value ?? null
  );
};

const createDefaultConnectionSettings = (
  config: ResolvedConfig
): PersistedConnectionSettings => {
  return {
    sonarr: {
      url: config.instances.sonarr.url,
      apiKey: null,
      fetchAllWantedPages: config.instances.sonarr.fetchAllWantedPages,
    },
    radarr: {
      url: config.instances.radarr.url,
      apiKey: null,
      fetchAllWantedPages: config.instances.radarr.fetchAllWantedPages,
    },
    prowlarr: {
      url: config.instances.prowlarr.url,
      apiKey: null,
    },
    transmission: {
      url: config.instances.transmission.url,
      username: null,
      password: null,
    },
  };
};

const normalizePersistedConnectionSettings = (
  settings: PersistedConnectionSettings,
  config: ResolvedConfig
): PersistedConnectionSettings => {
  return {
    sonarr: {
      url: trimToNull(settings.sonarr.url) ?? config.instances.sonarr.url,
      apiKey: trimToNull(settings.sonarr.apiKey),
      fetchAllWantedPages:
        typeof settings.sonarr.fetchAllWantedPages === 'boolean'
          ? settings.sonarr.fetchAllWantedPages
          : config.instances.sonarr.fetchAllWantedPages,
    },
    radarr: {
      url: trimToNull(settings.radarr.url) ?? config.instances.radarr.url,
      apiKey: trimToNull(settings.radarr.apiKey),
      fetchAllWantedPages:
        typeof settings.radarr.fetchAllWantedPages === 'boolean'
          ? settings.radarr.fetchAllWantedPages
          : config.instances.radarr.fetchAllWantedPages,
    },
    prowlarr: {
      url: trimToNull(settings.prowlarr.url) ?? config.instances.prowlarr.url,
      apiKey: trimToNull(settings.prowlarr.apiKey),
    },
    transmission: {
      url: trimToNull(settings.transmission.url) ?? config.instances.transmission.url,
      username: trimToNull(settings.transmission.username),
      password: trimToNull(settings.transmission.password),
    },
  };
};

const ensurePersistedConnectionSettings = (
  database: DatabaseContext,
  config: ResolvedConfig
): PersistedConnectionSettings => {
  const existing = getPersistedConnectionSettings(database);
  const normalized = normalizePersistedConnectionSettings(
    existing ?? createDefaultConnectionSettings(config),
    config
  );

  if (!existing) {
    const now = new Date().toISOString();
    database.repositories.serviceState.set({
      key: PERSISTED_CONNECTION_SETTINGS_KEY,
      value: normalized,
      updatedAt: now,
    });
  }

  return normalized;
};

const createDefaultSearchSafetyOverrides = (): PersistedSearchSafetyOverrides => {
  return {
    rollingSearchLimits: {
      per15m: null,
      per1h: null,
      per24h: null,
    },
  };
};

const normalizePersistedSearchSafetyOverrides = (
  overrides: PersistedSearchSafetyOverrides | null
): PersistedSearchSafetyOverrides => {
  return {
    rollingSearchLimits: {
      per15m: positiveIntOrNull(overrides?.rollingSearchLimits.per15m),
      per1h: positiveIntOrNull(overrides?.rollingSearchLimits.per1h),
      per24h: positiveIntOrNull(overrides?.rollingSearchLimits.per24h),
    },
  };
};

const ensurePersistedSearchSafetyOverrides = (
  database: DatabaseContext
): PersistedSearchSafetyOverrides => {
  const existing = getPersistedSearchSafetyOverrides(database);
  const normalized = normalizePersistedSearchSafetyOverrides(
    existing ?? createDefaultSearchSafetyOverrides()
  );

  if (!existing) {
    database.repositories.serviceState.set({
      key: PERSISTED_SEARCH_SAFETY_OVERRIDES_KEY,
      value: normalized,
      updatedAt: new Date().toISOString(),
    });
  }

  return normalized;
};

const getOrCreateGeneratedSessionSecret = (database: DatabaseContext): string => {
  const existing = database.repositories.serviceState.get<{ value: string }>(
    GENERATED_SESSION_SECRET_KEY
  );

  if (existing?.value.value) {
    return existing.value.value;
  }

  const secret = randomBytes(48).toString('base64url');
  const now = new Date().toISOString();

  database.repositories.serviceState.set({
    key: GENERATED_SESSION_SECRET_KEY,
    value: {
      value: secret,
    },
    updatedAt: now,
  });

  return secret;
};

const getSecretSource = (
  value: string | null,
  hasPersistedValue: boolean
): SecretSource => {
  if (value) {
    return 'env';
  }

  if (hasPersistedValue) {
    return 'persisted';
  }

  return 'missing';
};

export const savePersistedConnectionSettings = (
  database: DatabaseContext,
  settings: PersistedConnectionSettings
): PersistedConnectionSettings => {
  const normalized = {
    sonarr: {
      url: trimToNull(settings.sonarr.url),
      apiKey: trimToNull(settings.sonarr.apiKey),
      fetchAllWantedPages: settings.sonarr.fetchAllWantedPages,
    },
    radarr: {
      url: trimToNull(settings.radarr.url),
      apiKey: trimToNull(settings.radarr.apiKey),
      fetchAllWantedPages: settings.radarr.fetchAllWantedPages,
    },
    prowlarr: {
      url: trimToNull(settings.prowlarr.url),
      apiKey: trimToNull(settings.prowlarr.apiKey),
    },
    transmission: {
      url: trimToNull(settings.transmission.url),
      username: trimToNull(settings.transmission.username),
      password: trimToNull(settings.transmission.password),
    },
  } satisfies PersistedConnectionSettings;

  database.repositories.serviceState.set({
    key: PERSISTED_CONNECTION_SETTINGS_KEY,
    value: normalized,
    updatedAt: new Date().toISOString(),
  });

  return normalized;
};

export const savePersistedSearchSafetyOverrides = (
  database: DatabaseContext,
  overrides: PersistedSearchSafetyOverrides
): PersistedSearchSafetyOverrides => {
  const normalized = normalizePersistedSearchSafetyOverrides(overrides);

  database.repositories.serviceState.set({
    key: PERSISTED_SEARCH_SAFETY_OVERRIDES_KEY,
    value: normalized,
    updatedAt: new Date().toISOString(),
  });

  return normalized;
};

export const resolveRuntimeConfig = (
  loadedConfig: LoadedConfig,
  database: DatabaseContext
): ResolvedRuntimeConfig => {
  const persistedConnections = ensurePersistedConnectionSettings(
    database,
    loadedConfig.config
  );
  const persistedSearchSafetyOverrides =
    ensurePersistedSearchSafetyOverrides(database);
  const sessionSecret =
    trimToNull(loadedConfig.config.auth.sessionSecret) ??
    getOrCreateGeneratedSessionSecret(database);
  const sessionSecretSource = loadedConfig.config.auth.sessionSecret
    ? 'env'
    : 'generated';

  const sonarrApiKey =
    loadedConfig.config.instances.sonarr.apiKey ?? persistedConnections.sonarr.apiKey;
  const radarrApiKey =
    loadedConfig.config.instances.radarr.apiKey ?? persistedConnections.radarr.apiKey;
  const prowlarrApiKey =
    loadedConfig.config.instances.prowlarr.apiKey ?? persistedConnections.prowlarr.apiKey;
  const transmissionUsername =
    loadedConfig.config.instances.transmission.username ??
    persistedConnections.transmission.username;
  const transmissionPassword =
    loadedConfig.config.instances.transmission.password ??
    persistedConnections.transmission.password;

  const config: ResolvedConfig = {
    ...loadedConfig.config,
    auth: {
      ...loadedConfig.config.auth,
      sessionSecret,
    },
    instances: {
      sonarr: {
        ...loadedConfig.config.instances.sonarr,
        url: persistedConnections.sonarr.url ?? loadedConfig.config.instances.sonarr.url,
        apiKey: sonarrApiKey,
        fetchAllWantedPages: persistedConnections.sonarr.fetchAllWantedPages,
      },
      radarr: {
        ...loadedConfig.config.instances.radarr,
        url: persistedConnections.radarr.url ?? loadedConfig.config.instances.radarr.url,
        apiKey: radarrApiKey,
        fetchAllWantedPages: persistedConnections.radarr.fetchAllWantedPages,
      },
      prowlarr: {
        ...loadedConfig.config.instances.prowlarr,
        url:
          persistedConnections.prowlarr.url ?? loadedConfig.config.instances.prowlarr.url,
        apiKey: prowlarrApiKey,
      },
      transmission: {
        ...loadedConfig.config.instances.transmission,
        url:
          persistedConnections.transmission.url ??
          loadedConfig.config.instances.transmission.url,
        username: transmissionUsername,
        password: transmissionPassword,
      },
    },
    safety: {
      ...loadedConfig.config.safety,
      rollingSearchLimits: {
        per15m:
          persistedSearchSafetyOverrides.rollingSearchLimits.per15m ??
          loadedConfig.config.safety.rollingSearchLimits.per15m,
        per1h:
          persistedSearchSafetyOverrides.rollingSearchLimits.per1h ??
          loadedConfig.config.safety.rollingSearchLimits.per1h,
        per24h:
          persistedSearchSafetyOverrides.rollingSearchLimits.per24h ??
          loadedConfig.config.safety.rollingSearchLimits.per24h,
      },
    },
  };

  const redactedConfig: RedactedResolvedConfig = {
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

  return {
    config,
    redactedConfig,
    sessionSecretSource,
    connectionStatus: {
      sonarr: {
        service: 'sonarr',
        configured: Boolean(
          config.instances.sonarr.url && config.instances.sonarr.apiKey
        ),
        urlSource: persistedConnections.sonarr.url ? 'persisted' : 'config',
        secretSource: getSecretSource(
          loadedConfig.config.instances.sonarr.apiKey,
          Boolean(persistedConnections.sonarr.apiKey)
        ),
        summary: config.instances.sonarr.apiKey
          ? 'Ready to connect.'
          : 'URL is set, but the API key still needs to be configured.',
      },
      radarr: {
        service: 'radarr',
        configured: Boolean(
          config.instances.radarr.url && config.instances.radarr.apiKey
        ),
        urlSource: persistedConnections.radarr.url ? 'persisted' : 'config',
        secretSource: getSecretSource(
          loadedConfig.config.instances.radarr.apiKey,
          Boolean(persistedConnections.radarr.apiKey)
        ),
        summary: config.instances.radarr.apiKey
          ? 'Ready to connect.'
          : 'URL is set, but the API key still needs to be configured.',
      },
      prowlarr: {
        service: 'prowlarr',
        configured: Boolean(
          config.instances.prowlarr.url && config.instances.prowlarr.apiKey
        ),
        urlSource: persistedConnections.prowlarr.url ? 'persisted' : 'config',
        secretSource: getSecretSource(
          loadedConfig.config.instances.prowlarr.apiKey,
          Boolean(persistedConnections.prowlarr.apiKey)
        ),
        summary: config.instances.prowlarr.apiKey
          ? 'Ready to connect.'
          : 'URL is set, but the API key still needs to be configured.',
      },
      transmission: {
        service: 'transmission',
        configured: Boolean(config.instances.transmission.url),
        urlSource: persistedConnections.transmission.url ? 'persisted' : 'config',
        secretSource:
          loadedConfig.config.instances.transmission.username ||
          loadedConfig.config.instances.transmission.password
            ? 'env'
            : persistedConnections.transmission.username ||
                persistedConnections.transmission.password
              ? 'persisted'
              : 'none',
        summary: config.instances.transmission.username && config.instances.transmission.password
          ? 'Ready to connect using configured credentials.'
          : 'Ready to connect without credentials.',
      },
    },
  };
};

export const buildConnectionSettingsFromConfig = (
  config: ResolvedConfig
): PersistedConnectionSettings => {
  return {
    sonarr: {
      url: config.instances.sonarr.url,
      apiKey: config.instances.sonarr.apiKey,
      fetchAllWantedPages: config.instances.sonarr.fetchAllWantedPages,
    },
    radarr: {
      url: config.instances.radarr.url,
      apiKey: config.instances.radarr.apiKey,
      fetchAllWantedPages: config.instances.radarr.fetchAllWantedPages,
    },
    prowlarr: {
      url: config.instances.prowlarr.url,
      apiKey: config.instances.prowlarr.apiKey,
    },
    transmission: {
      url: config.instances.transmission.url,
      username: config.instances.transmission.username,
      password: config.instances.transmission.password,
    },
  };
};

export const buildSearchSafetyOverridesFromConfig = (
  config: ResolvedConfig,
  database: DatabaseContext
): PersistedSearchSafetyOverrides => {
  const persistedOverrides = ensurePersistedSearchSafetyOverrides(database);

  return {
    rollingSearchLimits: {
      per15m:
        persistedOverrides.rollingSearchLimits.per15m ??
        config.safety.rollingSearchLimits.per15m,
      per1h:
        persistedOverrides.rollingSearchLimits.per1h ??
        config.safety.rollingSearchLimits.per1h,
      per24h:
        persistedOverrides.rollingSearchLimits.per24h ??
        config.safety.rollingSearchLimits.per24h,
    },
  };
};
