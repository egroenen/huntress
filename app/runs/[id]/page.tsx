import Link from 'next/link';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';

import type { RunHistoryRecord, SearchAttemptRecord } from '@/src/db';
import { hydrateMediaDisplayRecords } from '@/src/server/media-display';
import {
  readPersistedQueryState,
  withPersistedQueryState,
} from '@/src/server/persistent-query';
import { requireAuthenticatedConsoleContext } from '@/src/server/require-auth';
import {
  formatRunDuration,
  formatRunTimestamp,
  getAppSyncRows,
  toRunSummaryShape,
  type RunSummaryShape,
} from '@/src/server/run-summary';
import {
  ConsoleHeaderActions,
  ConsoleShell,
  DataTable,
  MediaItemLink,
  QueryFilterForm,
  QueryFilterLink,
  ReasonCodeBadge,
  SectionCard,
  StatCard,
  StatsGrid,
  StatusBadge,
  TablePagination,
} from '@/src/ui';
import {
  formatRunTypeLabel,
  formatServiceName,
  formatShortRunId,
} from '@/src/ui/formatters';

export const dynamic = 'force-dynamic';

const ATTEMPT_PAGE_SIZE = 100;
const RUN_EVENT_PAGE_SIZE = 10;
const ATTEMPT_PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;
const RUN_EVENT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const RUN_DETAIL_FILTER_COOKIE = 'huntress_run_detail_filters';
const RUN_DETAIL_PERSISTED_QUERY_KEYS = [
  'q',
  'app',
  'decision',
  'attemptPageSize',
  'eventPageSize',
] as const;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const formatProgress = (current: number | null, total: number | null): string => {
  if (current === null && total === null) {
    return 'n/a';
  }

  if (current !== null && total !== null) {
    return `${current} / ${total}`;
  }

  return String(current ?? total);
};

const toActivityBadgeStatus = (
  level: 'info' | 'warn' | 'error'
): 'success' | 'degraded' | 'failed' => {
  if (level === 'error') {
    return 'failed';
  }

  if (level === 'warn') {
    return 'degraded';
  }

  return 'success';
};

const parsePositivePage = (value: string | string[] | undefined): number => {
  const normalized = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(normalized ?? '', 10);

  if (Number.isNaN(parsed) || parsed < 1) {
    return 1;
  }

  return parsed;
};

const parsePageSize = (
  value: string | string[] | undefined,
  options: readonly number[],
  fallback: number
): number => {
  const normalized = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(normalized ?? '', 10);

  return options.includes(parsed) ? parsed : fallback;
};

const clampPage = (page: number, totalItems: number, pageSize: number): number => {
  const totalPages = Math.max(Math.ceil(totalItems / pageSize), 1);
  return Math.min(page, totalPages);
};

const buildRunDetailHref = (
  runId: string,
  input: {
    attemptPage?: number;
    eventPage?: number;
    attemptPageSize?: number;
    eventPageSize?: number;
    query?: string;
    app?: string;
    decision?: string;
  } = {}
): string => {
  const params = new URLSearchParams();

  if (input.query?.trim()) {
    params.set('q', input.query.trim());
  }

  if (input.app) {
    params.set('app', input.app);
  }

  if (input.decision) {
    params.set('decision', input.decision);
  }

  if (
    input.attemptPageSize !== undefined &&
    input.attemptPageSize !== ATTEMPT_PAGE_SIZE
  ) {
    params.set('attemptPageSize', String(input.attemptPageSize));
  }

  if (
    input.eventPageSize !== undefined &&
    input.eventPageSize !== RUN_EVENT_PAGE_SIZE
  ) {
    params.set('eventPageSize', String(input.eventPageSize));
  }

  if ((input.attemptPage ?? 1) > 1) {
    params.set('page', String(input.attemptPage));
  }

  if ((input.eventPage ?? 1) > 1) {
    params.set('eventPage', String(input.eventPage));
  }

  const suffix = params.toString();

  return suffix ? `/runs/${runId}?${suffix}` : `/runs/${runId}`;
};

