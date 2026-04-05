'use server';

import type { Route } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import {
  bootstrapAdminUser,
  getSessionCookieOptions,
  isBootstrapRequired,
  loginUser,
  logoutSession,
  SESSION_COOKIE_NAME,
  verifyCsrfToken,
} from '@/src/auth';
import {
  createProwlarrClient,
  createRadarrClient,
  createSonarrClient,
  createTransmissionClient,
} from '@/src/integrations';
import { logger } from '@/src/observability';
import { getAppContext } from '@/src/server/app-context';
import {
  authenticateConsoleFormAction,
  type ActionName,
} from '@/src/server/require-action';
import {
  savePersistedConnectionSettings,
  savePersistedReleaseSelectionOverrides,
  savePersistedSearchSafetyOverrides,
  savePersistedSchedulerOverrides,
  type ConfigurableServiceName,
  buildConnectionSettingsFromConfig,
} from '@/src/server/runtime-config';
import {
  recoverActiveRun,
  runManualCycle,
  runManualFetch,
} from '@/src/server/runtime';
import {
  isServiceConfigured,
  parseConnectionSettingsForm,
  parseReleaseSelectionOverridesForm,
  parseSearchSafetyOverridesForm,
  parseSchedulerOverridesForm,
} from '@/src/server/settings-form';
import { formatServiceName } from '@/src/ui/formatters';

interface ManualFetchActionState {
  status: 'idle' | 'queued' | 'error';
  message: string | null;
  redirectTo: string | null;
}

const initialManualFetchActionState: ManualFetchActionState = {
  status: 'idle',
  message: null,
  redirectTo: null,
};

const buildPath = (
  pathname: string,
  params: Record<string, string | number | null | undefined>
): Route => {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') {
      continue;
    }

    searchParams.set(key, String(value));
  }

  const query = searchParams.toString();
  return (query ? `${pathname}?${query}` : pathname) as Route;
};

const normalizeErrorMessage = (error: unknown, fallback: string): string => {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : fallback;
};

const isAuthenticationError = (error: unknown): boolean => {
  return (
    error instanceof Error &&
    (
      error.message === 'Authentication required' ||
      error.message === 'Missing CSRF token' ||
      error.message === 'Invalid CSRF token'
    )
  );
};

const redirectToLogin = (notice = 'Please sign in again.') => {
  redirect(
    buildPath('/login', {
      status: 'error',
      notice,
    })
  );
};

const redirectForConsoleAuthenticationFailure = (error: unknown) => {
  logger.warn(
    {
      error,
      event: 'console_action_auth_failed',
    },
    'Console action authentication failed'
  );

  redirectToLogin();
};

const authenticateConsoleSubmission = async (
  formData: FormData,
  actionName: ActionName
) => {
  try {
    return await authenticateConsoleFormAction(formData, actionName);
  } catch (error) {
    redirectForConsoleAuthenticationFailure(error);
    throw error;
  }
};

const normalizeReturnTo = (value: FormDataEntryValue | null, fallback: string): string => {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();

  if (!trimmed.startsWith('/')) {
    return fallback;
  }

  return trimmed;
};

const clearSessionCookie = async () => {
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(0),
  });
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

const completeConsoleRunAction = async (
  formData: FormData,
  actionName: 'run-sync' | 'run-dry' | 'run-live',
  runType: 'sync_only' | 'manual_dry' | 'manual_live'
) => {
  await authenticateConsoleSubmission(formData, actionName);

  try {
    const result = await runManualCycle(runType);

    if (!result.accepted || !result.runId) {
      redirect(
        buildPath('/runs', {
          status: 'error',
          notice: 'Another run is already active. Recover it first if it is stuck.',
        })
      );
    }

    redirect(`/runs/${result.runId}`);
  } catch (error) {
    logger.error(
      {
        error,
        event: 'console_run_start_failed',
        actionName,
        runType,
      },
      'Failed to start console run'
    );

    redirect(
      buildPath('/runs', {
        status: 'error',
        notice: normalizeErrorMessage(error, 'Unable to start the requested run.'),
      })
    );
  }
};

