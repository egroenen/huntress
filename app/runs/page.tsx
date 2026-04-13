import Link from 'next/link';

import {
  readPersistedQueryState,
  withPersistedQueryState,
} from '@/src/server/persistent-query';
import { requireAuthenticatedConsoleContext } from '@/src/server/require-auth';
import {
  ConsoleHeaderActions,
  ConsoleShell,
  DataTable,
  QueryFilterForm,
  QueryFilterLink,
  SectionCard,
  StatusBadge,
  TablePagination,
} from '@/src/ui';
import { formatRunTypeLabel } from '@/src/ui/formatters';

export const dynamic = 'force-dynamic';

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
const RUNS_FILTER_COOKIE = 'huntress_runs_filters';
const RUNS_PERSISTED_QUERY_KEYS = ['pageSize', 'runType', 'status', 'from', 'to'] as const;

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

const formatDuration = (startedAt: string, finishedAt: string | null): string => {
  const started = new Date(startedAt).getTime();
  const finished = finishedAt ? new Date(finishedAt).getTime() : null;

  if (!Number.isFinite(started)) {
    return 'n/a';
  }

  if (finished === null || !Number.isFinite(finished)) {
    return 'In progress';
  }

  const totalSeconds = Math.max(Math.round((finished - started) / 1000), 0);

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

const parseStringParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? '') : (value ?? '');

const parsePositivePage = (value: string | string[] | undefined): number => {
  const parsed = Number.parseInt(parseStringParam(value), 10);

  if (Number.isNaN(parsed) || parsed < 1) {
    return 1;
  }

  return parsed;
};

const clampPage = (page: number, totalItems: number, pageSize: number): number => {
  const totalPages = Math.max(Math.ceil(totalItems / pageSize), 1);
  return Math.min(page, totalPages);
};

const parsePageSize = (value: string | string[] | undefined): number => {
  const parsed = Number.parseInt(parseStringParam(value), 10);
  return PAGE_SIZE_OPTIONS.includes(parsed as (typeof PAGE_SIZE_OPTIONS)[number])
    ? parsed
    : DEFAULT_PAGE_SIZE;
};

const normalizeDateStart = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed ? `${trimmed}T00:00:00.000Z` : null;
};

