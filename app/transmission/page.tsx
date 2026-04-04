import type { ReactNode } from 'react';

import { requireAuthenticatedConsoleContext } from '@/src/server/require-auth';
import { ConsoleShell, DataTable, SectionCard } from '@/src/ui';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;
const DEFAULT_SORT = 'recent_desc';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type TransmissionSort =
  | 'recent_desc'
  | 'recent_asc'
  | 'name_asc'
  | 'name_desc'
  | 'progress_desc'
  | 'progress_asc'
  | 'linked_media_asc'
  | 'linked_media_desc';

const formatTimestamp = (value: string | null): string => {
  if (!value) {
    return 'n/a';
  }

  return new Intl.DateTimeFormat('en-NZ', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
};

const parseStringParam = (value: string | string[] | undefined): string => {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
};

const parsePositivePage = (value: string | string[] | undefined): number => {
  const normalized = parseStringParam(value);
  const parsed = Number.parseInt(normalized, 10);

  if (Number.isNaN(parsed) || parsed < 1) {
    return 1;
  }

  return parsed;
};

const parseSort = (value: string | string[] | undefined): TransmissionSort => {
  const normalized = parseStringParam(value);

  switch (normalized) {
    case 'recent_asc':
    case 'name_asc':
    case 'name_desc':
    case 'progress_desc':
    case 'progress_asc':
    case 'linked_media_asc':
    case 'linked_media_desc':
      return normalized;
    default:
      return DEFAULT_SORT;
  }
};

const clampPage = (page: number, totalItems: number): number => {
  const totalPages = Math.max(Math.ceil(totalItems / PAGE_SIZE), 1);
  return Math.min(page, totalPages);
};

const buildTransmissionParams = (input: {
  sort: TransmissionSort;
  page: number;
}): URLSearchParams => {
  const params = new URLSearchParams();

  if (input.sort !== DEFAULT_SORT) {
    params.set('sort', input.sort);
  }

  if (input.page > 1) {
    params.set('page', String(input.page));
  }

  return params;
};

const buildTransmissionHref = (input: {
  sort: TransmissionSort;
  page: number;
}): string => {
  const params = buildTransmissionParams(input);
  const suffix = params.toString();

  return suffix ? `/transmission?${suffix}` : '/transmission';
};

const getComparableTimestamp = (value: string | null): number => {
  if (!value) {
    return 0;
  }

  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.getTime() : 0;
};

const getRecentTimestamp = (input: {
  removedAt: string | null;
  lastSeenAt: string;
}): number => {
  return Math.max(
    getComparableTimestamp(input.removedAt),
    getComparableTimestamp(input.lastSeenAt)
  );
};

const compareTorrents = (
  left: {
    name: string;
    percentDone: number;
    linkedMediaKey: string | null;
    removedAt: string | null;
    lastSeenAt: string;
  },
  right: {
    name: string;
    percentDone: number;
    linkedMediaKey: string | null;
    removedAt: string | null;
    lastSeenAt: string;
  },
  sort: TransmissionSort
): number => {
  switch (sort) {
    case 'recent_asc':
      return getRecentTimestamp(left) - getRecentTimestamp(right);
    case 'recent_desc':
      return getRecentTimestamp(right) - getRecentTimestamp(left);
    case 'name_asc':
      return left.name.localeCompare(right.name);
    case 'name_desc':
      return right.name.localeCompare(left.name);
    case 'progress_asc':
      return left.percentDone - right.percentDone;
    case 'progress_desc':
      return right.percentDone - left.percentDone;
    case 'linked_media_asc':
      return (left.linkedMediaKey ?? 'zzz').localeCompare(right.linkedMediaKey ?? 'zzz');
    case 'linked_media_desc':
      return (right.linkedMediaKey ?? '').localeCompare(left.linkedMediaKey ?? '');
  }
};

const sortTorrents = <
  TTorrent extends {
    name: string;
    percentDone: number;
    linkedMediaKey: string | null;
    removedAt: string | null;
    lastSeenAt: string;
  },
>(
  torrents: TTorrent[],
  sort: TransmissionSort
): TTorrent[] => {
  return torrents
    .map((torrent, index) => ({ torrent, index }))
    .sort((left, right) => {
      const previousComparison = compareTorrents(left.torrent, right.torrent, sort);

      if (previousComparison !== 0) {
        return previousComparison;
      }

      return left.index - right.index;
    })
    .map((entry) => entry.torrent);
};

const renderPagination = (input: {
  currentPage: number;
  totalItems: number;
  sort: TransmissionSort;
}): ReactNode => {
  const totalPages = Math.max(Math.ceil(input.totalItems / PAGE_SIZE), 1);

  if (input.totalItems <= PAGE_SIZE) {
    return (
      <span className="console-muted">
        Showing all {input.totalItems} cached torrent observations.
      </span>
    );
  }

  return (
    <div className="table-pagination">
      <span className="console-muted">
        Page {input.currentPage} of {totalPages} · {input.totalItems} cached torrent observations
      </span>
      <div className="table-pagination__links">
        {input.currentPage > 1 ? (
          <a
            href={buildTransmissionHref({
              sort: input.sort,
              page: input.currentPage - 1,
            })}
            className="console-link"
          >
            Previous
          </a>
        ) : (
          <span className="console-muted">Previous</span>
        )}
        {input.currentPage < totalPages ? (
          <a
            href={buildTransmissionHref({
              sort: input.sort,
              page: input.currentPage + 1,
            })}
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

export default async function TransmissionPage(props: { searchParams: SearchParams }) {
  const runtime = await requireAuthenticatedConsoleContext();
  const searchParams = await props.searchParams;
  const state = parseStringParam(searchParams.state);
  const sort = parseSort(searchParams.sort);
  const recentTorrents = runtime.database.repositories.transmissionTorrentState.listRecent(500);
  const sortedTorrents = sortTorrents(recentTorrents, sort);
  const currentPage = clampPage(parsePositivePage(searchParams.page), sortedTorrents.length);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pagedTorrents = sortedTorrents.slice(start, start + PAGE_SIZE);

  return (
    <ConsoleShell
      title="Transmission guard"
      subtitle="Observe cached torrent state, sort the current view, and reset stale observations when you need a fresh rebuild."
      activePath="/transmission"
      currentUser={runtime.authenticated.user.username}
      mode={runtime.config.mode}
      schedulerStatus={runtime.scheduler.getStatus()}
      actionTokens={runtime.csrfTokens}
    >
      <SectionCard
        title="Transmission controls"
        subtitle="Sort the cached observation view and clear the cache when old linkage data needs to be rebuilt from fresh Arr queue state."
        actions={
          <form action="/api/actions/reset-transmission-cache" method="post">
            <input
              type="hidden"
              name="csrfToken"
              value={runtime.csrfTokens.resetTransmissionCache}
            />
            <button
              type="submit"
              className="transmission-reset-button"
              title="Delete cached Transmission observation rows so linked media can be rebuilt from fresh queue and torrent data."
              aria-label="Clear cached Transmission observations"
            >
              Clear cache
            </button>
          </form>
        }
      >
        <div className="candidate-filters transmission-controls">
          {state === 'cache-reset' ? (
            <p className="settings-notice is-success">
              Transmission cache cleared. The next sync or guard pass will rebuild observations
              from fresh data.
            </p>
          ) : null}

          <form action="/transmission" method="get" className="candidate-filters">
            <div className="candidate-filters__grid">
              <label className="candidate-filters__field">
                <span>Sort</span>
                <select name="sort" defaultValue={sort}>
                  <option value="recent_desc">Most recent first</option>
                  <option value="recent_asc">Oldest first</option>
                  <option value="name_asc">Torrent name A-Z</option>
                  <option value="name_desc">Torrent name Z-A</option>
                  <option value="progress_desc">Progress high-low</option>
                  <option value="progress_asc">Progress low-high</option>
                  <option value="linked_media_asc">Linked media A-Z</option>
                  <option value="linked_media_desc">Linked media Z-A</option>
                </select>
              </label>
            </div>

            <div className="transmission-controls__actions">
              <button type="submit" className="console-button">
                Apply sort
              </button>
            </div>
          </form>

          <div className="candidate-filters__actions">
            <div className="transmission-controls__links">
              <a href="/transmission" className="console-link">
                Reset view
              </a>
              <span className="console-muted">
                {sortedTorrents.length} cached observation
                {sortedTorrents.length === 1 ? '' : 's'}
              </span>
            </div>
            <span className="console-muted">
              Use Clear cache above if old linkage data needs a full rebuild.
            </span>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Recent torrent observations"
        subtitle="Rows are sorted using the selected view and can be paged when the cache gets large."
        actions={renderPagination({ currentPage, totalItems: sortedTorrents.length, sort })}
      >
        <DataTable
          columns={[
            { key: 'name', label: 'Torrent' },
            { key: 'progress', label: 'Progress', align: 'right' },
            { key: 'linkedMediaKey', label: 'Linked media' },
            { key: 'lastSeenAt', label: 'Last seen' },
            { key: 'removedAt', label: 'Removed at' },
            { key: 'removalReason', label: 'Removal reason' },
          ]}
          rows={pagedTorrents.map((torrent) => ({
            name: torrent.name,
            progress: `${Math.round(torrent.percentDone * 100)}%`,
            linkedMediaKey: torrent.linkedMediaKey ?? 'unlinked',
            lastSeenAt: formatTimestamp(torrent.lastSeenAt),
            removedAt: formatTimestamp(torrent.removedAt),
            removalReason: torrent.removalReason ? (
              <code className="reason-code">{torrent.removalReason}</code>
            ) : (
              <span className="console-muted">none</span>
            ),
          }))}
          emptyMessage="No Transmission torrent observations have been stored yet."
        />
      </SectionCard>
    </ConsoleShell>
  );
}
