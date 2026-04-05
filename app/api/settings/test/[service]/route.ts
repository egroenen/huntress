import { NextResponse } from 'next/server';

import {
  createProwlarrClient,
  createRadarrClient,
  createSonarrClient,
  createTransmissionClient,
} from '@/src/integrations';
import {
  type ConfigurableServiceName,
  buildConnectionSettingsFromConfig,
} from '@/src/server/runtime-config';
import {
  isServiceConfigured,
  parseConnectionSettingsForm,
} from '@/src/server/settings-form';
import { authenticateConsoleAction } from '@/src/server/require-action';
import { formatServiceName } from '@/src/ui/formatters';

export const dynamic = 'force-dynamic';

const buildRedirect = (
  request: Request,
  params: Record<string, string>
): NextResponse => {
  const url = new URL('/settings', request.url);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return NextResponse.redirect(url);
};

const normalizeService = (value: string): ConfigurableServiceName | null => {
  if (
    value === 'sonarr' ||
    value === 'radarr' ||
    value === 'prowlarr' ||
    value === 'transmission'
  ) {
    return value;
  }

  return null;
};

const testConnection = async (
  service: ConfigurableServiceName,
  settings: ReturnType<typeof buildConnectionSettingsFromConfig>
) => {
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
};

export async function POST(
  request: Request,
  context: { params: Promise<{ service: string }> }
) {
  const params = await context.params;
  const service = normalizeService(params.service);

  if (!service) {
    return buildRedirect(request, {
      status: 'error',
      notice: 'Unknown service selected for connection test.',
    });
  }

  try {
    const { runtime, formData } = await authenticateConsoleAction(
      request,
      `test-connection:${service}`
    );
    const submittedSettings = parseConnectionSettingsForm(formData);
    const effectiveSettings = {
      ...buildConnectionSettingsFromConfig(runtime.config),
      ...submittedSettings,
    };

    if (!isServiceConfigured(service, effectiveSettings)) {
      return buildRedirect(request, {
        testService: service,
        testStatus: 'error',
        testNotice: `Please complete the ${formatServiceName(service)} connection fields before testing.`,
      });
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

    return buildRedirect(request, {
      testService: service,
      testStatus: 'success',
      testNotice: `${formatServiceName(service)} connection test succeeded`,
      ...(detail ? { testDetail: detail } : {}),
    });
  } catch (error) {
    return buildRedirect(request, {
      testService: service,
      testStatus: 'error',
      testNotice: error instanceof Error ? error.message : 'Connection test failed',
    });
  }
}