const renderAttemptPagination = (
  runId: string,
  currentPage: number,
  totalItems: number,
  input: {
    pageSize: number;
    query: string;
    app: string;
    decision: string;
    eventPage: number;
    eventPageSize: number;
  }
): ReactNode => {
  const totalPages = Math.max(Math.ceil(totalItems / input.pageSize), 1);
  return (
    <TablePagination
      action={`/runs/${runId}`}
      currentPage={currentPage}
      totalPages={totalPages}
      summary={
        totalItems <= input.pageSize
          ? `Showing all ${totalItems} attempt rows for this run.`
          : `${totalItems} attempt rows`
      }
      pageSize={input.pageSize}
      pageSizeParamName="attemptPageSize"
      pageSizeOptions={ATTEMPT_PAGE_SIZE_OPTIONS}
      hiddenInputs={[
        ...(input.query ? [{ name: 'q', value: input.query }] : []),
        ...(input.app ? [{ name: 'app', value: input.app }] : []),
        ...(input.decision ? [{ name: 'decision', value: input.decision }] : []),
        ...(input.eventPage > 1 ? [{ name: 'eventPage', value: String(input.eventPage) }] : []),
        ...(input.eventPageSize !== RUN_EVENT_PAGE_SIZE
          ? [{ name: 'eventPageSize', value: String(input.eventPageSize) }]
          : []),
      ]}
      firstHref={
        currentPage > 1
          ? buildRunDetailHref(runId, { ...input, attemptPage: 1, attemptPageSize: input.pageSize })
          : null
      }
      previousHref={
        currentPage > 1
          ? buildRunDetailHref(runId, {
              ...input,
              attemptPage: currentPage - 1,
              attemptPageSize: input.pageSize,
            })
          : null
      }
      nextHref={
        currentPage < totalPages
          ? buildRunDetailHref(runId, {
              ...input,
              attemptPage: currentPage + 1,
              attemptPageSize: input.pageSize,
            })
          : null
      }
      lastHref={
        currentPage < totalPages
          ? buildRunDetailHref(runId, {
              ...input,
              attemptPage: totalPages,
              attemptPageSize: input.pageSize,
            })
          : null
      }
      persistenceCookieName={RUN_DETAIL_FILTER_COOKIE}
      persistedQueryKeys={RUN_DETAIL_PERSISTED_QUERY_KEYS}
    />
  );
};

const renderRunEventPagination = (
  runId: string,
  currentPage: number,
  totalItems: number,
  input: {
    pageSize: number;
    attemptPage: number;
    attemptPageSize: number;
    query: string;
    app: string;
    decision: string;
  }
): ReactNode => {
  const totalPages = Math.max(Math.ceil(totalItems / input.pageSize), 1);
  return (
    <TablePagination
      action={`/runs/${runId}`}
      currentPage={currentPage}
      totalPages={totalPages}
      summary={
        totalItems <= input.pageSize
          ? `Showing all ${totalItems} run events.`
          : `${totalItems} run events`
      }
      pageSize={input.pageSize}
      pageSizeParamName="eventPageSize"
      pageParamName="eventPage"
      pageSizeOptions={RUN_EVENT_PAGE_SIZE_OPTIONS}
      hiddenInputs={[
        ...(input.attemptPage > 1 ? [{ name: 'page', value: String(input.attemptPage) }] : []),
        ...(input.attemptPageSize !== ATTEMPT_PAGE_SIZE
          ? [{ name: 'attemptPageSize', value: String(input.attemptPageSize) }]
          : []),
        ...(input.query ? [{ name: 'q', value: input.query }] : []),
        ...(input.app ? [{ name: 'app', value: input.app }] : []),
        ...(input.decision ? [{ name: 'decision', value: input.decision }] : []),
      ]}
      firstHref={
        currentPage > 1
          ? buildRunDetailHref(runId, { ...input, eventPage: 1, eventPageSize: input.pageSize })
          : null
      }
      previousHref={
        currentPage > 1
          ? buildRunDetailHref(runId, {
              ...input,
              eventPage: currentPage - 1,
              eventPageSize: input.pageSize,
            })
          : null
      }
      nextHref={
        currentPage < totalPages
          ? buildRunDetailHref(runId, {
              ...input,
              eventPage: currentPage + 1,
              eventPageSize: input.pageSize,
            })
          : null
      }
      lastHref={
        currentPage < totalPages
          ? buildRunDetailHref(runId, {
              ...input,
              eventPage: totalPages,
              eventPageSize: input.pageSize,
            })
          : null
      }
      persistenceCookieName={RUN_DETAIL_FILTER_COOKIE}
      persistedQueryKeys={RUN_DETAIL_PERSISTED_QUERY_KEYS}
    />
  );
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
      attemptedAt: formatRunTimestamp(attempt.attemptedAt),
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
          value={formatRunDuration(run.startedAt, run.finishedAt)}
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
          <strong>{formatRunTimestamp(run.startedAt)}</strong>
        </div>
        <div>
          <span className="console-meta__label">Finished</span>
          <strong>{formatRunTimestamp(run.finishedAt)}</strong>
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
            <span className="console-meta__label">Dispatch kind</span>
            <strong>
              {summary.dispatchKind ? summary.dispatchKind.replaceAll('_', ' ') : 'n/a'}
            </strong>
          </div>
        <div>
          <span className="console-meta__label">Error</span>
          <strong>{summary.error?.message ?? 'none'}</strong>
        </div>
      </div>
      {summary.releaseSelection ? (
        <div className="latest-run__summary">
          <div>
            <span className="console-meta__label">Selection mode</span>
            <strong>
              {(summary.releaseSelection.mode ?? 'n/a').replaceAll('_', ' ')}
            </strong>
          </div>
          <div>
            <span className="console-meta__label">Selected release</span>
            <strong>{summary.releaseSelection.selectedReleaseTitle ?? 'none'}</strong>
          </div>
          <div>
            <span className="console-meta__label">Quality</span>
            <strong>{summary.releaseSelection.selectedReleaseQuality ?? 'n/a'}</strong>
          </div>
          <div>
            <span className="console-meta__label">Upgrade priority</span>
            <strong>{summary.releaseSelection.upgradePriority ? 'Yes' : 'No'}</strong>
          </div>
        </div>
      ) : null}
    </SectionCard>
  );
};