export async function loginAction(formData: FormData) {
  const { config, database, requestMetadata } = await getAppContext();

  if (isBootstrapRequired(database)) {
    redirect('/setup');
  }

  const csrfToken = formData.get('csrfToken');
  const username = formData.get('username');
  const password = formData.get('password');

  if (
    typeof csrfToken !== 'string' ||
    !verifyCsrfToken(csrfToken, 'login', config.auth.sessionSecret)
  ) {
    redirect(
      buildPath('/login', {
        status: 'error',
        notice: 'Your sign-in form expired. Please try again.',
      })
    );
  }

  if (typeof username !== 'string' || typeof password !== 'string') {
    redirect(
      buildPath('/login', {
        status: 'error',
        notice: 'Username and password are required.',
      })
    );
  }

  try {
    const authenticated = await loginUser(
      database,
      {
        sessionSecret: config.auth.sessionSecret,
        sessionAbsoluteTtlMs: config.auth.sessionAbsoluteTtlMs,
        sessionIdleTtlMs: config.auth.sessionIdleTtlMs,
      },
      {
        username,
        password,
        requestMetadata,
      }
    );

    const cookieStore = await cookies();
    cookieStore.set(
      SESSION_COOKIE_NAME,
      authenticated.cookieValue,
      getSessionCookieOptions({
        sessionSecret: config.auth.sessionSecret,
        sessionAbsoluteTtlMs: config.auth.sessionAbsoluteTtlMs,
        sessionIdleTtlMs: config.auth.sessionIdleTtlMs,
      })
    );
  } catch (error) {
    redirect(
      buildPath('/login', {
        status: 'error',
        notice: normalizeErrorMessage(error, 'Unable to sign in.'),
      })
    );
  }

  redirect('/');
}

export async function setupAction(formData: FormData) {
  const { config, database, requestMetadata } = await getAppContext();

  if (!isBootstrapRequired(database)) {
    redirect('/login');
  }

  const csrfToken = formData.get('csrfToken');
  const username = formData.get('username');
  const password = formData.get('password');
  const confirmPassword = formData.get('confirmPassword');

  if (
    typeof csrfToken !== 'string' ||
    !verifyCsrfToken(csrfToken, 'setup', config.auth.sessionSecret)
  ) {
    redirect(
      buildPath('/setup', {
        status: 'error',
        notice: 'Your setup form expired. Please try again.',
      })
    );
  }

  if (
    typeof username !== 'string' ||
    typeof password !== 'string' ||
    typeof confirmPassword !== 'string'
  ) {
    redirect(
      buildPath('/setup', {
        status: 'error',
        notice: 'All setup fields are required.',
      })
    );
  }

  if (password !== confirmPassword) {
    redirect(
      buildPath('/setup', {
        status: 'error',
        notice: 'Passwords do not match.',
      })
    );
  }

  try {
    const authenticated = await bootstrapAdminUser(
      database,
      {
        sessionSecret: config.auth.sessionSecret,
        sessionAbsoluteTtlMs: config.auth.sessionAbsoluteTtlMs,
        sessionIdleTtlMs: config.auth.sessionIdleTtlMs,
      },
      {
        username,
        password,
        requestMetadata,
      }
    );

    const cookieStore = await cookies();
    cookieStore.set(
      SESSION_COOKIE_NAME,
      authenticated.cookieValue,
      getSessionCookieOptions({
        sessionSecret: config.auth.sessionSecret,
        sessionAbsoluteTtlMs: config.auth.sessionAbsoluteTtlMs,
        sessionIdleTtlMs: config.auth.sessionIdleTtlMs,
      })
    );
  } catch (error) {
    redirect(
      buildPath('/setup', {
        status: 'error',
        notice: normalizeErrorMessage(error, 'Unable to create the admin account.'),
      })
    );
  }

  redirect('/');
}

