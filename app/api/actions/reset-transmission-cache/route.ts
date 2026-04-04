import { NextResponse } from 'next/server';

import { authenticateConsoleAction } from '@/src/server/require-action';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { runtime } = await authenticateConsoleAction(
      request,
      'reset-transmission-cache'
    );

    runtime.database.repositories.transmissionTorrentState.deleteAll();

    return NextResponse.redirect(new URL('/transmission?state=cache-reset', request.url));
  } catch {
    return NextResponse.redirect(new URL('/login', request.url));
  }
}
