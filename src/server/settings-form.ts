import 'server-only';

import type {
  PersistedConnectionSettings,
  ConfigurableServiceName,
  PersistedReleaseSelectionOverrides,
  PersistedSearchSafetyOverrides,
} from './runtime-config';

const readString = (formData: FormData, key: string): string | null => {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() || null : null;
};

const readCheckbox = (formData: FormData, key: string): boolean => {
  return formData.get(key) === 'on';
};

export const parseConnectionSettingsForm = (
  formData: FormData
): PersistedConnectionSettings => {
  return {
    sonarr: {
      url: readString(formData, 'sonarrUrl'),
      apiKey: readString(formData, 'sonarrApiKey'),
      fetchAllWantedPages: readCheckbox(formData, 'sonarrFetchAllPages'),
    },
    radarr: {
      url: readString(formData, 'radarrUrl'),
      apiKey: readString(formData, 'radarrApiKey'),
      fetchAllWantedPages: readCheckbox(formData, 'radarrFetchAllPages'),
    },
    prowlarr: {
      url: readString(formData, 'prowlarrUrl'),
      apiKey: readString(formData, 'prowlarrApiKey'),
    },
    transmission: {
      url: readString(formData, 'transmissionUrl'),
      username: readString(formData, 'transmissionUsername'),
      password: readString(formData, 'transmissionPassword'),
    },
  };
};

const readPositiveInteger = (formData: FormData, key: string): number | null => {
  const value = formData.get(key);

  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive whole number`);
  }

  return parsed;
};

export const parseSearchSafetyOverridesForm = (
  formData: FormData
): PersistedSearchSafetyOverrides => {
  return {
    rollingSearchLimits: {
      per15m: readPositiveInteger(formData, 'rollingLimit15m'),
      per1h: readPositiveInteger(formData, 'rollingLimit1h'),
      per24h: readPositiveInteger(formData, 'rollingLimit24h'),
    },
  };
};

export const parseReleaseSelectionOverridesForm = (
  formData: FormData
): PersistedReleaseSelectionOverrides => {
  const readStrategy = (
    key: string
  ): PersistedReleaseSelectionOverrides['sonarr']['strategy'] => {
    const value = formData.get(key);

    if (
      value === 'best_only' ||
      value === 'good_enough_now' ||
      value === 'fallback_then_upgrade'
    ) {
      return value;
    }

    throw new Error(`${key} must be a valid release selection strategy`);
  };

  const buildAppOverride = (
    prefix: 'sonarr' | 'radarr'
  ): PersistedReleaseSelectionOverrides['sonarr'] => ({
    enabled: readCheckbox(formData, `${prefix}ReleaseSelectionEnabled`),
    strategy: readStrategy(`${prefix}ReleaseSelectionStrategy`),
    preferredMinResolution: readPositiveInteger(
      formData,
      `${prefix}PreferredMinResolution`
    )!,
    fallbackMinResolution: readPositiveInteger(
      formData,
      `${prefix}FallbackMinResolution`
    )!,
    minimumSeeders: readPositiveInteger(formData, `${prefix}MinimumSeeders`)!,
    minimumCustomFormatScore: (() => {
      const value = formData.get(`${prefix}MinimumCustomFormatScore`);

      if (typeof value !== 'string') {
        throw new Error(`${prefix}MinimumCustomFormatScore is required`);
      }

      const normalized = value.trim();
      const parsed = Number.parseInt(normalized, 10);

      if (!Number.isInteger(parsed)) {
        throw new Error(`${prefix}MinimumCustomFormatScore must be a whole number`);
      }

      return parsed;
    })(),
    requireEnglish: readCheckbox(formData, `${prefix}RequireEnglish`),
    upgradeRetryAfterFallbackMs:
      readPositiveInteger(formData, `${prefix}UpgradeRetryAfterFallbackMinutes`)! *
      60_000,
  });

  return {
    sonarr: buildAppOverride('sonarr'),
    radarr: buildAppOverride('radarr'),
  };
};

export const isServiceConfigured = (
  service: ConfigurableServiceName,
  settings: PersistedConnectionSettings
): boolean => {
  if (service === 'transmission') {
    return Boolean(settings.transmission.url);
  }

  return Boolean(settings[service].url && settings[service].apiKey);
};
