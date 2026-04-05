import { logger } from '@/src/observability';
import { authenticateConsoleFormAction } from '@/src/server/require-action';
import { runManualFetch } from '@/src/server/runtime';

import { buildPath, isAuthenticationError, normalizeErrorMessage } from './shared';

export interface ManualFetchActionState {
  status: 'idle' | 'queued' | 'error';
  message: string | null;
  redirectTo: string | null;
}

export const initialManualFetchActionState: ManualFetchActionState = {
  status: 'idle',
  message: null,
  redirectTo: null,
};

export async function runManualFetchAction(
  previousState: ManualFetchActionState = initialManualFetchActionState,
  formData: FormData
): Promise<ManualFetchActionState> {
  void previousState;
  let mode: 'dry-run' | 'live' | null = null;

  try {
    const authenticated = await authenticateConsoleFormAction(formData, 'manual-fetch');
    mode = authenticated.runtime.config.mode;
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
      redirectTo: buildPath(`/runs/${result.runId}`, {}),
    };
  } catch (error) {
    logger.error(
      {
        error,
        event: 'manual_fetch_failed',
        mediaKey,
        mode,
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
