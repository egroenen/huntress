import { NextResponse } from 'next/server';

import { authenticateConsoleAction } from '@/src/server/require-action';
import { runManualCycle } from '@/src/server/runtime';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    await authenticateConsoleAction(request, 'run-live');
    const result = await runManualCycle('manual_live');

    if (!result.accepted || !result.runId) {
      return NextResponse.redirect(new URL('/runs?state=busy', request.url));
    }

    return NextResponse.redirect(new URL(`/runs/${result.runId}`, request.url));
  } catch {
    return NextResponse.redirect(new URL('/login', request.url));
  }
}