const normalizeDateEndExclusive = (value: string): string | null => {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const date = new Date(`${trimmed}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
};

const buildRunsHref = (input: {
  page: number;
  pageSize: number;
  runType: string;
  status: string;
  from: string;
  to: string;
}): string => {
  const params = new URLSearchParams();

  if (input.page > 1) {
    params.set('page', String(input.page));
  }

  if (input.pageSize !== DEFAULT_PAGE_SIZE) {
    params.set('pageSize', String(input.pageSize));
  }

  if (input.runType) {
    params.set('runType', input.runType);
  }

  if (input.status) {
    params.set('status', input.status);
  }

  if (input.from) {
    params.set('from', input.from);
  }

  if (input.to) {
    params.set('to', input.to);
  }

  const suffix = params.toString();
  return suffix ? `/runs?${suffix}` : '/runs';
};

export default async function RunsPage(props: { searchParams: SearchParams }) {
  const searchParams = withPersistedQueryState(
    await props.searchParams,
    await readPersistedQueryState(RUNS_FILTER_COOKIE, RUNS_PERSISTED_QUERY_KEYS)
  );
  const runtime = await requireAuthenticatedConsoleContext();
  const notice = parseStringParam(searchParams.notice).trim();
  const noticeStatus = parseStringParam(searchParams.status).trim();
  const pageSize = parsePageSize(searchParams.pageSize);
  const runType = parseStringParam(searchParams.runType).trim();
  const status = parseStringParam(searchParams.status).trim();
  const from = parseStringParam(searchParams.from).trim();
  const to = parseStringParam(searchParams.to).trim();
  const filter = {
    runType: runType || null,
    status: status || null,
    startedFrom: normalizeDateStart(from),
    startedTo: normalizeDateEndExclusive(to),
  };
  const totalRuns = runtime.database.repositories.runHistory.countFiltered(filter);
  const currentPage = clampPage(parsePositivePage(searchParams.page), totalRuns, pageSize);
  const runs = runtime.database.repositories.runHistory.listFilteredPage(
    filter,
    pageSize,
    (currentPage - 1) * pageSize
  );

  return (
    <ConsoleShell
      title="Run history"
      subtitle="Audit every sync and dispatch cycle, including manual runs and partial failures."
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
      <SectionCard
        title="Recent runs"
        subtitle="Newest runs appear first."
        actions={
          <TablePagination
            action="/runs"
            currentPage={currentPage}
            totalPages={Math.max(Math.ceil(totalRuns / pageSize), 1)}
            summary={
              totalRuns <= pageSize
                ? `Showing all ${totalRuns} recorded runs.`
                : `${totalRuns} recorded runs`
            }
            pageSize={pageSize}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            hiddenInputs={[
              ...(runType ? [{ name: 'runType', value: runType }] : []),
              ...(status ? [{ name: 'status', value: status }] : []),
              ...(from ? [{ name: 'from', value: from }] : []),
              ...(to ? [{ name: 'to', value: to }] : []),
            ]}
            firstHref={currentPage > 1 ? buildRunsHref({ page: 1, pageSize, runType, status, from, to }) : null}
            previousHref={
              currentPage > 1
                ? buildRunsHref({
                    page: currentPage - 1,
                    pageSize,
                    runType,
                    status,
                    from,
                    to,
                  })
                : null
            }
            nextHref={
              currentPage < Math.max(Math.ceil(totalRuns / pageSize), 1)
                ? buildRunsHref({
                    page: currentPage + 1,
                    pageSize,
                    runType,
                    status,
                    from,
                    to,
                  })
                : null
            }
            lastHref={
              currentPage < Math.max(Math.ceil(totalRuns / pageSize), 1)
                ? buildRunsHref({
                    page: Math.max(Math.ceil(totalRuns / pageSize), 1),
                    pageSize,
                    runType,
                    status,
                    from,
                    to,
                  })
                : null
            }
            persistenceCookieName={RUNS_FILTER_COOKIE}
            persistedQueryKeys={RUNS_PERSISTED_QUERY_KEYS}
          />
        }
      >
        {notice ? (
          <p
            className={
              noticeStatus === 'success'
                ? 'settings-notice is-success'
                : 'settings-notice is-error'
            }
          >
            {notice}
          </p>
        ) : null}

        <QueryFilterForm
          action="/runs"
          className="candidate-filters"
          persistenceCookieName={RUNS_FILTER_COOKIE}
          persistedQueryKeys={RUNS_PERSISTED_QUERY_KEYS}
        >
          <input type="hidden" name="pageSize" value={String(pageSize)} />
          <div className="candidate-filters__grid">
            <label className="candidate-filters__field">
              <span>Run type</span>
              <select name="runType" defaultValue={runType}>
                <option value="">All run types</option>
                <option value="scheduled">Scheduled</option>
                <option value="manual_live">Manual live</option>
                <option value="manual_dry">Manual dry</option>
                <option value="sync_only">Sync only</option>
              </select>
            </label>
            <label className="candidate-filters__field">
              <span>Status</span>
              <select name="status" defaultValue={status}>
                <option value="">All statuses</option>
                <option value="success">Success</option>
                <option value="partial">Partial</option>
                <option value="failed">Failed</option>
                <option value="running">Running</option>
              </select>
            </label>
            <label className="candidate-filters__field">
              <span>From</span>
              <input type="date" name="from" defaultValue={from} />
            </label>
            <label className="candidate-filters__field">
              <span>To</span>
              <input type="date" name="to" defaultValue={to} />
            </label>
          </div>
          <div className="candidate-filters__actions">
            <span className="console-muted">
              {totalRuns} matching run{totalRuns === 1 ? '' : 's'}
            </span>
            <div className="transmission-controls__links">
              <QueryFilterLink
                href={buildRunsHref({
                  page: 1,
                  pageSize,
                  runType: '',
                  status: '',
                  from: '',
                  to: '',
                })}
                className="console-link"
                persistenceCookieName={RUNS_FILTER_COOKIE}
                persistedQueryKeys={RUNS_PERSISTED_QUERY_KEYS}
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
            { key: 'runType', label: 'Run type' },
            { key: 'status', label: 'Status' },
            { key: 'startedAt', label: 'Started' },
            { key: 'finishedAt', label: 'Finished' },
            { key: 'duration', label: 'Duration' },
            { key: 'candidates', label: 'Candidates', align: 'right' },
            { key: 'dispatches', label: 'Dispatches', align: 'right' },
            { key: 'skips', label: 'Skips', align: 'right' },
            { key: 'errors', label: 'Errors', align: 'right' },
            { key: 'detail', label: 'Detail', align: 'right' },
          ]}
          rows={runs.map((run) => ({
            runType: formatRunTypeLabel(run.runType),
            status: <StatusBadge status={run.status}>{run.status}</StatusBadge>,
            startedAt: formatTimestamp(run.startedAt),
            finishedAt: formatTimestamp(run.finishedAt),
            duration: formatDuration(run.startedAt, run.finishedAt),
            candidates: run.candidateCount,
            dispatches: run.dispatchCount,
            skips: run.skipCount,
            errors: run.errorCount,
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
