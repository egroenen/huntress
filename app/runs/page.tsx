import Link from 'next/link';
import type { ReactNode } from 'react';

import { requireAuthenticatedConsoleContext } from '@/src/server/require-auth';
import { ConsoleShell, DataTable, SectionCard, StatusBadge } from '@/src/ui';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

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

const buildRunsHref = (page: number): string => `/runs?page=${page}`;

const renderPagination = (currentPage: number, totalItems: number): ReactNode => {
  const totalPages = Math.max(Math.ceil(totalItems / PAGE_SIZE), 1);

  if (totalItems <= PAGE_SIZE) {
    return <span className="console-muted">Showing all {totalItems} recorded runs.</span>;
  }

  return (
    <div className="table-pagination">
      <span className="console-muted">
        Page {currentPage} of {totalPages} · {totalItems} recorded runs
      </span>
      <div className="table-pagination__links">
        {currentPage > 1 ? (
          <a href={buildRunsHref(currentPage - 1)} className="console-link">
            Previous
          </a>
        ) : (
          <span className="console-muted">Previous</span>
        )}
        {currentPage < totalPages ? (
          <a href={buildRunsHref(currentPage + 1)} className="console-link">
            Next
          </a>
        ) : (
          <span className="console-muted">Next</span>
        )}
      </div>
    </div>
  );
};

export default async function RunsPage(props: { searchParams: SearchParams }) {
  const searchParams = await props.searchParams;
  const runtime = await requireAuthenticatedConsoleContext();
  const totalRuns = runtime.database.repositories.runHistory.countAll();
  const currentPage = clampPage(parsePositivePage(searchParams.page), totalRuns);
  const runs = runtime.database.repositories.runHistory.listPage(
    PAGE_SIZE,
    (currentPage - 1) * PAGE_SIZE
  );

  return (
    <ConsoleShell
      title="Run history"
      subtitle="Audit every sync and dispatch cycle, including manual runs and partial failures."
      activePath="/runs"
      currentUser={runtime.authenticated.user.username}
      mode={runtime.config.mode}
      schedulerStatus={runtime.scheduler.getStatus()}
      actionTokens={runtime.csrfTokens}
    >
      <SectionCard
        title="Recent runs"
        subtitle="Newest runs appear first."
        actions={renderPagination(currentPage, totalRuns)}
      >
        <DataTable
          columns={[
            { key: 'runType', label: 'Run type' },
            { key: 'status', label: 'Status' },
            { key: 'startedAt', label: 'Started' },
            { key: 'finishedAt', label: 'Finished' },
            { key: 'counts', label: 'Counts' },
            { key: 'detail', label: 'Detail', align: 'right' },
          ]}
          rows={runs.map((run) => ({
            runType: run.runType.replace('_', ' '),
            status: <StatusBadge status={run.status}>{run.status}</StatusBadge>,
            startedAt: formatTimestamp(run.startedAt),
            finishedAt: formatTimestamp(run.finishedAt),
            counts: `${run.candidateCount} / ${run.dispatchCount} / ${run.skipCount} / ${run.errorCount}`,
            detail: (
              <Link href={`/runs/${run.id}`} className="console-link">
                View
              </Link>
            ),
          }))}
          emptyMessage="No runs have been recorded yet."
        />
      </SectionCard>
    </ConsoleShell>
  );
}
