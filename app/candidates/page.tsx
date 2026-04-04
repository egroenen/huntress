import type { ReactNode } from 'react';

import type { CandidateDecision } from '@/src/domain';
import { getDashboardCandidateSnapshot } from '@/src/server/console-data';
import { requireAuthenticatedConsoleContext } from '@/src/server/require-auth';
import {
  ConsoleShell,
  DataTable,
  ReasonCodeBadge,
  SectionCard,
  StatusBadge,
} from '@/src/ui';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;
const DEFAULT_SORT = 'engine';

type CandidateSort =
  | 'engine'
  | 'title_asc'
  | 'title_desc'
  | 'retry_desc'
  | 'retry_asc'
  | 'next_eligible_asc'
  | 'next_eligible_desc';

type CandidateFilterDecision = 'all' | 'dispatch' | 'skip';
type CandidateFilterWantedState = 'all' | 'missing' | 'cutoff_unmet' | 'ignored';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

interface CandidateFilters {
  query: string;
  decision: CandidateFilterDecision;
  wantedState: CandidateFilterWantedState;
  sort: CandidateSort;
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

const parsePositivePage = (
  value: string | string[] | undefined
): number => {
  const normalized = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(normalized ?? '', 10);

  if (Number.isNaN(parsed) || parsed < 1) {
    return 1;
  }

  return parsed;
};

const parseStringParam = (value: string | string[] | undefined): string => {
  return Array.isArray(value) ? value[0] ?? '' : (value ?? '');
};

const parseDecisionFilter = (
  value: string | string[] | undefined
): CandidateFilterDecision => {
  const normalized = parseStringParam(value);

  return normalized === 'dispatch' || normalized === 'skip' ? normalized : 'all';
};

const parseWantedStateFilter = (
  value: string | string[] | undefined
): CandidateFilterWantedState => {
  const normalized = parseStringParam(value);

  return normalized === 'missing' ||
    normalized === 'cutoff_unmet' ||
    normalized === 'ignored'
    ? normalized
    : 'all';
};

const parseSort = (value: string | string[] | undefined): CandidateSort => {
  const normalized = parseStringParam(value);

  switch (normalized) {
    case 'title_asc':
    case 'title_desc':
    case 'retry_desc':
    case 'retry_asc':
    case 'next_eligible_asc':
    case 'next_eligible_desc':
      return normalized;
    default:
      return DEFAULT_SORT;
  }
};

const clampPage = (page: number, totalItems: number): number => {
  const totalPages = Math.max(Math.ceil(totalItems / PAGE_SIZE), 1);
  return Math.min(page, totalPages);
};

const buildCandidateParams = (
  filters: CandidateFilters,
  pages: {
    sonarrPage: number;
    radarrPage: number;
  }
): URLSearchParams => {
  const params = new URLSearchParams();

  if (filters.query) {
    params.set('q', filters.query);
  }

  if (filters.decision !== 'all') {
    params.set('decision', filters.decision);
  }

  if (filters.wantedState !== 'all') {
    params.set('wantedState', filters.wantedState);
  }

  if (filters.sort !== DEFAULT_SORT) {
    params.set('sort', filters.sort);
  }

  params.set('sonarrPage', String(pages.sonarrPage));
  params.set('radarrPage', String(pages.radarrPage));

  return params;
};

const buildPageHref = (
  sonarrPage: number,
  radarrPage: number,
  filters: CandidateFilters
): string => {
  return `/candidates?${buildCandidateParams(filters, { sonarrPage, radarrPage }).toString()}`;
};

const renderPagination = (input: {
  app: 'sonarr' | 'radarr';
  appLabel: string;
  currentPage: number;
  totalItems: number;
  matchingItems: number;
  otherPage: number;
  filters: CandidateFilters;
}): ReactNode => {
  const totalPages = Math.max(Math.ceil(input.totalItems / PAGE_SIZE), 1);

  if (input.totalItems <= PAGE_SIZE) {
    return (
      <span className="console-muted">
        Showing all {input.totalItems} matching {input.appLabel.toLowerCase()} candidates.
        {input.matchingItems !== input.totalItems
          ? ` (${input.matchingItems} total after filtering).`
          : null}
      </span>
    );
  }

  const previousPage = Math.max(input.currentPage - 1, 1);
  const nextPage = Math.min(input.currentPage + 1, totalPages);
  const previousHref =
    input.app === 'sonarr'
      ? buildPageHref(previousPage, input.otherPage, input.filters)
      : buildPageHref(input.otherPage, previousPage, input.filters);
  const nextHref =
    input.app === 'sonarr'
      ? buildPageHref(nextPage, input.otherPage, input.filters)
      : buildPageHref(input.otherPage, nextPage, input.filters);

  return (
    <div className="table-pagination">
      <span className="console-muted">
        Page {input.currentPage} of {totalPages} · {input.totalItems} matching candidates
        {input.matchingItems !== input.totalItems
          ? ` (${input.matchingItems} total after filtering)`
          : null}
      </span>
      <div className="table-pagination__links">
        {input.currentPage > 1 ? (
          <a href={previousHref} className="console-link">
            Previous
          </a>
        ) : (
          <span className="console-muted">Previous</span>
        )}
        {input.currentPage < totalPages ? (
          <a href={nextHref} className="console-link">
            Next
          </a>
        ) : (
          <span className="console-muted">Next</span>
        )}
      </div>
    </div>
  );
};

const getComparableTimestamp = (value: string | null): number | null => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.getTime() : null;
};

