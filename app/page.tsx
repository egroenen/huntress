import Link from 'next/link';

import { getDashboardCandidateSnapshot } from '@/src/server/console-data';
import { hydrateMediaDisplayRecords } from '@/src/server/media-display';
import { getSearchRateSnapshot } from '@/src/observability';
import { requireAuthenticatedConsoleContext } from '@/src/server/require-auth';
import {
  formatRunDuration,
  formatRunTimestamp,
  toRunSummaryShape,
} from '@/src/server/run-summary';
import {
  BudgetMeter,
  ConsoleHeaderActions,
  ConsoleShell,
  DataTable,
  LazyDependencyHealthGrid,
  MediaItemLink,
  RelativeTimeLabel,
  ReasonCodeBadge,
  SectionCard,
  StatCard,
  StatsGrid,
  StatusBadge,
} from '@/src/ui';
import {
  formatDisplayMode,
  formatRunTypeLabel,
  formatServiceName,
} from '@/src/ui/formatters';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const runtime = await requireAuthenticatedConsoleContext();
  const candidates = getDashboardCandidateSnapshot(runtime);
  const searchRate = getSearchRateSnapshot(runtime.database, runtime.config);
  const suppressions = runtime.database.repositories.releaseSuppressions.listActive(
    new Date().toISOString()
  );
  const recentTorrents =
    runtime.database.repositories.transmissionTorrentState.listRecent(5);
  const displayMediaKeys = [
    ...candidates.all.slice(0, 8).map((candidate) => candidate.mediaKey),
    ...recentTorrents
      .map((torrent) => torrent.linkedMediaKey)
      .filter((mediaKey): mediaKey is string => mediaKey !== null),
  ];
  const [latestRun, displayMediaItems] = await Promise.all([
    Promise.resolve(runtime.database.repositories.runHistory.getLatest()),
    hydrateMediaDisplayRecords(runtime, displayMediaKeys),
  ]);

  const dispatchableCount = candidates.all.filter(
    (candidate) => candidate.decision === 'dispatch'
  ).length;
  const skippedCount = candidates.all.length - dispatchableCount;
  const latestRunSummary = latestRun ? toRunSummaryShape(latestRun.summary) : {};
  const latestRunSyncRows = latestRunSummary.syncSummary
    ? [latestRunSummary.syncSummary.sonarr, latestRunSummary.syncSummary.radarr]
    : [];

  return (
    <ConsoleShell
      title="Overview"
      subtitle="See the scheduler state, dependency health, and what the next cycle is likely to do."
      activePath="/"
      currentUser={runtime.authenticated.user.username}
      mode={runtime.config.mode}
      schedulerStatus={runtime.scheduler.getStatus()}
      headerActions={
        <ConsoleHeaderActions
          mode={runtime.config.mode}
          schedulerStatus={runtime.scheduler.getStatus()}
          actionTokens={runtime.csrfTokens}
        />
      }
    >
      <StatsGrid className="stats-grid--overview">
        <a href="/settings" className="stat-card-link">
          <StatCard
            label="Dispatch mode"
            value={formatDisplayMode(runtime.config.mode)}
            tone={runtime.config.mode === 'live' ? 'success' : 'warn'}
            detail={
              runtime.scheduler.getStatus().nextScheduledRunAt ? (
                <span>
                  Next cycle <RelativeTimeLabel isoTimestamp={runtime.scheduler.getStatus().nextScheduledRunAt} />
                </span>
              ) : (
                'No next cycle scheduled'
              )
            }
          />
        </a>
        <a href="/candidates" className="stat-card-link">
          <StatCard
            label="Candidates"
            value={candidates.all.length}
            detail={`${dispatchableCount} dispatchable, ${skippedCount} skipped`}
          />
        </a>
        <a href="/suppressions" className="stat-card-link">
          <StatCard
            label="Active suppressions"
            value={suppressions.length}
            detail="Release-level blocks currently active"
          />
        </a>
        <a href="/settings" className="stat-card-link">
          <StatCard
            label="Dispatch budget (15m)"
            value={`${searchRate.windows[0]?.used ?? 0}/${searchRate.windows[0]?.limit ?? 0}`}
            tone={searchRate.currentThrottleReason ? 'warn' : 'default'}
            detail={
              <BudgetMeter
                used={searchRate.windows[0]?.used ?? 0}
                limit={searchRate.windows[0]?.limit ?? 0}
                detail={
                  searchRate.currentThrottleReason
                    ? `${searchRate.currentThrottleReason} until ${formatRunTimestamp(searchRate.nextEligibleAt)}`
                    : 'Dispatch budget currently available'
                }
              />
            }
          />
        </a>
        <a
          href={latestRun ? `/runs/${latestRun.id}` : '/runs'}
          className="stat-card-link"
        >
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
                ? formatRunTimestamp(latestRun.finishedAt ?? latestRun.startedAt)
                : 'No runs yet'
            }
          />
        </a>
      </StatsGrid>

      <SectionCard
        title="Dependency health"
        subtitle="Live probes against the four external systems this service depends on."
      >
        <LazyDependencyHealthGrid />
      </SectionCard>

      <SectionCard
        title="Latest run"
        subtitle="Most recent scheduler or manual cycle recorded in the database."
        actions={
          <div className="section-card__actions">
            {latestRun ? (
              <Link href={`/runs/${latestRun.id}`} className="console-link">
                Open run detail
              </Link>
            ) : null}
            <Link href="/runs" className="console-link">
              View all runs
            </Link>
          </div>
        }
      >
        {latestRun ? (
          <div className="latest-run">
            <StatsGrid>
              <StatCard label="Run type" value={formatRunTypeLabel(latestRun.runType)} />
              <StatCard
                label="Status"
                value={latestRun.status}
                tone={
                  latestRun.status === 'success'
                    ? 'success'
                    : latestRun.status === 'failed'
                      ? 'danger'
                      : 'warn'
                }
              />
              <StatCard
                label="Duration"
                value={formatRunDuration(latestRun.startedAt, latestRun.finishedAt)}
              />
              <StatCard
                label="Dispatch mode"
                value={
                  latestRunSummary.liveDispatchAllowed === undefined
                    ? latestRun.runType === 'manual_dry'
                      ? 'Dry only'
                      : 'Live dispatch'
                    : latestRunSummary.liveDispatchAllowed
                      ? 'Live dispatch'
                      : 'Dry only'
                }
              />
            </StatsGrid>
            <div className="latest-run__summary">
              <div>
                <span className="console-meta__label">Started</span>
                <strong>{formatRunTimestamp(latestRun.startedAt)}</strong>
              </div>
              <div>
                <span className="console-meta__label">Finished</span>
                <strong>{formatRunTimestamp(latestRun.finishedAt)}</strong>
              </div>
              <div>
                <span className="console-meta__label">Requested run type</span>
                <strong>
                  {latestRunSummary.requestedRunType
                    ? formatRunTypeLabel(latestRunSummary.requestedRunType)
                    : formatRunTypeLabel(latestRun.runType)}
                </strong>
              </div>
              <div>
                <span className="console-meta__label">Live dispatch allowed</span>
                <strong>
                  {latestRunSummary.liveDispatchAllowed === undefined
                    ? latestRun.runType === 'manual_dry'
                      ? 'No'
                      : 'Yes'
                    : latestRunSummary.liveDispatchAllowed
                      ? 'Yes'
                      : 'No'}
                </strong>
              </div>
            </div>
            <div className="latest-run__counts">
              <span>{latestRun.candidateCount} candidates</span>
              <span>{latestRun.dispatchCount} dispatches</span>
              <span>{latestRun.skipCount} skips</span>
              <span>{latestRun.errorCount} errors</span>
            </div>
            {latestRunSyncRows.length > 0 ? (
              <div className="latest-run__details-grid">
                {latestRunSyncRows.map((row) => (
                  <article key={row.app} className="latest-run__detail-card">
                    <div className="latest-run__detail-card-header">
                      <strong>{formatServiceName(row.app)}</strong>
                      <StatusBadge
                        status={row.status === 'synced' ? 'success' : 'degraded'}
                      >
                        {row.status}
                      </StatusBadge>
                    </div>
                    <p>
                      {row.missingCount} missing, {row.cutoffCount} cutoff unmet,{' '}
                      {row.queueCount} queued
                    </p>
                    <p>
                      Missing pages: {row.missingPagesFetched} of {row.missingTotalPages}
                    </p>
                    <p>
                      Cutoff pages: {row.cutoffPagesFetched} of {row.cutoffTotalPages}
                    </p>
                  </article>
                ))}
                {latestRunSummary.transmissionSummary ? (
                  <article className="latest-run__detail-card">
                    <div className="latest-run__detail-card-header">
                      <strong>Transmission</strong>
                    </div>
                    <p>
                      {latestRunSummary.transmissionSummary.observedCount} observed,{' '}
                      {latestRunSummary.transmissionSummary.linkedCount} linked
                    </p>
                    <p>
                      {latestRunSummary.transmissionSummary.removedCount} removed,{' '}
                      {latestRunSummary.transmissionSummary.suppressionCount} suppressions
                    </p>
                  </article>
                ) : null}
                {latestRunSummary.dispatchSummary ? (
                  <article className="latest-run__detail-card">
                    <div className="latest-run__detail-card-header">
                      <strong>Dispatch</strong>
                    </div>
                    <p>
                      {latestRunSummary.dispatchSummary.attemptsPersisted} attempts
                      persisted
                    </p>
                    <p>
                      {latestRunSummary.dispatchSummary.dryRun
                        ? `${latestRunSummary.dispatchSummary.dryRunDispatchPreviewCount} dispatch previews in dry-run`
                        : latestRunSummary.dispatchSummary.throttleReason
                          ? `Throttled: ${latestRunSummary.dispatchSummary.throttleReason}`
                          : 'No throttle active'}
                    </p>
                    {latestRunSummary.dispatchSummary.releaseSelectionSummary ? (
                      <p>
                        {latestRunSummary.dispatchSummary.releaseSelectionSummary.directGrabCount}{' '}
                        direct grabs,{' '}
                        {
                          latestRunSummary.dispatchSummary.releaseSelectionSummary
                            .fallbackUpgradeCount
                        }{' '}
                        fallback upgrades,{' '}
                        {
                          latestRunSummary.dispatchSummary.releaseSelectionSummary
                            .blindSearchCount
                        }{' '}
                        blind searches
                      </p>
                    ) : null}
                  </article>
                ) : null}
              </div>
            ) : latestRunSummary.transmissionSummary ||
              latestRunSummary.dispatchSummary ? (
              <div className="latest-run__details-grid">
                {latestRunSummary.transmissionSummary ? (
                  <article className="latest-run__detail-card">
                    <div className="latest-run__detail-card-header">
                      <strong>Transmission</strong>
                    </div>
                    <p>
                      {latestRunSummary.transmissionSummary.observedCount} observed,{' '}
                      {latestRunSummary.transmissionSummary.linkedCount} linked
                    </p>
                    <p>
                      {latestRunSummary.transmissionSummary.removedCount} removed,{' '}
                      {latestRunSummary.transmissionSummary.suppressionCount} suppressions
                    </p>
                  </article>
                ) : null}
                {latestRunSummary.dispatchSummary ? (
                  <article className="latest-run__detail-card">
                    <div className="latest-run__detail-card-header">
                      <strong>Dispatch</strong>
                    </div>
                    <p>
                      {latestRunSummary.dispatchSummary.attemptsPersisted} attempts
                      persisted
                    </p>
                    <p>
                      {latestRunSummary.dispatchSummary.dryRun
                        ? `${latestRunSummary.dispatchSummary.dryRunDispatchPreviewCount} dispatch previews in dry-run`
                        : latestRunSummary.dispatchSummary.throttleReason
                          ? `Throttled: ${latestRunSummary.dispatchSummary.throttleReason}`
                          : 'No throttle active'}
                    </p>
                    {latestRunSummary.dispatchSummary.releaseSelectionSummary ? (
                      <p>
                        {latestRunSummary.dispatchSummary.releaseSelectionSummary.directGrabCount}{' '}
                        direct grabs,{' '}
                        {
                          latestRunSummary.dispatchSummary.releaseSelectionSummary
                            .fallbackUpgradeCount
                        }{' '}
                        fallback upgrades,{' '}
                        {
                          latestRunSummary.dispatchSummary.releaseSelectionSummary
                            .blindSearchCount
                        }{' '}
                        blind searches
                      </p>
                    ) : null}
                  </article>
                ) : null}
              </div>
            ) : null}
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
          <a href="/candidates" className="console-link">
            Open candidate preview
          </a>
        }
      >
        <DataTable
          columns={[
            { key: 'app', label: 'App' },
            { key: 'title', label: 'Title' },
            { key: 'decision', label: 'Decision' },
            { key: 'wantedState', label: 'Wanted state' },
            { key: 'reason', label: 'Reason' },
            { key: 'nextEligibleAt', label: 'Next eligible' },
          ]}
          rows={candidates.all.slice(0, 8).map((candidate) => ({
            app: (
              <span className="table-app-label table-app-label--inline">
                {formatServiceName(candidate.app)}
              </span>
            ),
            title: (
              <MediaItemLink
                config={runtime.config}
                mediaItem={displayMediaItems.get(candidate.mediaKey) ?? null}
                fallbackTitle={candidate.title}
                className="external-item-link"
              />
            ),
            decision: (
              <StatusBadge
                status={candidate.decision === 'dispatch' ? 'success' : 'degraded'}
              >
                {candidate.decision}
              </StatusBadge>
            ),
            wantedState: candidate.wantedState.replaceAll('_', ' '),
            reason: <ReasonCodeBadge reasonCode={candidate.reasonCode} />,
            nextEligibleAt: formatRunTimestamp(candidate.nextEligibleAt),
          }))}
          emptyMessage="No candidate decisions are available yet."
        />
      </SectionCard>

      <SectionCard
        title="Dispatch budget windows"
        subtitle="Rolling-window live dispatch usage used to protect indexers and private trackers."
      >
        <DataTable
          columns={[
            { key: 'window', label: 'Window' },
            { key: 'used', label: 'Used', align: 'right' },
            { key: 'limit', label: 'Limit', align: 'right' },
            { key: 'remaining', label: 'Remaining', align: 'right' },
            { key: 'usage', label: 'Usage' },
            { key: 'nextEligibleAt', label: 'Next eligible' },
          ]}
          rows={searchRate.windows.map((window) => ({
            window: window.key,
            used: window.used,
            limit: window.limit,
            remaining: window.remaining,
            usage: <BudgetMeter used={window.used} limit={window.limit} />,
            nextEligibleAt: formatRunTimestamp(window.nextEligibleAt),
          }))}
          emptyMessage="No dispatch budget windows are available."
        />
      </SectionCard>

      <SectionCard
        title="Recent Transmission actions"
        subtitle="Latest observed torrents, including removals triggered by the guard."
        actions={
          <a href="/transmission" className="console-link">
            Open Transmission view
          </a>
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
            linkedMediaKey: torrent.linkedMediaKey ? (
              <div className="linked-media-cell" title={torrent.linkedMediaKey}>
                <MediaItemLink
                  config={runtime.config}
                  mediaItem={displayMediaItems.get(torrent.linkedMediaKey) ?? null}
                  fallbackTitle="Linked item"
                  className="external-item-link"
                />
                <span className="secondary-value">
                  <code>{torrent.linkedMediaKey}</code>
                </span>
              </div>
            ) : (
              'unlinked'
            ),
            removedAt: formatRunTimestamp(torrent.removedAt),
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
