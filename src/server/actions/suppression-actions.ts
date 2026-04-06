import { redirect } from 'next/navigation';

import { logger } from '@/src/observability';

import {
  authenticateConsoleSubmission,
  buildPath,
  normalizeErrorMessage,
  normalizeReturnTo,
} from './shared';

export async function clearSelectedSuppressionsConsoleAction(formData: FormData) {
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

export async function clearAllMatchingSuppressionsConsoleAction(formData: FormData) {
  const { runtime } = await authenticateConsoleSubmission(
    formData,
    'clear-suppressions'
  );
  const returnTo = normalizeReturnTo(formData.get('returnTo'), '/suppressions');
  const queryValue = formData.get('q');
  const query = typeof queryValue === 'string' ? queryValue.trim() : '';

  try {
    const clearedCount = runtime.database.repositories.releaseSuppressions.clearActiveFiltered(
      new Date().toISOString(),
      { query }
    );

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
        event: 'clear_matching_suppressions_failed',
        query,
      },
      'Failed to clear matching suppressions'
    );

    redirect(
      buildPath('/suppressions', {
        status: 'error',
        notice: normalizeErrorMessage(
          error,
          'Unable to clear the matching suppressions.'
        ),
      })
    );
  }
}

export async function clearSuppressionConsoleAction(
  suppressionId: number,
  formData: FormData
) {
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
