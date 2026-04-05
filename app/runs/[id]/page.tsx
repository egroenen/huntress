import Link from 'next/link';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';

import type { RunHistoryRecord, SearchAttemptRecord } from '@/src/db';
import { hydrateMediaDisplayRecords } from '@/src/server/media-display';
import { requireAuthenticatedConsoleContext } from '@/src/server/require-auth';
import {
  ConsoleShell,
  DataTable,
  MediaItemLink,
  ReasonCodeBadge,
  SectionCard,
  StatCard,
  StatsGrid,
  StatusBadge,
} from '@/src/ui';
import {
  formatRunTypeLabel,
  formatServiceName,
  formatShortRunId,
} from '@/src/ui/formatters';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 100;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

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
}

interface RunSummaryShape {
  syncSummary?: ArrStateSyncSummary;
  transmissionSummary?: TransmissionSummary;
  dispatchSummary?: DispatchSummary;
  requestedRunType?: string;
  liveDispatchAllowed?: boolean;
  manualFetch?: boolean;
  mediaKey?: string;
  title?: string;
  app?: string;
  manualOverride?: boolean;
  arrCommandId?: number | null;
  error?: {
    name?: string;
    message?: string;
  };
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
  page > 1 ? `/runs/${runId}?page=${page}` : `/runs/${runId}`;

const buildRunDetailSearchHref = (
  runId: string,
  page: number,
  input: { query: string; app: string; decision: string }
): string => {
  const params = new URLSearchParams();

  if (input.query.trim()) {
    params.set('q', input.query.trim());
  }

  if (input.app) {
    params.set('app', input.app);
  }

  if (input.decision) {
    params.set('decision', input.decision);
  }

  if (page > 1) {
    params.set('page', String(page));
  }

  const suffix = params.toString();

  return suffix ? `/runs/${runId}?${suffix}` : `/runs/${runId}`;
};

const renderPagination = (
  runId: string,
  currentPage: number,
  totalItems: number,
  input: { query: string; app: string; decision: string }
): ReactNode => {
  const totalPages = Math.max(Math.ceil(totalItems / PAGE_SIZE), 1);

  if (totalItems <= PAGE_SIZE) {
    return (
      <span className="console-muted">
        Showing all {totalItems} attempt rows for this run.
      </span>
    );
  }

  return (
    <div className="table-pagination">
      <span className="console-muted">
        Page {currentPage} of {totalPages} · {totalItems} attempt rows
      </span>
      <div className="table-pagination__links">
        {currentPage > 1 ? (
          <a
            href={buildRunDetailSearchHref(runId, currentPage - 1, input)}
            className="console-link"
          >
            Previous
          </a>
        ) : (
          <span className="console-muted">Previous</span>
        )}
        {currentPage < totalPages ? (
          <a
            href={buildRunDetailSearchHref(runId, currentPage + 1, input)}
            className="console-link"
          >
            Next
          </a>
        ) : (
          <span className="console-muted">Next</span>
        )}
      </div>
    </div>
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const toRunSummaryShape = (run: RunHistoryRecord): RunSummaryShape => {
  return isRecord(run.summary) ? (run.summary as RunSummaryShape) : {};
};

const toAppSyncRows = (summary: RunSummaryShape): AppSyncSummary[] => {
  if (!summary.syncSummary) {
    return [];
  }

  return [summary.syncSummary.sonarr, summary.syncSummary.radarr];
};

const buildAttemptRows = (
  attempts: SearchAttemptRecord[],
  resolveTitle: (mediaKey: string) => string | null,
  resolveMediaItem: (mediaKey: string) => import('@/src/db').MediaItemStateRecord | null,
  config: import('@/src/config').ResolvedConfig
) => {
  return attempts.map((attempt) => {
    const title = resolveTitle(attempt.mediaKey);
    const mediaItem = resolveMediaItem(attempt.mediaKey);

    return {
      attemptedAt: formatTimestamp(attempt.attemptedAt),
      app: (
        <span className="table-app-label table-app-label--inline">
          {formatServiceName(attempt.app)}
        </span>
      ),
      title: title ? (
        <MediaItemLink
          config={config}
          mediaItem={mediaItem}
          fallbackTitle={title}
          className="external-item-link"
        />
      ) : (
        <span className="console-muted">Unknown title</span>
      ),
      mediaKey: <code className="reason-code">{attempt.mediaKey}</code>,
      decision: (
        <StatusBadge status={attempt.decision === 'dispatch' ? 'success' : 'degraded'}>
          {attempt.decision}
        </StatusBadge>
      ),
      reason: <ReasonCodeBadge reasonCode={attempt.reasonCode as never} />,
      outcome: attempt.outcome ?? 'n/a',
    };
  });
};

const renderRunSummarySection = (
  run: RunHistoryRecord,
  summary: RunSummaryShape,
  totalAttempts: number
) => {
  return (
    <SectionCard
      title="Run summary"
      subtitle="A quick operational view of what this run was, how long it took, and what it actually did."
    >
      <StatsGrid>
        <StatCard label="Run type" value={formatRunTypeLabel(run.runType)} />
        <StatCard
          label="Status"
          value={run.status}
          tone={
            run.status === 'success'
              ? 'success'
              : run.status === 'failed'
                ? 'danger'
                : 'warn'
          }
        />
        <StatCard
          label="Duration"
          value={formatDuration(run.startedAt, run.finishedAt)}
        />
        <StatCard label="Attempt rows" value={totalAttempts} />
        <StatCard label="Candidates" value={run.candidateCount} />
        <StatCard
          label="Dispatches"
          value={run.dispatchCount}
          tone={run.dispatchCount > 0 ? 'success' : 'default'}
        />
        <StatCard label="Skips" value={run.skipCount} tone="default" />
        <StatCard
          label="Errors"
          value={run.errorCount}
          tone={run.errorCount > 0 ? 'danger' : 'default'}
        />
      </StatsGrid>

      <div className="latest-run__summary">
        <div>
          <span className="console-meta__label">Started</span>
          <strong>{formatTimestamp(run.startedAt)}</strong>
        </div>
        <div>
          <span className="console-meta__label">Finished</span>
          <strong>{formatTimestamp(run.finishedAt)}</strong>
        </div>
        <div>
          <span className="console-meta__label">Requested run type</span>
          <strong>
            {summary.requestedRunType
              ? formatRunTypeLabel(summary.requestedRunType)
              : formatRunTypeLabel(run.runType)}
          </strong>
        </div>
        <div>
          <span className="console-meta__label">Live dispatch allowed</span>
          <strong>
            {summary.liveDispatchAllowed === undefined
              ? run.runType === 'manual_dry'
                ? 'No'
                : 'Yes'
              : summary.liveDispatchAllowed
                ? 'Yes'
                : 'No'}
          </strong>
        </div>
      </div>
    </SectionCard>
  );
};

const renderManualFetchSection = (
  summary: RunSummaryShape,
  mediaItem: import('@/src/db').MediaItemStateRecord | null,
  config: import('@/src/config').ResolvedConfig
) => {
  if (!summary.manualFetch) {
    return null;
  }

  return (
    <SectionCard
      title="Manual fetch details"
      subtitle="This run came from a per-item manual fetch request."
    >
      <div className="latest-run__summary">
        <div>
          <span className="console-meta__label">Title</span>
          <MediaItemLink
            config={config}
            mediaItem={mediaItem}
            fallbackTitle={summary.title ?? 'Unknown title'}
            className="external-item-link"
          />
        </div>
        <div>
          <span className="console-meta__label">Media key</span>
          <strong>{summary.mediaKey ?? 'n/a'}</strong>
        </div>
        <div>
          <span className="console-meta__label">App</span>
          <strong>{summary.app ? formatServiceName(summary.app) : 'n/a'}</strong>
        </div>
        <div>
          <span className="console-meta__label">Manual override</span>
          <strong>{summary.manualOverride ? 'Yes' : 'No'}</strong>
        </div>
        <div>
          <span className="console-meta__label">Command id</span>
          <strong>{summary.arrCommandId ?? 'n/a'}</strong>
        </div>
        <div>
          <span className="console-meta__label">Error</span>
          <strong>{summary.error?.message ?? 'none'}</strong>
        </div>
      </div>
    </SectionCard>
  );
};

const renderSyncSection = (summary: RunSummaryShape) => {
  const rows = toAppSyncRows(summary);

  if (rows.length === 0) {
    return null;
  }

  return (
    <SectionCard
      title="Sync summary"
      subtitle={`Arr state snapshot taken at ${formatTimestamp(summary.syncSummary?.syncedAt ?? null)}.`}
    >
        <DataTable
          columns={[
            { key: 'app', label: 'App' },
            { key: 'status', label: 'Status' },
            { key: 'missing', label: 'Missing' },
            { key: 'cutoff', label: 'Cutoff unmet' },
            { key: 'queue', label: 'Queue' },
            { key: 'missingPages', label: 'Missing pages' },
            { key: 'cutoffPages', label: 'Cutoff pages' },
            { key: 'upserted', label: 'Upserted' },
            { key: 'ignored', label: 'Ignored' },
          ]}
          rows={rows.map((row) => ({
            app: formatServiceName(row.app),
          status: (
            <StatusBadge status={row.status === 'synced' ? 'success' : 'degraded'}>
              {row.status}
            </StatusBadge>
            ),
            missing: row.missingCount,
            cutoff: row.cutoffCount,
            queue: row.queueCount,
            missingPages: `${row.missingPagesFetched} / ${row.missingTotalPages}`,
            cutoffPages: `${row.cutoffPagesFetched} / ${row.cutoffTotalPages}`,
            upserted: row.upsertedCount,
            ignored: row.ignoredCount,
          }))}
        emptyMessage="No Arr sync summary is available for this run."
      />
    </SectionCard>
  );
};

const renderTransmissionSection = (summary: RunSummaryShape) => {
  if (!summary.transmissionSummary) {
    return null;
  }

  return (
    <SectionCard
      title="Transmission summary"
      subtitle="How the Transmission guard pass behaved during this run."
    >
      <StatsGrid>
        <StatCard
          label="Observed torrents"
          value={summary.transmissionSummary.observedCount}
        />
        <StatCard
          label="Linked torrents"
          value={summary.transmissionSummary.linkedCount}
        />
        <StatCard
          label="Removed torrents"
          value={summary.transmissionSummary.removedCount}
          tone={summary.transmissionSummary.removedCount > 0 ? 'warn' : 'default'}
        />
        <StatCard
          label="Suppressions created"
          value={summary.transmissionSummary.suppressionCount}
          tone={summary.transmissionSummary.suppressionCount > 0 ? 'warn' : 'default'}
        />
      </StatsGrid>
    </SectionCard>
  );
};

const renderDispatchSection = (summary: RunSummaryShape) => {
  if (!summary.dispatchSummary) {
    return null;
  }

  return (
    <SectionCard
      title="Dispatch summary"
      subtitle="What the decision engine and live dispatch phase produced."
    >
      <StatsGrid>
        <StatCard
          label="Mode"
          value={summary.dispatchSummary.dryRun ? 'Dry run' : 'Live dispatch'}
          tone={summary.dispatchSummary.dryRun ? 'warn' : 'success'}
        />
        <StatCard
          label="Dispatchable preview"
          value={summary.dispatchSummary.dryRunDispatchPreviewCount}
        />
        <StatCard
          label="Attempts persisted"
          value={summary.dispatchSummary.attemptsPersisted}
        />
        <StatCard
          label="Throttle reason"
          value={summary.dispatchSummary.throttleReason ?? 'none'}
          tone={summary.dispatchSummary.throttleReason ? 'warn' : 'default'}
        />
      </StatsGrid>
    </SectionCard>
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
  const attemptQuery = Array.isArray(resolvedSearchParams.q)
    ? (resolvedSearchParams.q[0] ?? '')
    : (resolvedSearchParams.q ?? '');
  const attemptApp = Array.isArray(resolvedSearchParams.app)
    ? (resolvedSearchParams.app[0] ?? '')
    : (resolvedSearchParams.app ?? '');
  const attemptDecision = Array.isArray(resolvedSearchParams.decision)
    ? (resolvedSearchParams.decision[0] ?? '')
    : (resolvedSearchParams.decision ?? '');
  const allAttempts = runtime.database.repositories.searchAttempts.listByRunId(id);
  const summary = toRunSummaryShape(run);
  const titleCache = new Map<string, string | null>();
  const resolveTitle = (mediaKey: string) => {
    if (!titleCache.has(mediaKey)) {
      titleCache.set(
        mediaKey,
        runtime.database.repositories.mediaItemState.getByMediaKey(mediaKey)?.title ??
          null
      );
    }

    return titleCache.get(mediaKey) ?? null;
  };
  const resolveMediaItem = (mediaKey: string) =>
    runtime.database.repositories.mediaItemState.getByMediaKey(mediaKey);
  const manualFetchMediaItem = summary.mediaKey
    ? resolveMediaItem(summary.mediaKey)
    : null;
  const filteredAttempts = allAttempts.filter((attempt) => {
    if (attemptApp && attempt.app !== attemptApp) {
      return false;
    }

    if (attemptDecision && attempt.decision !== attemptDecision) {
      return false;
    }

    if (attemptQuery.trim()) {
      const haystack = [
        resolveTitle(attempt.mediaKey) ?? '',
        attempt.mediaKey,
        attempt.reasonCode,
        attempt.outcome ?? '',
        attempt.app,
        attempt.decision,
      ]
        .join(' ')
        .toLowerCase();

      if (!haystack.includes(attemptQuery.trim().toLowerCase())) {
        return false;
      }
    }

    return true;
  });
  const currentPage = clampPage(
    parsePositivePage(resolvedSearchParams.page),
    filteredAttempts.length
  );
  const attempts = filteredAttempts.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );
  const displayMediaItems = await hydrateMediaDisplayRecords(runtime, [
    ...attempts.map((attempt) => attempt.mediaKey),
    ...(summary.mediaKey ? [summary.mediaKey] : []),
  ]);
  const resolveDisplayMediaItem = (mediaKey: string) => displayMediaItems.get(mediaKey) ?? null;
  const hydratedManualFetchMediaItem = summary.mediaKey
    ? resolveDisplayMediaItem(summary.mediaKey)
    : manualFetchMediaItem;

  return (
    <ConsoleShell
      title="Run detail"
      subtitle={`${formatRunTypeLabel(run.runType)} · ${formatTimestamp(run.startedAt)} · ${formatShortRunId(run.id)}`}
      activePath="/runs"
      currentUser={runtime.authenticated.user.username}
      mode={runtime.config.mode}
      schedulerStatus={runtime.scheduler.getStatus()}
      actionTokens={runtime.csrfTokens}
    >
      <Link href="/runs" className="console-link run-breadcrumb">
        ← Run history
      </Link>
      {renderRunSummarySection(run, summary, totalAttempts)}
      {renderManualFetchSection(summary, hydratedManualFetchMediaItem, runtime.config)}
      {renderSyncSection(summary)}
      {renderTransmissionSection(summary)}
      {renderDispatchSection(summary)}

      <SectionCard
        title="Attempt log"
        subtitle="One row per evaluated or dispatched item, with current title lookup where available."
        actions={renderPagination(id, currentPage, filteredAttempts.length, {
          query: attemptQuery,
          app: attemptApp,
          decision: attemptDecision,
        })}
      >
        <form
          action={buildRunDetailHref(id, 1)}
          method="get"
          className="candidate-filters"
        >
          <div className="candidate-filters__grid">
            <label className="candidate-filters__field candidate-filters__field--wide">
              <span>Search</span>
              <input
                type="search"
                name="q"
                defaultValue={attemptQuery}
                placeholder="Title, media key, reason, outcome, or decision"
              />
            </label>
            <label className="candidate-filters__field">
              <span>App</span>
              <select name="app" defaultValue={attemptApp}>
                <option value="">All apps</option>
                <option value="sonarr">Sonarr</option>
                <option value="radarr">Radarr</option>
              </select>
            </label>
            <label className="candidate-filters__field">
              <span>Decision</span>
              <select name="decision" defaultValue={attemptDecision}>
                <option value="">All decisions</option>
                <option value="dispatch">Dispatch</option>
                <option value="skip">Skip</option>
              </select>
            </label>
          </div>
          <div className="candidate-filters__actions">
            <span className="console-muted">
              {filteredAttempts.length} matching attempt row
              {filteredAttempts.length === 1 ? '' : 's'} of {totalAttempts}
            </span>
            <div className="transmission-controls__links">
              <a href={buildRunDetailHref(id, 1)} className="console-link">
                Clear filters
              </a>
              <button type="submit" className="console-button">
                Apply filters
              </button>
            </div>
          </div>
        </form>
        <DataTable
          columns={[
            { key: 'attemptedAt', label: 'Time' },
            { key: 'app', label: 'App' },
            { key: 'title', label: 'Title' },
            { key: 'mediaKey', label: 'Media key' },
            { key: 'decision', label: 'Decision' },
            { key: 'reason', label: 'Reason' },
            { key: 'outcome', label: 'Outcome' },
          ]}
          rows={buildAttemptRows(
            attempts,
            resolveTitle,
            resolveDisplayMediaItem,
            runtime.config
          )}
          emptyMessage="No attempt rows were recorded for this run."
        />
      </SectionCard>
    </ConsoleShell>
  );
}
