import 'server-only';

import type {
  PersistedConnectionSettings,
  ConfigurableServiceName,
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

export const isServiceConfigured = (
  service: ConfigurableServiceName,
  settings: PersistedConnectionSettings
): boolean => {
  if (service === 'transmission') {
    return Boolean(
      settings.transmission.url &&
      settings.transmission.username &&
      settings.transmission.password
    );
  }

  return Boolean(settings[service].url && settings[service].apiKey);
};
