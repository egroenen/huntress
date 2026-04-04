import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';

import { requireAuthenticatedConsoleContext } from '@/src/server/require-auth';
import {
  ConsoleShell,
  DataTable,
  ReasonCodeBadge,
  SectionCard,
  StatusBadge,
} from '@/src/ui';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 100;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const formatTimestamp = (value: string | null): string => {
  if (!value) {
    return 'n/a';
  }

  return new Intl.DateTimeFormat('en-NZ', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
};

const parsePositivePage = (value: string | string[] | undefined): number => {
  const normalized = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(normalized ?? '', 10);

  if (Number.isNaN(parsed) || parsed < 1) {
    return 1;
  }

  return parsed;
};

const clampPage = (page: number, totalItems: number): number => {
  const totalPages = Math.max(Math.ceil(totalItems / PAGE_SIZE), 1);
  return Math.min(page, totalPages);
};

const buildRunDetailHref = (runId: string, page: number): string =>
  `/runs/${runId}?page=${page}`;

const renderPagination = (
  runId: string,
  currentPage: number,
  totalItems: number
): ReactNode => {
  const totalPages = Math.max(Math.ceil(totalItems / PAGE_SIZE), 1);

  if (totalItems <= PAGE_SIZE) {
    return (
      <span className="console-muted">Showing all {totalItems} attempt rows for this run.</span>
    );
  }

  return (
    <div className="table-pagination">
      <span className="console-muted">
        Page {currentPage} of {totalPages} · {totalItems} attempt rows
      </span>
      <div className="table-pagination__links">
        {currentPage > 1 ? (
          <a href={buildRunDetailHref(runId, currentPage - 1)} className="console-link">
            Previous
          </a>
        ) : (
          <span className="console-muted">Previous</span>
        )}
        {currentPage < totalPages ? (
          <a href={buildRunDetailHref(runId, currentPage + 1)} className="console-link">
            Next
          </a>
        ) : (
          <span className="console-muted">Next</span>
        )}
      </div>
    </div>
  );
};

export default async function RunDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const [{ id }, resolvedSearchParams, runtime] = await Promise.all([
    params,
    searchParams,
    requireAuthenticatedConsoleContext(),
  ]);
  const run = runtime.database.repositories.runHistory.getById(id);

  if (!run) {
    notFound();
  }

  const totalAttempts = runtime.database.repositories.searchAttempts.countByRunId(id);
  const currentPage = clampPage(parsePositivePage(resolvedSearchParams.page), totalAttempts);
  const attempts = runtime.database.repositories.searchAttempts.listPageByRunId(
    id,
    PAGE_SIZE,
    (currentPage - 1) * PAGE_SIZE
  );

  return (
    <ConsoleShell
      title="Run detail"
      subtitle={`Detailed attempt records and summary for ${run.id}.`}
      activePath="/runs"
      currentUser={runtime.authenticated.user.username}
      mode={runtime.config.mode}
      schedulerStatus={runtime.scheduler.getStatus()}
      actionTokens={runtime.csrfTokens}
    >
      <SectionCard
        title="Run summary"
        subtitle="Top-line counters persisted with the run."
      >
        <div className="latest-run__summary">
          <div>
            <span className="console-meta__label">Run type</span>
            <strong>{run.runType.replace('_', ' ')}</strong>
          </div>
          <div>
            <span className="console-meta__label">Status</span>
            <StatusBadge status={run.status}>{run.status}</StatusBadge>
          </div>
          <div>
            <span className="console-meta__label">Started</span>
            <strong>{formatTimestamp(run.startedAt)}</strong>
          </div>
          <div>
            <span className="console-meta__label">Finished</span>
            <strong>{formatTimestamp(run.finishedAt)}</strong>
          </div>
          <div>
            <span className="console-meta__label">Candidates</span>
            <strong>{run.candidateCount}</strong>
          </div>
          <div>
            <span className="console-meta__label">Dispatches</span>
            <strong>{run.dispatchCount}</strong>
          </div>
          <div>
            <span className="console-meta__label">Skips</span>
            <strong>{run.skipCount}</strong>
          </div>
          <div>
            <span className="console-meta__label">Errors</span>
            <strong>{run.errorCount}</strong>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Attempt log"
        subtitle="One row per evaluated or dispatched item."
        actions={renderPagination(id, currentPage, totalAttempts)}
      >
        <DataTable
          columns={[
            { key: 'attemptedAt', label: 'At' },
            { key: 'app', label: 'App' },
            { key: 'mediaKey', label: 'Media key' },
            { key: 'decision', label: 'Decision' },
            { key: 'reason', label: 'Reason' },
            { key: 'outcome', label: 'Outcome' },
          ]}
          rows={attempts.map((attempt) => ({
            attemptedAt: formatTimestamp(attempt.attemptedAt),
            app: attempt.app,
            mediaKey: attempt.mediaKey,
            decision: (
              <StatusBadge
                status={attempt.decision === 'dispatch' ? 'success' : 'degraded'}
              >
                {attempt.decision}
              </StatusBadge>
            ),
            reason: <ReasonCodeBadge reasonCode={attempt.reasonCode as never} />,
            outcome: attempt.outcome ?? 'n/a',
          }))}
          emptyMessage="No attempt rows were recorded for this run."
        />
      </SectionCard>
    </ConsoleShell>
  );
}
