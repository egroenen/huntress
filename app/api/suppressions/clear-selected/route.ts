import { NextResponse } from 'next/server';

import { authenticateConsoleAction } from '@/src/server/require-action';

export const dynamic = 'force-dynamic';

const buildRedirect = (request: Request, returnTo: string, params: Record<string, string>) => {
  const fallbackUrl = new URL('/suppressions', request.url);
  const redirectUrl = returnTo ? new URL(returnTo, request.url) : fallbackUrl;

  for (const [key, value] of Object.entries(params)) {
    redirectUrl.searchParams.set(key, value);
  }

  return NextResponse.redirect(redirectUrl);
};

export async function POST(request: Request) {
  try {
    const { runtime, formData } = await authenticateConsoleAction(
      request,
      'clear-suppressions'
    );
    const ids = formData
      .getAll('suppressionIds')
      .map((value) => Number.parseInt(String(value), 10))
      .filter((value) => Number.isInteger(value) && value > 0);
    const returnTo =
      typeof formData.get('returnTo') === 'string' ? String(formData.get('returnTo')) : '/suppressions';

    if (ids.length === 0) {
      return buildRedirect(request, returnTo, {
        status: 'error',
        notice: 'Select at least one suppression to clear.',
      });
    }

    const clearedCount = runtime.database.repositories.releaseSuppressions.clearByIds(ids);

    return buildRedirect(request, returnTo, {
      status: 'success',
      notice:
        clearedCount === 1
          ? 'Cleared 1 suppression.'
          : `Cleared ${clearedCount} suppressions.`,
    });
  } catch (error) {
    const fallbackReturnTo = new URL('/suppressions', request.url).pathname;

    return buildRedirect(request, fallbackReturnTo, {
      status: 'error',
      notice: error instanceof Error ? error.message : 'Unable to clear suppressions.',
    });
  }
}
