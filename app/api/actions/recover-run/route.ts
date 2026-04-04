import { NextResponse } from 'next/server';

import { authenticateConsoleAction } from '@/src/server/require-action';
import { recoverActiveRun } from '@/src/server/runtime';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    await authenticateConsoleAction(request, 'recover-run');
    const result = await recoverActiveRun('Operator requested recovery from the status page');

    return NextResponse.redirect(
      new URL(result.recovered ? '/status?state=recovered' : '/status?state=idle', request.url)
    );
  } catch {
    return NextResponse.redirect(new URL('/login', request.url));
  }
}
