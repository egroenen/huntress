import type { ReactNode } from 'react';

import type { CandidateDecision } from '@/src/domain';
import type { CandidatePreviewRecord } from '@/src/db';
import { manualFetchAction } from '@/src/server/actions';
import {
  getCandidateReleasePreviewMap,
  probeDependencyHealth,
  type CandidateReleasePreview,
} from '@/src/server/console-data';
import { hydrateMediaDisplayRecords } from '@/src/server/media-display';
import { requireAuthenticatedConsoleContext } from '@/src/server/require-auth';
import {
  CandidateSectionToggle,
  ConsoleHeaderActions,
  ConsoleShell,
  DataTable,
  ManualFetchButton,
  MediaItemLink,
  ReasonCodeBadge,
  SectionCard,
  StatusBadge,
} from '@/src/ui';
import { formatServiceName } from '@/src/ui/formatters';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;
const DEFAULT_SORT = 'engine';

type CandidateSort =
  | 'engine'
  | 'title_asc'
  | 'title_desc'
  | 'retry_desc'
  | 'retry_asc'
  | 'next_eligible_asc'
  | 'next_eligible_desc';

type CandidateFilterApp = 'all' | 'sonarr' | 'radarr';
type CandidateFilterDecision = 'all' | 'dispatch' | 'skip';
type CandidateFilterWantedState = 'all' | 'missing' | 'cutoff_unmet' | 'ignored';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

interface CandidateFilters {
  query: string;
  app: CandidateFilterApp;
  decision: CandidateFilterDecision;
  wantedState: CandidateFilterWantedState;
  sort: CandidateSort;
}

