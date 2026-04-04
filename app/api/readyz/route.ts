import { NextResponse } from 'next/server';

import { probeDependencyHealth } from '@/src/server/console-data';
import { getRuntimeContext } from '@/src/server/runtime';
import {
  getReadinessSnapshot,
  logger,
  updateActiveSuppressionsMetric,
  updateDependencyHealthMetrics,
  updateSearchRateMetrics,
} from '@/src/observability';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const runtime = await getRuntimeContext();
    const dependencyCards = await probeDependencyHealth(runtime);
    const readiness = await getReadinessSnapshot({
      runtime,
      dependencyCards,
    });

    updateDependencyHealthMetrics(dependencyCards);
    updateSearchRateMetrics(readiness.searchRate);
    updateActiveSuppressionsMetric(
      runtime.database.repositories.releaseSuppressions.listActive(readiness.checkedAt)
        .length
    );

    return NextResponse.json(readiness, {
      status: readiness.ok ? 200 : 503,
    });
  } catch (error) {
    logger.error({
      event: 'readiness_failed',
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
            }
          : {
              message: 'Unknown readiness failure',
            },
    });

    return NextResponse.json(
      {
        ok: false,
        checkedAt: new Date().toISOString(),
      },
      {
        status: 503,
      }
    );
  }
}