export async function logoutAction(formData: FormData) {
  const { config, database, cookieStore } = await getAppContext();
  const signedSessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const sessionId = signedSessionCookie
    ? signedSessionCookie.slice(0, signedSessionCookie.lastIndexOf('.'))
    : null;
  const csrfToken = formData.get('csrfToken');

  if (
    !sessionId ||
    typeof csrfToken !== 'string' ||
    !verifyCsrfToken(csrfToken, `logout:${sessionId}`, config.auth.sessionSecret)
  ) {
    await clearSessionCookie();
    redirect(
      buildPath('/login', {
        status: 'error',
        notice: 'Your session expired. Please sign in again.',
      })
    );
  }

  try {
    logoutSession(
      database,
      {
        sessionSecret: config.auth.sessionSecret,
        sessionAbsoluteTtlMs: config.auth.sessionAbsoluteTtlMs,
        sessionIdleTtlMs: config.auth.sessionIdleTtlMs,
      },
      signedSessionCookie
    );
  } catch (error) {
    logger.error(
      {
        error,
        event: 'logout_failed',
      },
      'Failed to log out cleanly'
    );
  }

  await clearSessionCookie();
  redirect('/login');
}

export async function runSyncAction(formData: FormData) {
  await completeConsoleRunAction(formData, 'run-sync', 'sync_only');
}

export async function runDryAction(formData: FormData) {
  await completeConsoleRunAction(formData, 'run-dry', 'manual_dry');
}

export async function runLiveAction(formData: FormData) {
  await completeConsoleRunAction(formData, 'run-live', 'manual_live');
}

export async function recoverRunAction(formData: FormData) {
  await authenticateConsoleSubmission(formData, 'recover-run');

  try {
    const result = await recoverActiveRun('Operator requested recovery from the status page');

    redirect(
      buildPath('/status', {
        status: result.recovered ? 'success' : 'error',
        notice: result.recovered
          ? 'Recovered the active run and released the scheduler lock.'
          : 'No active run needed recovery.',
      })
    );
  } catch (error) {
    logger.error(
      {
        error,
        event: 'recover_run_failed',
      },
      'Failed to recover active run'
    );

    redirect(
      buildPath('/status', {
        status: 'error',
        notice: normalizeErrorMessage(error, 'Unable to recover the active run.'),
      })
    );
  }
}

export async function resetTransmissionCacheAction(formData: FormData) {
  const { runtime } = await authenticateConsoleSubmission(
    formData,
    'reset-transmission-cache'
  );

  try {
    runtime.database.repositories.transmissionTorrentState.deleteAll();
  } catch (error) {
    logger.error(
      {
        error,
        event: 'transmission_cache_reset_failed',
      },
      'Failed to reset Transmission cache'
    );

    redirect(
      buildPath('/transmission', {
        status: 'error',
        notice: normalizeErrorMessage(error, 'Unable to clear the Transmission cache.'),
      })
    );
  }

  redirect(
    buildPath('/transmission', {
      status: 'success',
      notice: 'Transmission cache cleared. The next sync will rebuild observations.',
    })
  );
}

export async function clearSelectedSuppressionsAction(formData: FormData) {
  const { runtime } = await authenticateConsoleSubmission(
    formData,
    'clear-suppressions'
  );
  const ids = formData
    .getAll('suppressionIds')
    .map((value) => Number.parseInt(String(value), 10))
    .filter((value) => Number.isInteger(value) && value > 0);
  const returnTo = normalizeReturnTo(formData.get('returnTo'), '/suppressions');

  if (ids.length === 0) {
    redirect(
      buildPath(returnTo, {
        status: 'error',
        notice: 'Select at least one suppression to clear.',
      })
    );
  }

  try {
    const clearedCount = runtime.database.repositories.releaseSuppressions.clearByIds(ids);

    redirect(
      buildPath(returnTo, {
        status: 'success',
        notice:
          clearedCount === 1
            ? 'Cleared 1 suppression.'
            : `Cleared ${clearedCount} suppressions.`,
      })
    );
  } catch (error) {
    logger.error(
      {
        error,
        event: 'clear_suppressions_failed',
        suppressionIds: ids,
      },
      'Failed to clear suppressions'
    );

    redirect(
      buildPath('/suppressions', {
        status: 'error',
        notice: normalizeErrorMessage(error, 'Unable to clear suppressions.'),
      })
    );
  }
}

