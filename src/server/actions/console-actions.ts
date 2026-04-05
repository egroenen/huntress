import { redirect } from 'next/navigation';

import { logger } from '@/src/observability';
import { recoverActiveRun, runManualCycle } from '@/src/server/runtime';

import {
  authenticateConsoleSubmission,
  buildPath,
  normalizeErrorMessage,
} from './shared';

async function completeConsoleRunAction(
  formData: FormData,
  actionName: 'run-sync' | 'run-dry' | 'run-live',
  runType: 'sync_only' | 'manual_dry' | 'manual_live'
) {
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

    redirect(buildPath(`/runs/${result.runId}`, {}));
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
}

export async function runSyncConsoleAction(formData: FormData) {
  await completeConsoleRunAction(formData, 'run-sync', 'sync_only');
}

export async function runDryConsoleAction(formData: FormData) {
  await completeConsoleRunAction(formData, 'run-dry', 'manual_dry');
}

export async function runLiveConsoleAction(formData: FormData) {
  await completeConsoleRunAction(formData, 'run-live', 'manual_live');
}

export async function recoverRunConsoleAction(formData: FormData) {
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

export async function resetTransmissionCacheConsoleAction(formData: FormData) {
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