interface CandidateSectionState {
  sonarrCollapsed: boolean;
  radarrCollapsed: boolean;
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

const parsePositivePage = (value: string | string[] | undefined): number => {
  const normalized = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(normalized ?? '', 10);

  if (Number.isNaN(parsed) || parsed < 1) {
    return 1;
  }

  return parsed;
};

const parseStringParam = (value: string | string[] | undefined): string => {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
};

const parseDecisionFilter = (
  value: string | string[] | undefined
): CandidateFilterDecision => {
  const normalized = parseStringParam(value);

  return normalized === 'dispatch' || normalized === 'skip' ? normalized : 'all';
};

const parseAppFilter = (value: string | string[] | undefined): CandidateFilterApp => {
  const normalized = parseStringParam(value);

  return normalized === 'sonarr' || normalized === 'radarr' ? normalized : 'all';
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

const parseCollapsed = (value: string | string[] | undefined): boolean => {
  const normalized = parseStringParam(value);
  return normalized === '1' || normalized === 'true';
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
  },
  sections: CandidateSectionState
): URLSearchParams => {
  const params = new URLSearchParams();

  if (filters.query) {
    params.set('q', filters.query);
  }

  if (filters.app !== 'all') {
    params.set('app', filters.app);
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

  if (sections.sonarrCollapsed) {
    params.set('sonarrCollapsed', '1');
  }

  if (sections.radarrCollapsed) {
    params.set('radarrCollapsed', '1');
  }

  return params;
};

const buildPageHref = (
  sonarrPage: number,
  radarrPage: number,
  filters: CandidateFilters,
  sections: CandidateSectionState
): string => {
  return `/candidates?${buildCandidateParams(filters, { sonarrPage, radarrPage }, sections).toString()}`;
};

const renderPagination = (input: {
  app: 'sonarr' | 'radarr';
  appLabel: string;
  currentPage: number;
  totalItems: number;
  matchingItems: number;
  otherPage: number;
  filters: CandidateFilters;
  sections: CandidateSectionState;
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
      ? buildPageHref(previousPage, input.otherPage, input.filters, input.sections)
      : buildPageHref(input.otherPage, previousPage, input.filters, input.sections);
  const nextHref =
    input.app === 'sonarr'
      ? buildPageHref(nextPage, input.otherPage, input.filters, input.sections)
      : buildPageHref(input.otherPage, nextPage, input.filters, input.sections);

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

const formatReleaseSelectionMode = (
  preview: CandidateReleasePreview | undefined
): { label: string; status: 'info' | 'success' | 'degraded' } => {
  if (!preview) {
    return { label: 'n/a', status: 'info' };
  }

  if (!preview.available) {
    return { label: 'Unavailable', status: 'degraded' };
  }

  switch (preview.mode) {
    case 'preferred_release':
      return { label: 'Direct release', status: 'success' };
    case 'good_enough_release':
      return { label: 'Good enough', status: 'info' };
    case 'fallback_then_upgrade':
      return { label: 'Fallback + upgrade', status: 'degraded' };
    case 'blind_search':
    default:
      return { label: 'Blind search', status: 'info' };
  }
};

const renderReleasePreview = (preview: CandidateReleasePreview | undefined) => {
  if (!preview) {
    return 'n/a';
  }

  if (!preview.available) {
    return (
      <div className="release-preview" title={preview.reason}>
        <strong>Release preview unavailable</strong>
        <small>{preview.reason}</small>
      </div>
    );
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
};

export default async function CandidatesPage(props: { searchParams: SearchParams }) {
  const runtime = await requireAuthenticatedConsoleContext();
  const dependencyCards = await probeDependencyHealth(runtime);
  const searchParams = await props.searchParams;
  const filters: CandidateFilters = {
    query: parseStringParam(searchParams.q).trim(),
    app: parseAppFilter(searchParams.app),
    decision: parseDecisionFilter(searchParams.decision),
    wantedState: parseWantedStateFilter(searchParams.wantedState),
    sort: parseSort(searchParams.sort),
  };
  const sections: CandidateSectionState = {
    sonarrCollapsed: parseCollapsed(searchParams.sonarrCollapsed),
    radarrCollapsed: parseCollapsed(searchParams.radarrCollapsed),
  };
  const nowIso = new Date().toISOString();
  const totalCandidates = {
    sonarr: runtime.database.repositories.mediaItemState.countByMediaType(
      'sonarr_episode'
    ),
    radarr: runtime.database.repositories.mediaItemState.countByMediaType(
      'radarr_movie'
    ),
  };
  const sonarrBaseQuery = {
    app: 'sonarr' as const,
    nowIso,
    recentReleaseWindowDays: runtime.config.policies.sonarr.recentReleaseWindowDays,
    excludeUnreleased: runtime.config.policies.sonarr.excludeUnreleased,
    excludeUnmonitored: runtime.config.policies.sonarr.excludeUnmonitored,
    appAvailable: runtime.clients.sonarr !== null,
    panicDisableSearch: runtime.config.safety.panicDisableSearch,
    globalSearchBlocked: false,
    appDispatchLimit: runtime.config.policies.sonarr.maxSearchesPerCycle,
    effectiveGlobalDispatchLimit: runtime.config.safety.maxGlobalDispatchPerCycle,
  };
  const sonarrReservedDispatches =
    runtime.database.repositories.candidatePreview.countReservedDispatches(
      sonarrBaseQuery
    );
  const radarrBaseQuery = {
    app: 'radarr' as const,
    nowIso,
    recentReleaseWindowDays: runtime.config.policies.radarr.recentReleaseWindowDays,
    excludeUnreleased: runtime.config.policies.radarr.excludeUnreleased,
    excludeUnmonitored: runtime.config.policies.radarr.excludeUnmonitored,
    appAvailable: runtime.clients.radarr !== null,
    panicDisableSearch: runtime.config.safety.panicDisableSearch,
    globalSearchBlocked: false,
    appDispatchLimit: runtime.config.policies.radarr.maxSearchesPerCycle,
    effectiveGlobalDispatchLimit: Math.max(
      runtime.config.safety.maxGlobalDispatchPerCycle - sonarrReservedDispatches,
      0
    ),
  };
  const queryFilters = {
    query: filters.query || null,
    decision: filters.decision === 'all' ? null : filters.decision,
    wantedState: filters.wantedState === 'all' ? null : filters.wantedState,
  };
  const filteredCounts = {
    sonarr: runtime.database.repositories.candidatePreview.countFiltered({
      ...sonarrBaseQuery,
      ...queryFilters,
    }),
    radarr: runtime.database.repositories.candidatePreview.countFiltered({
      ...radarrBaseQuery,
      ...queryFilters,
    }),
  };
  const sonarrPage = clampPage(
    parsePositivePage(searchParams.sonarrPage),
    filteredCounts.sonarr
  );
  const radarrPage = clampPage(
    parsePositivePage(searchParams.radarrPage),
    filteredCounts.radarr
  );
  const pagedCandidates = {
    sonarr: runtime.database.repositories.candidatePreview.listFilteredPage(
      {
        ...sonarrBaseQuery,
        ...queryFilters,
        sort: filters.sort,
      },
      PAGE_SIZE,
      (sonarrPage - 1) * PAGE_SIZE
    ),
    radarr: runtime.database.repositories.candidatePreview.listFilteredPage(
      {
        ...radarrBaseQuery,
        ...queryFilters,
        sort: filters.sort,
      },
      PAGE_SIZE,
      (radarrPage - 1) * PAGE_SIZE
    ),
  };
  const displayMediaItems = await hydrateMediaDisplayRecords(runtime, [
    ...pagedCandidates.sonarr.map((candidate) => candidate.mediaKey),
    ...pagedCandidates.radarr.map((candidate) => candidate.mediaKey),
  ]);
  const releasePreviewMap = await getCandidateReleasePreviewMap(runtime, [
    ...pagedCandidates.sonarr,
    ...pagedCandidates.radarr,
  ] as CandidateDecision[]);
  const visibleApps: Array<'sonarr' | 'radarr'> =
    filters.app === 'all' ? ['sonarr', 'radarr'] : [filters.app];

  return (
    <ConsoleShell
      title="Candidate preview"
      subtitle="This page shows the decision engine output before any live dispatch occurs."
      activePath="/candidates"
      currentUser={runtime.authenticated.user.username}
      mode={runtime.config.mode}
      schedulerStatus={runtime.scheduler.getStatus()}
      dependencyCards={dependencyCards}
      headerActions={
        <ConsoleHeaderActions
          mode={runtime.config.mode}
          schedulerStatus={runtime.scheduler.getStatus()}
          actionTokens={runtime.csrfTokens}
        />
      }
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
              <span>App</span>
              <select name="app" defaultValue={filters.app}>
                <option value="all">All apps</option>
                <option value="sonarr">Sonarr only</option>
                <option value="radarr">Radarr only</option>
              </select>
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
              Apply filters
            </button>
          </div>
        </form>
      </SectionCard>

      {visibleApps.map((app) => (
        <SectionCard
          key={app}
          title={app === 'sonarr' ? 'Sonarr candidates' : 'Radarr candidates'}
          subtitle={`Separate policy evaluation for ${formatServiceName(app)}. Showing ${pagedCandidates[app].length} of ${filteredCounts[app]} matching candidates.`}
          actions={
            app === 'sonarr'
              ? renderPagination({
                  app: 'sonarr',
                  appLabel: 'Sonarr',
                  currentPage: sonarrPage,
                  totalItems: filteredCounts.sonarr,
                  matchingItems: totalCandidates.sonarr,
                  otherPage: radarrPage,
                  filters,
                  sections,
                })
              : renderPagination({
                  app: 'radarr',
                  appLabel: 'Radarr',
                  currentPage: radarrPage,
                  totalItems: filteredCounts.radarr,
                  matchingItems: totalCandidates.radarr,
                  otherPage: sonarrPage,
                  filters,
                  sections,
                })
          }
        >
          <div className="candidate-section-controls">
            <CandidateSectionToggle
              app={app}
              collapsed={
                app === 'sonarr' ? sections.sonarrCollapsed : sections.radarrCollapsed
              }
            />
          </div>
          {(
            app === 'sonarr' ? sections.sonarrCollapsed : sections.radarrCollapsed
          ) ? null : (
            <div id={`${app}-candidates-table`}>
              <DataTable
                columns={[
                  { key: 'title', label: 'Title' },
                  { key: 'mediaKey', label: 'Media key' },
                  { key: 'wantedState', label: 'Wanted state' },
                  { key: 'decision', label: 'Decision' },
                  { key: 'dispatchPath', label: 'Dispatch path' },
                  { key: 'releasePreview', label: 'Release preview' },
                  { key: 'reason', label: 'Reason code' },
                  { key: 'retryCount', label: 'Retries', align: 'right' },
                  { key: 'nextEligibleAt', label: 'Next eligible' },
                  { key: 'actions', label: 'Actions', align: 'right' },
                ]}
                rows={pagedCandidates[app].map((candidate: CandidatePreviewRecord) => {
                  const releasePreview = releasePreviewMap.get(candidate.mediaKey);
                  const dispatchPath = formatReleaseSelectionMode(releasePreview);

                  return {
                    title: (
                      <MediaItemLink
                        config={runtime.config}
                        mediaItem={displayMediaItems.get(candidate.mediaKey) ?? null}
                        fallbackTitle={candidate.title}
                        className="external-item-link"
                      />
                    ),
                    mediaKey: <code className="reason-code">{candidate.mediaKey}</code>,
                    wantedState: candidate.wantedState,
                    decision: (
                      <StatusBadge
                        status={candidate.decision === 'dispatch' ? 'success' : 'degraded'}
                      >
                        {candidate.decision}
                      </StatusBadge>
                    ),
                    dispatchPath: (
                      <StatusBadge
                        status={dispatchPath.status}
                        {...(releasePreview?.reason
                          ? { title: releasePreview.reason }
                          : {})}
                      >
                        {dispatchPath.label}
                      </StatusBadge>
                    ),
                    releasePreview: renderReleasePreview(releasePreview),
                    reason: <ReasonCodeBadge reasonCode={candidate.reasonCode as never} />,
                    retryCount: candidate.retryCount,
                    nextEligibleAt: formatTimestamp(candidate.nextEligibleAt),
                    actions: (
                      <ManualFetchButton
                        action={manualFetchAction}
                        mediaKey={candidate.mediaKey}
                        csrfToken={runtime.csrfTokens.manualFetch}
                        label="Fetch now"
                        title={candidate.title}
                        liveEnabled={runtime.config.mode === 'live'}
                      />
                    ),
                  };
                })}
                emptyMessage={`No ${formatServiceName(app)} candidates are currently available.`}
              />
            </div>
          )}
        </SectionCard>
      ))}
    </ConsoleShell>
  );
}