const renderSyncSection = (summary: RunSummaryShape) => {
  const rows = getAppSyncRows(summary);

  if (rows.length === 0) {
    return null;
  }

  return (
    <SectionCard
      title="Sync summary"
      subtitle={`Arr state snapshot taken at ${formatRunTimestamp(summary.syncSummary?.syncedAt ?? null)}.`}
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
        <StatCard
          label="Direct release grabs"
          value={summary.dispatchSummary.releaseSelectionSummary?.directGrabCount ?? 0}
          tone={
            (summary.dispatchSummary.releaseSelectionSummary?.directGrabCount ?? 0) > 0
              ? 'success'
              : 'default'
          }
        />
        <StatCard
          label="Fallback upgrade grabs"
          value={
            summary.dispatchSummary.releaseSelectionSummary?.fallbackUpgradeCount ?? 0
          }
          tone={
            (summary.dispatchSummary.releaseSelectionSummary?.fallbackUpgradeCount ?? 0) >
            0
              ? 'warn'
              : 'default'
          }
        />
      </StatsGrid>
      {summary.dispatchSummary.releaseSelectionSummary?.selections?.length ? (
        <DataTable
          columns={[
            { key: 'app', label: 'App' },
            { key: 'title', label: 'Item' },
            { key: 'mode', label: 'Selection mode' },
            { key: 'release', label: 'Selected release' },
            { key: 'quality', label: 'Quality' },
            { key: 'reason', label: 'Reason' },
          ]}
          rows={summary.dispatchSummary.releaseSelectionSummary.selections
            .slice(0, 10)
            .map((selection) => ({
              app: formatServiceName(selection.app),
              title: selection.title,
              mode: selection.mode.replaceAll('_', ' '),
              release: selection.selectedReleaseTitle ?? 'Blind Arr search',
              quality:
                selection.selectedReleaseQuality && selection.selectedReleaseResolution
                  ? `${selection.selectedReleaseQuality} · ${selection.selectedReleaseResolution}p`
                  : selection.selectedReleaseQuality ??
                    (selection.selectedReleaseResolution
                      ? `${selection.selectedReleaseResolution}p`
                      : 'n/a'),
              reason: selection.reason,
            }))}
          emptyMessage="No release-selection actions were recorded."
        />
      ) : null}
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
  const [persistedQueryState, { id }, resolvedSearchParams, runtime] = await Promise.all([
    readPersistedQueryState(RUN_DETAIL_FILTER_COOKIE, RUN_DETAIL_PERSISTED_QUERY_KEYS),
    params,
    searchParams,
    requireAuthenticatedConsoleContext(),
  ]);
  const persistedSearchParams = withPersistedQueryState(
    resolvedSearchParams,
    persistedQueryState
  );
  const run = runtime.database.repositories.runHistory.getById(id);

  if (!run) {
    notFound();
  }

  const totalAttempts = runtime.database.repositories.searchAttempts.countByRunId(id);
  const totalRunEvents = runtime.database.repositories.activityLog.countByRunId(id);
  const attemptPageSize = parsePageSize(
    persistedSearchParams.attemptPageSize,
    ATTEMPT_PAGE_SIZE_OPTIONS,
    ATTEMPT_PAGE_SIZE
  );
  const eventPageSize = parsePageSize(
    persistedSearchParams.eventPageSize,
    RUN_EVENT_PAGE_SIZE_OPTIONS,
    RUN_EVENT_PAGE_SIZE
  );
  const attemptQuery = Array.isArray(persistedSearchParams.q)
    ? (persistedSearchParams.q[0] ?? '')
    : (persistedSearchParams.q ?? '');
  const attemptApp = Array.isArray(persistedSearchParams.app)
    ? (persistedSearchParams.app[0] ?? '')
    : (persistedSearchParams.app ?? '');
  const attemptDecision = Array.isArray(persistedSearchParams.decision)
    ? (persistedSearchParams.decision[0] ?? '')
    : (persistedSearchParams.decision ?? '');
  const currentEventPage = clampPage(
    parsePositivePage(persistedSearchParams.eventPage),
    totalRunEvents,
    eventPageSize
  );
  const runEvents = runtime.database.repositories.activityLog.listPageByRunId(
    id,
    eventPageSize,
    (currentEventPage - 1) * eventPageSize
  );
  const allAttempts = runtime.database.repositories.searchAttempts.listByRunId(id);
  const summary = toRunSummaryShape(run.summary);
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
    parsePositivePage(persistedSearchParams.page),
    filteredAttempts.length,
    attemptPageSize
  );
  const attempts = filteredAttempts.slice(
    (currentPage - 1) * attemptPageSize,
    currentPage * attemptPageSize
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
      subtitle={`${formatRunTypeLabel(run.runType)} · ${formatRunTimestamp(run.startedAt)} · ${formatShortRunId(run.id)}`}
      activePath="/runs"
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
      <Link href="/runs" className="console-link run-breadcrumb">
        ← Run history
      </Link>
      {renderRunSummarySection(run, summary, totalAttempts)}
      {renderManualFetchSection(summary, hydratedManualFetchMediaItem, runtime.config)}
      {renderSyncSection(summary)}
      {renderTransmissionSection(summary)}
      {renderDispatchSection(summary)}
      <SectionCard
        title="Run event log"
        subtitle="Detailed stage-by-stage events recorded for this run."
        actions={renderRunEventPagination(id, currentEventPage, totalRunEvents, {
          pageSize: eventPageSize,
          attemptPage: currentPage,
          attemptPageSize,
          query: attemptQuery,
          app: attemptApp,
          decision: attemptDecision,
        })}
      >
        <DataTable
          columns={[
            { key: 'time', label: 'Time' },
            { key: 'source', label: 'Source' },
            { key: 'stage', label: 'Stage' },
            { key: 'message', label: 'Message' },
            { key: 'progress', label: 'Progress', align: 'right' },
          ]}
          rows={runEvents.map((event) => ({
            time: formatRunTimestamp(event.occurredAt),
            source: formatServiceName(event.source),
            stage: (
              <span className="activity-stage">
                <StatusBadge status={toActivityBadgeStatus(event.level)}>
                  {event.level}
                </StatusBadge>
                <code className="reason-code">{event.stage}</code>
              </span>
            ),
            message: (
              <div className="activity-message">
                <strong>{event.message}</strong>
                {event.detail ? <small>{event.detail}</small> : null}
              </div>
            ),
            progress: formatProgress(event.progressCurrent, event.progressTotal),
          }))}
          emptyMessage="No detailed activity log was recorded for this run."
        />
      </SectionCard>

      <SectionCard
        title="Attempt log"
        subtitle="One row per evaluated or dispatched item, with current title lookup where available."
        actions={renderAttemptPagination(id, currentPage, filteredAttempts.length, {
          pageSize: attemptPageSize,
          query: attemptQuery,
          app: attemptApp,
          decision: attemptDecision,
          eventPage: currentEventPage,
          eventPageSize,
        })}
      >
        <QueryFilterForm
          action={buildRunDetailHref(id, {
            eventPage: currentEventPage,
            attemptPageSize,
            eventPageSize,
          })}
          className="candidate-filters"
          persistenceCookieName={RUN_DETAIL_FILTER_COOKIE}
          persistedQueryKeys={RUN_DETAIL_PERSISTED_QUERY_KEYS}
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
              <QueryFilterLink
                href={buildRunDetailHref(id, {
                  eventPage: currentEventPage,
                  attemptPageSize,
                  eventPageSize,
                })}
                className="console-link"
                persistenceCookieName={RUN_DETAIL_FILTER_COOKIE}
                persistedQueryKeys={RUN_DETAIL_PERSISTED_QUERY_KEYS}
              >
                Clear filters
              </QueryFilterLink>
              <button type="submit" className="console-button">
                Apply filters
              </button>
            </div>
          </div>
        </QueryFilterForm>
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