const compareNullableNumbers = (
  left: number | null,
  right: number | null,
  direction: 'asc' | 'desc'
): number => {
  if (left === null && right === null) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  return direction === 'asc' ? left - right : right - left;
};

const compareCandidatesBySort = (
  left: CandidateDecision,
  right: CandidateDecision,
  sort: Exclude<CandidateSort, 'engine'>
): number => {
  switch (sort) {
    case 'title_asc':
      return left.title.localeCompare(right.title);
    case 'title_desc':
      return right.title.localeCompare(left.title);
    case 'retry_desc':
      return right.retryCount - left.retryCount;
    case 'retry_asc':
      return left.retryCount - right.retryCount;
    case 'next_eligible_asc':
      return compareNullableNumbers(
        getComparableTimestamp(left.nextEligibleAt),
        getComparableTimestamp(right.nextEligibleAt),
        'asc'
      );
    case 'next_eligible_desc':
      return compareNullableNumbers(
        getComparableTimestamp(left.nextEligibleAt),
        getComparableTimestamp(right.nextEligibleAt),
        'desc'
      );
  }
};

const sortCandidates = (
  candidates: CandidateDecision[],
  sort: CandidateSort
): CandidateDecision[] => {
  if (sort === DEFAULT_SORT) {
    return candidates;
  }

  return candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort((left, right) => {
      const previousComparison = compareCandidatesBySort(left.candidate, right.candidate, sort);

      if (previousComparison !== 0) {
        return previousComparison;
      }

      return left.index - right.index;
    })
    .map((entry) => entry.candidate);
};

