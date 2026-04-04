import 'server-only';

import type {
  PersistedConnectionSettings,
  ConfigurableServiceName,
  PersistedSearchSafetyOverrides,
} from './runtime-config';

const readString = (formData: FormData, key: string): string | null => {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() || null : null;
};

export const parseConnectionSettingsForm = (
  formData: FormData
): PersistedConnectionSettings => {
  return {
    sonarr: {
      url: readString(formData, 'sonarrUrl'),
      apiKey: readString(formData, 'sonarrApiKey'),
    },
    radarr: {
      url: readString(formData, 'radarrUrl'),
      apiKey: readString(formData, 'radarrApiKey'),
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

export const isServiceConfigured = (
  service: ConfigurableServiceName,
  settings: PersistedConnectionSettings
): boolean => {
  if (service === 'transmission') {
    return Boolean(settings.transmission.url);
  }

  return Boolean(settings[service].url && settings[service].apiKey);
};
