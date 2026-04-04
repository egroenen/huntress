import type { ReactNode } from 'react';

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

const clampPage = (page: number, totalItems: number): number => {
  const totalPages = Math.max(Math.ceil(totalItems / PAGE_SIZE), 1);
  return Math.min(page, totalPages);
};

const buildPageHref = (
  sonarrPage: number,
  radarrPage: number
): string => {
  const params = new URLSearchParams();
  params.set('sonarrPage', String(sonarrPage));
  params.set('radarrPage', String(radarrPage));

  return `/candidates?${params.toString()}`;
};

const renderPagination = (input: {
  app: 'sonarr' | 'radarr';
  appLabel: string;
  currentPage: number;
  totalItems: number;
  otherPage: number;
}): ReactNode => {
  const totalPages = Math.max(Math.ceil(input.totalItems / PAGE_SIZE), 1);

  if (input.totalItems <= PAGE_SIZE) {
    return (
      <span className="console-muted">
        Showing all {input.totalItems} {input.appLabel.toLowerCase()} candidates.
      </span>
    );
  }

  const previousPage = Math.max(input.currentPage - 1, 1);
  const nextPage = Math.min(input.currentPage + 1, totalPages);
  const previousHref =
    input.app === 'sonarr'
      ? buildPageHref(previousPage, input.otherPage)
      : buildPageHref(input.otherPage, previousPage);
  const nextHref =
    input.app === 'sonarr'
      ? buildPageHref(nextPage, input.otherPage)
      : buildPageHref(input.otherPage, nextPage);

  return (
    <div className="table-pagination">
      <span className="console-muted">
        Page {input.currentPage} of {totalPages} · {input.totalItems} total candidates
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

export default async function CandidatesPage(props: { searchParams: SearchParams }) {
  const runtime = await requireAuthenticatedConsoleContext();
  const searchParams = await props.searchParams;
  const candidates = getDashboardCandidateSnapshot(runtime);
  const sonarrPage = clampPage(parsePositivePage(searchParams.sonarrPage), candidates.sonarr.length);
  const radarrPage = clampPage(parsePositivePage(searchParams.radarrPage), candidates.radarr.length);
  const sonarrStart = (sonarrPage - 1) * PAGE_SIZE;
  const radarrStart = (radarrPage - 1) * PAGE_SIZE;
  const pagedCandidates = {
    sonarr: candidates.sonarr.slice(sonarrStart, sonarrStart + PAGE_SIZE),
    radarr: candidates.radarr.slice(radarrStart, radarrStart + PAGE_SIZE),
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
      {(['sonarr', 'radarr'] as const).map((app) => (
        <SectionCard
          key={app}
          title={app === 'sonarr' ? 'Sonarr candidates' : 'Radarr candidates'}
          subtitle={`Separate policy evaluation for ${app}.`}
          actions={
            app === 'sonarr'
              ? renderPagination({
                  app: 'sonarr',
                  appLabel: 'Sonarr',
                  currentPage: sonarrPage,
                  totalItems: candidates.sonarr.length,
                  otherPage: radarrPage,
                })
              : renderPagination({
                  app: 'radarr',
                  appLabel: 'Radarr',
                  currentPage: radarrPage,
                  totalItems: candidates.radarr.length,
                  otherPage: sonarrPage,
                })
          }
        >
          <DataTable
            columns={[
              { key: 'title', label: 'Title' },
              { key: 'wantedState', label: 'Wanted state' },
              { key: 'decision', label: 'Decision' },
              { key: 'reason', label: 'Reason code' },
              { key: 'retryCount', label: 'Retries', align: 'right' },
              { key: 'nextEligibleAt', label: 'Next eligible' },
            ]}
            rows={pagedCandidates[app].map((candidate) => ({
              title: candidate.title,
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
            }))}
            emptyMessage={`No ${app} candidates are currently available.`}
          />
        </SectionCard>
      ))}
    </ConsoleShell>
  );
}
