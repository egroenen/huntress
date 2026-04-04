import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';

import type { RunHistoryRecord, SearchAttemptRecord } from '@/src/db';
import { requireAuthenticatedConsoleContext } from '@/src/server/require-auth';
import {
  ConsoleShell,
  DataTable,
  ReasonCodeBadge,
  SectionCard,
  StatCard,
  StatsGrid,
  StatusBadge,
} from '@/src/ui';

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
  resolveTitle: (mediaKey: string) => string | null
) => {
  return attempts.map((attempt) => {
    const title = resolveTitle(attempt.mediaKey);

    return {
      attemptedAt: formatTimestamp(attempt.attemptedAt),
      app: attempt.app,
      title: title ?? <span className="console-muted">Unknown title</span>,
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
        <StatCard label="Run type" value={run.runType.replace('_', ' ')} />
        <StatCard label="Status" value={run.status} tone={run.status === 'success' ? 'success' : run.status === 'failed' ? 'danger' : 'warn'} />
        <StatCard label="Duration" value={formatDuration(run.startedAt, run.finishedAt)} />
        <StatCard label="Attempt rows" value={totalAttempts} />
        <StatCard label="Candidates" value={run.candidateCount} />
        <StatCard label="Dispatches" value={run.dispatchCount} tone={run.dispatchCount > 0 ? 'success' : 'default'} />
        <StatCard label="Skips" value={run.skipCount} tone={run.skipCount > 0 ? 'warn' : 'default'} />
        <StatCard label="Errors" value={run.errorCount} tone={run.errorCount > 0 ? 'danger' : 'default'} />
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
          <strong>{summary.requestedRunType?.replace('_', ' ') ?? run.runType.replace('_', ' ')}</strong>
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

const renderManualFetchSection = (summary: RunSummaryShape) => {
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
          <strong>{summary.title ?? 'Unknown title'}</strong>
        </div>
        <div>
          <span className="console-meta__label">Media key</span>
          <strong>{summary.mediaKey ?? 'n/a'}</strong>
        </div>
        <div>
          <span className="console-meta__label">App</span>
          <strong>{summary.app ?? 'n/a'}</strong>
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
          { key: 'pages', label: 'Pages fetched' },
          { key: 'upserted', label: 'Upserted' },
          { key: 'ignored', label: 'Ignored' },
        ]}
        rows={rows.map((row) => ({
          app: row.app,
          status: (
            <StatusBadge status={row.status === 'synced' ? 'success' : 'degraded'}>
              {row.status}
            </StatusBadge>
          ),
          missing: row.missingCount,
          cutoff: row.cutoffCount,
          queue: row.queueCount,
          pages: `missing ${row.missingPagesFetched}/${row.missingTotalPages}, cutoff ${row.cutoffPagesFetched}/${row.cutoffTotalPages}`,
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
        <StatCard label="Observed torrents" value={summary.transmissionSummary.observedCount} />
        <StatCard label="Linked torrents" value={summary.transmissionSummary.linkedCount} />
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
  const currentPage = clampPage(parsePositivePage(resolvedSearchParams.page), totalAttempts);
  const attempts = runtime.database.repositories.searchAttempts.listPageByRunId(
    id,
    PAGE_SIZE,
    (currentPage - 1) * PAGE_SIZE
  );
  const summary = toRunSummaryShape(run);
  const titleCache = new Map<string, string | null>();
  const resolveTitle = (mediaKey: string) => {
    if (!titleCache.has(mediaKey)) {
      titleCache.set(
        mediaKey,
        runtime.database.repositories.mediaItemState.getByMediaKey(mediaKey)?.title ?? null
      );
    }

    return titleCache.get(mediaKey) ?? null;
  };

  return (
    <ConsoleShell
      title="Run detail"
      subtitle={`Detailed attempt records and operational summary for ${run.id}.`}
      activePath="/runs"
      currentUser={runtime.authenticated.user.username}
      mode={runtime.config.mode}
      schedulerStatus={runtime.scheduler.getStatus()}
      actionTokens={runtime.csrfTokens}
    >
      {renderRunSummarySection(run, summary, totalAttempts)}
      {renderManualFetchSection(summary)}
      {renderSyncSection(summary)}
      {renderTransmissionSection(summary)}
      {renderDispatchSection(summary)}

      <SectionCard
        title="Attempt log"
        subtitle="One row per evaluated or dispatched item, with current title lookup where available."
        actions={renderPagination(id, currentPage, totalAttempts)}
      >
        <DataTable
          columns={[
            { key: 'attemptedAt', label: 'At' },
            { key: 'app', label: 'App' },
            { key: 'title', label: 'Title' },
            { key: 'mediaKey', label: 'Media key' },
            { key: 'decision', label: 'Decision' },
            { key: 'reason', label: 'Reason' },
            { key: 'outcome', label: 'Outcome' },
          ]}
          rows={buildAttemptRows(attempts, resolveTitle)}
          emptyMessage="No attempt rows were recorded for this run."
        />
      </SectionCard>
    </ConsoleShell>
  );
}
