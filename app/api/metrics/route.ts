import { probeDependencyHealth } from '@/src/server/console-data';
import { getRuntimeContext } from '@/src/server/runtime';
import {
  getMetricsText,
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
  } catch (error) {
    logger.debug(
      {
        error,
        event: 'metrics_enrichment_failed',
      },
      'Failed to enrich metrics scrape'
    );

    // Best-effort scrape enrichment only.
  }

  const metrics = await getMetricsText();

  return new Response(metrics, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
