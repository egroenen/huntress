import { NextResponse } from 'next/server';

import { authenticateConsoleAction } from '@/src/server/require-action';
import { runManualCycle } from '@/src/server/runtime';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    await authenticateConsoleAction(request, 'run-sync');
    const result = await runManualCycle('sync_only');

    if (!result.accepted || !result.runId) {
      return NextResponse.redirect(new URL('/runs?state=busy', request.url));
    }

    return NextResponse.redirect(new URL(`/runs/${result.runId}`, request.url));
  } catch {
    return NextResponse.redirect(new URL('/login', request.url));
  }
}
