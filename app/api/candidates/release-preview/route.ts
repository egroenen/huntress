import { NextResponse } from 'next/server';

import type { CandidateDecision } from '@/src/domain';
import { getCandidateReleasePreviewMap } from '@/src/server/console-data';
import { requireAuthenticatedConsoleContext } from '@/src/server/require-auth';

export const dynamic = 'force-dynamic';

interface CandidatePreviewRequestItem {
  mediaKey: string;
  app: CandidateDecision['app'];
}

const toDispatchCandidate = (
  item: CandidatePreviewRequestItem
): CandidateDecision => ({
  mediaKey: item.mediaKey,
  app: item.app,
  title: item.mediaKey,
  wantedState: 'missing',
  decision: 'dispatch',
  reasonCode: 'ELIGIBLE_MISSING_RECENT',
  priorityBucket: null,
  retryCount: 0,
  nextEligibleAt: null,
  sortKey: null,
});

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      candidates?: CandidatePreviewRequestItem[];
    };
    const candidates =
      body.candidates?.filter(
        (candidate): candidate is CandidatePreviewRequestItem =>
          Boolean(candidate?.mediaKey) &&
          (candidate?.app === 'sonarr' || candidate?.app === 'radarr')
      ) ?? [];

    if (candidates.length === 0) {
      return NextResponse.json(
        { previews: {} },
        {
          headers: {
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    const runtime = await requireAuthenticatedConsoleContext();
    const previewMap = await getCandidateReleasePreviewMap(
      runtime,
      candidates.map(toDispatchCandidate)
    );

    return NextResponse.json(
      { previews: Object.fromEntries(previewMap) },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        previews: {},
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
