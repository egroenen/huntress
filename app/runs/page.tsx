import Link from 'next/link';

import { requireAuthenticatedConsoleContext } from '@/src/server/require-auth';
import { ConsoleShell, DataTable, SectionCard, StatusBadge } from '@/src/ui';

export const dynamic = 'force-dynamic';

const formatTimestamp = (value: string | null): string => {
  if (!value) {
    return 'n/a';
  }

  return new Intl.DateTimeFormat('en-NZ', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
};

export default async function RunsPage() {
  const runtime = await requireAuthenticatedConsoleContext();
  const runs = runtime.database.repositories.runHistory.listRecent(25);

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
      <SectionCard title="Recent runs" subtitle="Newest runs appear first.">
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
