import { NextResponse } from 'next/server';

import { probeDependencyHealth } from '@/src/server/console-data';
import { requireAuthenticatedConsoleContext } from '@/src/server/require-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const runtime = await requireAuthenticatedConsoleContext();
    const dependencyCards = await probeDependencyHealth(runtime);

    return NextResponse.json(
      { dependencyCards },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        dependencyCards: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  }
}
