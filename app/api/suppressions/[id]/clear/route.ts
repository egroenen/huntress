import { NextResponse } from 'next/server';

import { authenticateConsoleAction } from '@/src/server/require-action';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const suppressionId = Number.parseInt(id, 10);

  if (Number.isNaN(suppressionId) || suppressionId <= 0) {
    return NextResponse.redirect(new URL('/suppressions', request.url));
  }

  try {
    const { runtime } = await authenticateConsoleAction(
      request,
      `clear-suppression:${suppressionId}`
    );
    runtime.database.repositories.releaseSuppressions.clearById(suppressionId);

    return NextResponse.redirect(new URL('/suppressions', request.url));
  } catch {
    return NextResponse.redirect(new URL('/login', request.url));
  }
}
