import Link from 'next/link';

import {
  getCandidateReleasePreviewMap,
  getDashboardCandidateSnapshot,
  probeDependencyHealth,
} from '@/src/server/console-data';
import { hydrateMediaDisplayRecords } from '@/src/server/media-display';
import { getSearchRateSnapshot } from '@/src/observability';
import { requireAuthenticatedConsoleContext } from '@/src/server/require-auth';
import {
  BudgetMeter,
  ConsoleShell,
  DataTable,
  DependencyHealthGrid,
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

interface AppSyncSummary {
  app: 'sonarr' | 'radarr';
  status: 'synced' | 'not_configured';
  syncedAt: string;
  missingCount: number;
  missingPagesFetched: number;
  missingTotalPages: number;
  cutoffCount: number;
  cutoffPagesFetched: number;
  cutoffTotalPages: number;
  queueCount: number;
  upsertedCount: number;
  ignoredCount: number;
}

interface ArrStateSyncSummary {
  syncedAt: string;
  sonarr: AppSyncSummary;
  radarr: AppSyncSummary;
}

interface TransmissionSummary {
  observedCount: number;
  removedCount: number;
  suppressionCount: number;
  linkedCount: number;
}

interface DispatchSummary {
  dryRun: boolean;
  dryRunDispatchPreviewCount: number;
  throttleReason: string | null;
  attemptsPersisted: number;
  releaseSelectionSummary?: {
    directGrabCount: number;
    blindSearchCount: number;
    fallbackUpgradeCount: number;
    goodEnoughCount: number;
    preferredReleaseCount: number;
  };
}

interface RunSummaryShape {
  syncSummary?: ArrStateSyncSummary;
  transmissionSummary?: TransmissionSummary;
  dispatchSummary?: DispatchSummary;
  requestedRunType?: string;
  liveDispatchAllowed?: boolean;
}

const formatTimestamp = (value: string | null): string => {
  if (!value) {
    return 'n/a';
  }

  return new Intl.DateTimeFormat('en-NZ', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
};

const formatDuration = (startedAt: string, finishedAt: string | null): string => {
  const started = new Date(startedAt).getTime();
  const finished = finishedAt ? new Date(finishedAt).getTime() : null;

  if (!Number.isFinite(started)) {
    return 'n/a';
  }

  if (finished === null || !Number.isFinite(finished)) {
    return 'In progress';
  }

  const durationMs = Math.max(finished - started, 0);
  const totalSeconds = Math.round(durationMs / 1000);

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes < 60) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const toRunSummaryShape = (
  summary: Record<string, unknown> | undefined
): RunSummaryShape => {
  return isRecord(summary) ? (summary as RunSummaryShape) : {};
};

const renderCandidateDispatchPath = (preview: {
  mode: string;
  reason: string;
  selectedReleaseTitle: string | null;
  selectedReleaseQuality: string | null;
  selectedReleaseIndexer: string | null;
} | null) => {
  if (!preview) {
    return <StatusBadge status="info">n/a</StatusBadge>;
  }

  const label =
    preview.mode === 'preferred_release'
      ? 'Direct release'
      : preview.mode === 'good_enough_release'
        ? 'Good enough'
        : preview.mode === 'fallback_then_upgrade'
          ? 'Fallback + upgrade'
          : 'Blind search';

  const status =
    preview.mode === 'preferred_release'
      ? 'success'
      : preview.mode === 'fallback_then_upgrade'
        ? 'degraded'
        : 'info';

  return (
    <StatusBadge status={status} title={preview.reason}>
      {label}
    </StatusBadge>
  );
};

export default async function HomePage() {
  const runtime = await requireAuthenticatedConsoleContext();
  const [dependencies, latestRun] = await Promise.all([
    probeDependencyHealth(runtime),
    Promise.resolve(runtime.database.repositories.runHistory.getLatest()),
  ]);
  const candidates = getDashboardCandidateSnapshot(runtime);
  const searchRate = getSearchRateSnapshot(runtime.database, runtime.config);
  const suppressions = runtime.database.repositories.releaseSuppressions.listActive(
    new Date().toISOString()
  );
  const recentTorrents =
    runtime.database.repositories.transmissionTorrentState.listRecent(5);
  const displayMediaItems = await hydrateMediaDisplayRecords(runtime, [
    ...candidates.all.slice(0, 8).map((candidate) => candidate.mediaKey),
    ...recentTorrents
      .map((torrent) => torrent.linkedMediaKey)
      .filter((mediaKey): mediaKey is string => mediaKey !== null),
  ]);
  const candidatePreviewMap = await getCandidateReleasePreviewMap(
    runtime,
    candidates.all.slice(0, 8)
  );

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
      actionTokens={runtime.csrfTokens}
      dependencyCards={dependencies}
    >
      <StatsGrid className="stats-grid--overview">
        <Link href="/settings" className="stat-card-link">
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
        </Link>
        <Link href="/candidates" className="stat-card-link">
          <StatCard
            label="Candidates"
            value={candidates.all.length}
            detail={`${dispatchableCount} dispatchable, ${skippedCount} skipped`}
          />
        </Link>
        <Link href="/suppressions" className="stat-card-link">
          <StatCard
            label="Active suppressions"
            value={suppressions.length}
            detail="Release-level blocks currently active"
          />
        </Link>
        <Link href="/settings" className="stat-card-link">
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
                    ? `${searchRate.currentThrottleReason} until ${formatTimestamp(searchRate.nextEligibleAt)}`
                    : 'Dispatch budget currently available'
                }
              />
            }
          />
        </Link>
        <Link
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
                ? formatTimestamp(latestRun.finishedAt ?? latestRun.startedAt)
                : 'No runs yet'
            }
          />
        </Link>
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
                value={formatDuration(latestRun.startedAt, latestRun.finishedAt)}
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
                <strong>{formatTimestamp(latestRun.startedAt)}</strong>
              </div>
              <div>
                <span className="console-meta__label">Finished</span>
                <strong>{formatTimestamp(latestRun.finishedAt)}</strong>
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
            { key: 'dispatchPath', label: 'Dispatch path' },
            { key: 'releasePreview', label: 'Release preview' },
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
            dispatchPath: renderCandidateDispatchPath(
              candidatePreviewMap.get(candidate.mediaKey) ?? null
            ),
            releasePreview: (() => {
              const preview = candidatePreviewMap.get(candidate.mediaKey);

              if (!preview) {
                return 'n/a';
              }

              if (!preview.selectedReleaseTitle) {
                return (
                  <div className="release-preview" title={preview.reason}>
                    <strong>No direct release selected</strong>
                    <small>{preview.reason}</small>
                  </div>
                );
              }

              return (
                <div className="release-preview" title={preview.reason}>
                  <strong>{preview.selectedReleaseTitle}</strong>
                  <small>
                    {[preview.selectedReleaseQuality, preview.selectedReleaseIndexer]
                      .filter(Boolean)
                      .join(' · ') || preview.reason}
                  </small>
                </div>
              );
            })(),
            reason: <ReasonCodeBadge reasonCode={candidate.reasonCode} />,
            nextEligibleAt: formatTimestamp(candidate.nextEligibleAt),
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
            nextEligibleAt: formatTimestamp(window.nextEligibleAt),
          }))}
          emptyMessage="No dispatch budget windows are available."
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
