import Link from 'next/link';

import {
  getDashboardCandidateSnapshot,
  probeDependencyHealth,
} from '@/src/server/console-data';
import { requireAuthenticatedConsoleContext } from '@/src/server/require-auth';
import {
  ConsoleShell,
  DataTable,
  DependencyHealthGrid,
  ReasonCodeBadge,
  SectionCard,
  StatCard,
  StatsGrid,
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

export default async function HomePage() {
  const runtime = await requireAuthenticatedConsoleContext();
  const [dependencies, latestRun] = await Promise.all([
    probeDependencyHealth(runtime),
    Promise.resolve(runtime.database.repositories.runHistory.getLatest()),
  ]);
  const candidates = getDashboardCandidateSnapshot(runtime);
  const suppressions = runtime.database.repositories.releaseSuppressions.listActive(
    new Date().toISOString()
  );
  const recentTorrents =
    runtime.database.repositories.transmissionTorrentState.listRecent(5);

  const dispatchableCount = candidates.all.filter(
    (candidate) => candidate.decision === 'dispatch'
  ).length;
  const skippedCount = candidates.all.length - dispatchableCount;

  return (
    <ConsoleShell
      title="Overview"
      subtitle="See the scheduler state, dependency health, and what the next cycle is likely to do."
      activePath="/"
      currentUser={runtime.authenticated.user.username}
      mode={runtime.config.mode}
      schedulerStatus={runtime.scheduler.getStatus()}
      actionTokens={runtime.csrfTokens}
    >
      <StatsGrid>
        <StatCard
          label="Mode"
          value={runtime.config.mode === 'live' ? 'Live dispatch' : 'Dry-run'}
          tone={runtime.config.mode === 'live' ? 'success' : 'warn'}
          detail={`Next cycle ${formatTimestamp(runtime.scheduler.getStatus().nextScheduledRunAt)}`}
        />
        <StatCard
          label="Candidates"
          value={candidates.all.length}
          detail={`${dispatchableCount} dispatchable, ${skippedCount} skipped`}
        />
        <StatCard
          label="Active suppressions"
          value={suppressions.length}
          detail="Release- and item-level blocks currently active"
        />
        <StatCard
          label="Last run"
          value={latestRun?.status ?? 'none'}
          tone={
            latestRun?.status === 'success'
              ? 'success'
              : latestRun?.status === 'partial'
                ? 'warn'
                : latestRun?.status === 'failed'
                  ? 'danger'
                  : 'default'
          }
          detail={
            latestRun
              ? formatTimestamp(latestRun.finishedAt ?? latestRun.startedAt)
              : 'No runs yet'
          }
        />
      </StatsGrid>

      <SectionCard
        title="Dependency health"
        subtitle="Live probes against the four external systems this service depends on."
      >
        <DependencyHealthGrid dependencies={dependencies} />
      </SectionCard>

      <SectionCard
        title="Latest run"
        subtitle="Most recent scheduler or manual cycle recorded in the database."
        actions={
          <Link href="/runs" className="console-link">
            View all runs
          </Link>
        }
      >
        {latestRun ? (
          <div className="latest-run">
            <div className="latest-run__summary">
              <div>
                <span className="console-meta__label">Run type</span>
                <strong>{latestRun.runType.replace('_', ' ')}</strong>
              </div>
              <div>
                <span className="console-meta__label">Status</span>
                <StatusBadge status={latestRun.status}>{latestRun.status}</StatusBadge>
              </div>
              <div>
                <span className="console-meta__label">Started</span>
                <strong>{formatTimestamp(latestRun.startedAt)}</strong>
              </div>
              <div>
                <span className="console-meta__label">Finished</span>
                <strong>{formatTimestamp(latestRun.finishedAt)}</strong>
              </div>
            </div>
            <div className="latest-run__counts">
              <span>{latestRun.candidateCount} candidates</span>
              <span>{latestRun.dispatchCount} dispatches</span>
              <span>{latestRun.skipCount} skips</span>
              <span>{latestRun.errorCount} errors</span>
            </div>
          </div>
        ) : (
          <p className="console-muted">
            No scheduler runs have been recorded yet. Use the action buttons above to run
            a sync or dispatch cycle.
          </p>
        )}
      </SectionCard>

      <SectionCard
        title="Candidate snapshot"
        subtitle="A deterministic preview of what the decision engine would do right now."
        actions={
          <Link href="/candidates" className="console-link">
            Open candidate preview
          </Link>
        }
      >
        <DataTable
          columns={[
            { key: 'app', label: 'App' },
            { key: 'title', label: 'Title' },
            { key: 'decision', label: 'Decision' },
            { key: 'reason', label: 'Reason' },
            { key: 'nextEligibleAt', label: 'Next eligible' },
          ]}
          rows={candidates.all.slice(0, 8).map((candidate) => ({
            app: (
              <span className="table-app-label table-app-label--inline">
                {candidate.app}
              </span>
            ),
            title: candidate.title,
            decision: (
              <StatusBadge
                status={candidate.decision === 'dispatch' ? 'success' : 'degraded'}
              >
                {candidate.decision}
              </StatusBadge>
            ),
            reason: <ReasonCodeBadge reasonCode={candidate.reasonCode} />,
            nextEligibleAt: formatTimestamp(candidate.nextEligibleAt),
          }))}
          emptyMessage="No candidate decisions are available yet."
        />
      </SectionCard>

      <SectionCard
        title="Recent Transmission actions"
        subtitle="Latest observed torrents, including removals triggered by the guard."
        actions={
          <Link href="/transmission" className="console-link">
            Open Transmission view
          </Link>
        }
      >
        <DataTable
          columns={[
            { key: 'name', label: 'Torrent' },
            { key: 'linkedMediaKey', label: 'Linked media' },
            { key: 'removedAt', label: 'Removed at' },
            { key: 'removalReason', label: 'Reason' },
          ]}
          rows={recentTorrents.map((torrent) => ({
            name: torrent.name,
            linkedMediaKey: torrent.linkedMediaKey ?? 'unlinked',
            removedAt: formatTimestamp(torrent.removedAt),
            removalReason: torrent.removalReason ? (
              <code className="reason-code">{torrent.removalReason}</code>
            ) : (
              <span className="console-muted">none</span>
            ),
          }))}
          emptyMessage="No Transmission torrent state has been recorded yet."
        />
      </SectionCard>
    </ConsoleShell>
  );
}
