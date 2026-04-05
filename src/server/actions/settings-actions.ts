import { redirect } from 'next/navigation';

import {
  createProwlarrClient,
  createRadarrClient,
  createSonarrClient,
  createTransmissionClient,
} from '@/src/integrations';
import { logger } from '@/src/observability';
import {
  buildConnectionSettingsFromConfig,
  savePersistedConnectionSettings,
  savePersistedReleaseSelectionOverrides,
  savePersistedSearchSafetyOverrides,
  savePersistedSchedulerOverrides,
  type ConfigurableServiceName,
} from '@/src/server/runtime-config';
import {
  isServiceConfigured,
  parseConnectionSettingsForm,
  parseReleaseSelectionOverridesForm,
  parseSearchSafetyOverridesForm,
  parseSchedulerOverridesForm,
} from '@/src/server/settings-form';
import { formatServiceName } from '@/src/ui/formatters';

import {
  authenticateConsoleSubmission,
  buildPath,
  normalizeErrorMessage,
} from './shared';

async function testConnection(
  service: ConfigurableServiceName,
  settings: ReturnType<typeof buildConnectionSettingsFromConfig>
) {
  switch (service) {
    case 'sonarr': {
      const client = createSonarrClient({
        baseUrl: settings.sonarr.url ?? '',
        apiKey: settings.sonarr.apiKey ?? '',
      });
      return client.probeSystemStatus();
    }
    case 'radarr': {
      const client = createRadarrClient({
        baseUrl: settings.radarr.url ?? '',
        apiKey: settings.radarr.apiKey ?? '',
      });
      return client.probeSystemStatus();
    }
    case 'prowlarr': {
      const client = createProwlarrClient({
        baseUrl: settings.prowlarr.url ?? '',
        apiKey: settings.prowlarr.apiKey ?? '',
      });
      await Promise.all([client.getHealth(), client.getIndexerStatus()]);
      return null;
    }
    case 'transmission': {
      const client = createTransmissionClient({
        baseUrl: settings.transmission.url ?? '',
        username: settings.transmission.username ?? '',
        password: settings.transmission.password ?? '',
      });
      return client.probeSession();
    }
  }
}

export async function saveSettingsConsoleAction(formData: FormData) {
  const { runtime } = await authenticateConsoleSubmission(formData, 'save-settings', {
    csrfFieldName: 'saveSettingsCsrfToken',
  });

  try {
    const nextSettings = parseConnectionSettingsForm(formData);
    const nextOverrides = parseSearchSafetyOverridesForm(formData);
    const nextSchedulerOverrides = parseSchedulerOverridesForm(formData);
    const nextReleaseSelectionOverrides =
      parseReleaseSelectionOverridesForm(formData);

    const savedSchedulerOverrides = runtime.database.connection.transaction(() => {
      savePersistedConnectionSettings(runtime.database, nextSettings);
      savePersistedSearchSafetyOverrides(runtime.database, nextOverrides);
      const savedOverrides = savePersistedSchedulerOverrides(
        runtime.database,
        nextSchedulerOverrides
      );
      savePersistedReleaseSelectionOverrides(
        runtime.database,
        runtime.config,
        nextReleaseSelectionOverrides
      );

      return savedOverrides;
    })();

    runtime.scheduler.updateCadence(
      Math.max(
        savedSchedulerOverrides.cycleEveryMinutes ??
          Math.round(runtime.config.scheduler.cycleEveryMs / 60_000),
        1
      ) * 60_000
    );
  } catch (error) {
    logger.error(
      {
        error,
        event: 'save_settings_failed',
      },
      'Failed to save settings'
    );

    redirect(
      buildPath('/settings', {
        status: 'error',
        notice: normalizeErrorMessage(error, 'Unable to save settings.'),
      })
    );
  }

  redirect(
    buildPath('/settings', {
      status: 'success',
      notice: 'Settings saved.',
    })
  );
}

export async function testSettingsConnectionAction(
  service: ConfigurableServiceName,
  formData: FormData
) {
  const { runtime } = await authenticateConsoleSubmission(
    formData,
    `test-connection:${service}`,
    {
      csrfFieldName: `test${service[0]?.toUpperCase()}${service.slice(1)}CsrfToken`,
    }
  );

  try {
    const submittedSettings = parseConnectionSettingsForm(formData);
    const effectiveSettings = {
      ...buildConnectionSettingsFromConfig(runtime.config),
      ...submittedSettings,
    };

    if (!isServiceConfigured(service, effectiveSettings)) {
      redirect(
        buildPath('/settings', {
          testService: service,
          testStatus: 'error',
          testNotice: `Please complete the ${formatServiceName(service)} connection fields before testing.`,
        })
      );
    }

    const result = await testConnection(service, effectiveSettings);
    let detail: string | null = null;

    if (
      (service === 'sonarr' || service === 'radarr') &&
      result &&
      'appName' in result
    ) {
      detail = `${result.appName ?? formatServiceName(service)} ${result.version ?? ''}`.trim();
    } else if (service === 'transmission' && result) {
      detail = `${result.version ?? 'Transmission'} reachable`;
    } else if (service === 'prowlarr') {
      detail = 'Health and indexer probes succeeded.';
    }

    redirect(
      buildPath('/settings', {
        testService: service,
        testStatus: 'success',
        testNotice: `${formatServiceName(service)} connection test succeeded`,
        testDetail: detail,
      })
    );
  } catch (error) {
    logger.warn(
      {
        error,
        event: 'test_connection_failed',
        service,
      },
      'Connection test failed'
    );

    redirect(
      buildPath('/settings', {
        testService: service,
        testStatus: 'error',
        testNotice: normalizeErrorMessage(error, 'Connection test failed.'),
      })
    );
  }
}
