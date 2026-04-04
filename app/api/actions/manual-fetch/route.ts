import { NextResponse } from 'next/server';

import { authenticateConsoleAction } from '@/src/server/require-action';
import { runManualFetch } from '@/src/server/runtime';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { formData } = await authenticateConsoleAction(request, 'manual-fetch');
    const mediaKey = formData.get('mediaKey');

    if (typeof mediaKey !== 'string' || mediaKey.trim().length === 0) {
      return NextResponse.redirect(new URL('/candidates?state=missing-media-key', request.url));
    }

    const result = await runManualFetch(mediaKey.trim());

    if (!result.accepted || !result.runId) {
      return NextResponse.redirect(new URL('/candidates?state=manual-fetch-rejected', request.url));
    }

    return NextResponse.redirect(new URL(`/runs/${result.runId}`, request.url));
  } catch {
    return NextResponse.redirect(new URL('/login', request.url));
  }
}