export async function clearSuppressionAction(suppressionId: number, formData: FormData) {
  if (!Number.isInteger(suppressionId) || suppressionId <= 0) {
    redirect('/suppressions');
  }

  const { runtime } = await authenticateConsoleSubmission(
    formData,
    `clear-suppression:${suppressionId}`
  );

  try {
    runtime.database.repositories.releaseSuppressions.clearById(suppressionId);
  } catch (error) {
    logger.error(
      {
        error,
        event: 'clear_suppression_failed',
        suppressionId,
      },
      'Failed to clear suppression'
    );

    redirect(
      buildPath('/suppressions', {
        status: 'error',
        notice: normalizeErrorMessage(error, 'Unable to clear the suppression.'),
      })
    );
  }

  redirect(
    buildPath('/suppressions', {
      status: 'success',
      notice: 'Suppression cleared.',
    })
  );
}

export async function saveSettingsAction(formData: FormData) {
  const { runtime } = await authenticateConsoleSubmission(formData, 'save-settings');

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

export async function testConnectionAction(
  service: ConfigurableServiceName,
  formData: FormData
) {
  const { runtime } = await authenticateConsoleSubmission(
    formData,
    `test-connection:${service}`
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

export async function manualFetchAction(
  previousState: ManualFetchActionState = initialManualFetchActionState,
  formData: FormData
): Promise<ManualFetchActionState> {
  void previousState;
  let runtime: Awaited<ReturnType<typeof authenticateConsoleFormAction>>['runtime'] | null =
    null;

  try {
    const authenticated = await authenticateConsoleFormAction(formData, 'manual-fetch');
    runtime = authenticated.runtime;
  } catch (error) {
    logger.warn(
      {
        error,
        event: 'manual_fetch_auth_failed',
      },
      'Manual fetch authentication failed'
    );

    return {
      status: 'error',
      message: isAuthenticationError(error)
        ? 'Your session expired. Redirecting to login.'
        : 'Manual fetch could not be verified.',
      redirectTo: isAuthenticationError(error)
        ? buildPath('/login', {
            status: 'error',
            notice: 'Please sign in again.',
          })
        : null,
    };
  }

  const mediaKey = formData.get('mediaKey');

  if (typeof mediaKey !== 'string' || mediaKey.trim().length === 0) {
    return {
      status: 'error',
      message: 'Select an item before requesting a manual fetch.',
      redirectTo: null,
    };
  }

  try {
    const result = await runManualFetch(mediaKey.trim());

    if (!result.accepted || !result.runId) {
      return {
        status: 'error',
        message:
          result.reason === 'not-live'
            ? 'Manual fetch is only available while live dispatch mode is enabled.'
            : 'Manual fetch was rejected. Try again after the current work settles.',
        redirectTo: null,
      };
    }

    return {
      status: 'queued',
      message: null,
      redirectTo: `/runs/${result.runId}`,
    };
  } catch (error) {
    logger.error(
      {
        error,
        event: 'manual_fetch_failed',
        mediaKey,
        mode: runtime?.config.mode ?? null,
      },
      'Manual fetch failed'
    );

    return {
      status: 'error',
      message: normalizeErrorMessage(error, 'Manual fetch failed. Please retry.'),
      redirectTo: null,
    };
  }
}