const filterCandidates = (
  candidates: CandidateDecision[],
  filters: CandidateFilters
): CandidateDecision[] => {
  const query = filters.query.trim().toLowerCase();

  return candidates.filter((candidate) => {
    if (filters.decision !== 'all' && candidate.decision !== filters.decision) {
      return false;
    }

    if (
      filters.wantedState !== 'all' &&
      candidate.wantedState !== filters.wantedState
    ) {
      return false;
    }

    if (!query) {
      return true;
    }

    const haystack = [
      candidate.title,
      candidate.mediaKey,
      candidate.reasonCode,
      candidate.wantedState,
      candidate.decision,
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(query);
  });
};

export default async function CandidatesPage(props: { searchParams: SearchParams }) {
  const runtime = await requireAuthenticatedConsoleContext();
  const searchParams = await props.searchParams;
  const candidates = getDashboardCandidateSnapshot(runtime);
  const filters: CandidateFilters = {
    query: parseStringParam(searchParams.q).trim(),
    decision: parseDecisionFilter(searchParams.decision),
    wantedState: parseWantedStateFilter(searchParams.wantedState),
    sort: parseSort(searchParams.sort),
  };
  const filteredCandidates = {
    sonarr: sortCandidates(filterCandidates(candidates.sonarr, filters), filters.sort),
    radarr: sortCandidates(filterCandidates(candidates.radarr, filters), filters.sort),
  };
  const sonarrPage = clampPage(
    parsePositivePage(searchParams.sonarrPage),
    filteredCandidates.sonarr.length
  );
  const radarrPage = clampPage(
    parsePositivePage(searchParams.radarrPage),
    filteredCandidates.radarr.length
  );
  const sonarrStart = (sonarrPage - 1) * PAGE_SIZE;
  const radarrStart = (radarrPage - 1) * PAGE_SIZE;
  const pagedCandidates = {
    sonarr: filteredCandidates.sonarr.slice(sonarrStart, sonarrStart + PAGE_SIZE),
    radarr: filteredCandidates.radarr.slice(radarrStart, radarrStart + PAGE_SIZE),
  };

  return (
    <ConsoleShell
      title="Candidate preview"
      subtitle="This page shows the decision engine output before any live dispatch occurs."
      activePath="/candidates"
      currentUser={runtime.authenticated.user.username}
      mode={runtime.config.mode}
      schedulerStatus={runtime.scheduler.getStatus()}
      actionTokens={runtime.csrfTokens}
    >
      <SectionCard
        title="Search, filter, and sort"
        subtitle="Apply one shared view across both Sonarr and Radarr candidate lists."
      >
        <form action="/candidates" method="get" className="candidate-filters">
          <div className="candidate-filters__grid">
            <label className="candidate-filters__field candidate-filters__field--wide">
              <span>Search</span>
              <input
                type="search"
                name="q"
                defaultValue={filters.query}
                placeholder="Title, media key, reason code, or wanted state"
              />
            </label>

            <label className="candidate-filters__field">
              <span>Decision</span>
              <select name="decision" defaultValue={filters.decision}>
                <option value="all">All decisions</option>
                <option value="dispatch">Dispatch only</option>
                <option value="skip">Skip only</option>
              </select>
            </label>

            <label className="candidate-filters__field">
              <span>Wanted state</span>
              <select name="wantedState" defaultValue={filters.wantedState}>
                <option value="all">All states</option>
                <option value="missing">Missing</option>
                <option value="cutoff_unmet">Cutoff unmet</option>
                <option value="ignored">Ignored</option>
              </select>
            </label>

            <label className="candidate-filters__field">
              <span>Sort</span>
              <select name="sort" defaultValue={filters.sort}>
                <option value="engine">Decision engine order</option>
                <option value="title_asc">Title A-Z</option>
                <option value="title_desc">Title Z-A</option>
                <option value="retry_desc">Retry count high-low</option>
                <option value="retry_asc">Retry count low-high</option>
                <option value="next_eligible_asc">Next eligible soonest</option>
                <option value="next_eligible_desc">Next eligible latest</option>
              </select>
            </label>
          </div>

          <div className="candidate-filters__actions">
            <a href="/candidates" className="console-link">
              Clear filters
            </a>
            <button type="submit" className="console-button">
              Apply view
            </button>
          </div>
        </form>
      </SectionCard>

      {(['sonarr', 'radarr'] as const).map((app) => (
        <SectionCard
          key={app}
          title={app === 'sonarr' ? 'Sonarr candidates' : 'Radarr candidates'}
          subtitle={`Separate policy evaluation for ${app}. Showing ${pagedCandidates[app].length} of ${filteredCandidates[app].length} matching candidates.`}
          actions={
            app === 'sonarr'
              ? renderPagination({
                  app: 'sonarr',
                  appLabel: 'Sonarr',
                  currentPage: sonarrPage,
                  totalItems: filteredCandidates.sonarr.length,
                  matchingItems: candidates.sonarr.length,
                  otherPage: radarrPage,
                  filters,
                })
              : renderPagination({
                  app: 'radarr',
                  appLabel: 'Radarr',
                  currentPage: radarrPage,
                  totalItems: filteredCandidates.radarr.length,
                  matchingItems: candidates.radarr.length,
                  otherPage: sonarrPage,
                  filters,
                })
          }
        >
          <DataTable
            columns={[
              { key: 'title', label: 'Title' },
              { key: 'mediaKey', label: 'Media key' },
              { key: 'wantedState', label: 'Wanted state' },
              { key: 'decision', label: 'Decision' },
              { key: 'reason', label: 'Reason code' },
              { key: 'retryCount', label: 'Retries', align: 'right' },
              { key: 'nextEligibleAt', label: 'Next eligible' },
              { key: 'actions', label: 'Actions', align: 'right' },
            ]}
            rows={pagedCandidates[app].map((candidate) => ({
              title: candidate.title,
              mediaKey: <code className="reason-code">{candidate.mediaKey}</code>,
              wantedState: candidate.wantedState,
              decision: (
                <StatusBadge
                  status={candidate.decision === 'dispatch' ? 'success' : 'degraded'}
                >
                  {candidate.decision}
                </StatusBadge>
              ),
              reason: <ReasonCodeBadge reasonCode={candidate.reasonCode} />,
              retryCount: candidate.retryCount,
              nextEligibleAt: formatTimestamp(candidate.nextEligibleAt),
              actions: (
                <form action="/api/actions/manual-fetch" method="post" className="table-inline-form">
                  <input type="hidden" name="csrfToken" value={runtime.csrfTokens.manualFetch} />
                  <input type="hidden" name="mediaKey" value={candidate.mediaKey} />
                  <button
                    type="submit"
                    className="table-inline-button candidate-action-button"
                    title="Manually trigger a scoped search for this item now. This overrides normal cooldown and rolling search limits."
                    aria-label={`Manual fetch ${candidate.title}`}
                  >
                    Fetch now
                  </button>
                </form>
              ),
            }))}
            emptyMessage={`No ${app} candidates are currently available.`}
          />
        </SectionCard>
      ))}
    </ConsoleShell>
  );
}
