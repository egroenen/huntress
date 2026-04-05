import { NextResponse } from 'next/server';

import { authenticateConsoleAction } from '@/src/server/require-action';
import { runManualFetch } from '@/src/server/runtime';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const wantsJson = request.headers.get('accept')?.includes('application/json') ?? false;

  try {
    const { formData } = await authenticateConsoleAction(request, 'manual-fetch');
    const mediaKey = formData.get('mediaKey');

    if (typeof mediaKey !== 'string' || mediaKey.trim().length === 0) {
      if (wantsJson) {
        return Response.json(
          { accepted: false, reason: 'missing-media-key' },
          { status: 400 }
        );
      }

      return NextResponse.redirect(new URL('/candidates?state=missing-media-key', request.url));
    }

    const result = await runManualFetch(mediaKey.trim());

    if (!result.accepted || !result.runId) {
      if (wantsJson) {
        return Response.json(
          {
            accepted: false,
            reason: result.reason ?? 'manual-fetch-rejected',
          },
          { status: 409 }
        );
      }

      return NextResponse.redirect(new URL('/candidates?state=manual-fetch-rejected', request.url));
    }

    if (wantsJson) {
      return Response.json({
        accepted: true,
        runId: result.runId,
        redirectTo: `/runs/${result.runId}`,
      });
    }

    return NextResponse.redirect(new URL(`/runs/${result.runId}`, request.url));
  } catch {
    if (wantsJson) {
      return Response.json(
        {
          accepted: false,
          reason: 'authentication-required',
        },
        { status: 401 }
      );
    }

    return NextResponse.redirect(new URL('/login', request.url));
  }
}
