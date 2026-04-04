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

const formatTimestamp = (value: string | null): string => {
  if (!value) {
    return 'n/a';
  }

  return new Intl.DateTimeFormat('en-NZ', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
};

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, runtime] = await Promise.all([
    params,
    requireAuthenticatedConsoleContext(),
  ]);
  const run = runtime.database.repositories.runHistory.getById(id);

  if (!run) {
    notFound();
  }

  const attempts = runtime.database.repositories.searchAttempts.listByRunId(id);

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
