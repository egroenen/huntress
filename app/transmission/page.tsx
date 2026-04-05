import type { ReactNode } from 'react';

import { requireAuthenticatedConsoleContext } from '@/src/server/require-auth';
import {
  ConsoleShell,
  DataTable,
  MediaItemLink,
  SectionCard,
  StatusBadge,
} from '@/src/ui';

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

type TransmissionGuardFilter =
  | 'all'
  | 'active'
  | 'stalling'
  | 'remove_soon'
  | 'stalled_removable'
  | 'error_removable'
  | 'removed'
  | 'complete';

type TransmissionLinkedFilter = 'all' | 'linked' | 'unlinked';

const formatDurationFromMs = (durationMs: number): string => {
  const totalSeconds = Math.max(Math.round(durationMs / 1000), 0);

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const totalMinutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (totalMinutes < 60) {
    return seconds > 0 ? `${totalMinutes}m ${seconds}s` : `${totalMinutes}m`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours < 24) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;

  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
};

const formatDurationSince = (value: string | null, now: Date): string => {
  if (!value) {
    return 'n/a';
  }

  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return 'n/a';
  }

  return formatDurationFromMs(Math.max(now.getTime() - timestamp, 0));
};

const formatTransmissionState = (status: number): string => {
  switch (status) {
    case 0:
      return 'stopped';
    case 1:
      return 'check wait';
    case 2:
      return 'checking';
    case 3:
      return 'download wait';
    case 4:
      return 'downloading';
    case 5:
      return 'seed wait';
    case 6:
      return 'seeding';
    default:
      return `status ${status}`;
  }
};

const getGuardInsight = (input: {
  removedAt: string | null;
  removalReason: string | null;
  errorCode: number | null;
  percentDone: number;
  noProgressSince: string | null;
  stallNoProgressForMs: number;
  now: Date;
}): {
  label: string;
  tone: 'healthy' | 'degraded' | 'unavailable' | 'success';
  removeAt: string | null;
  countdown: string;
} => {
  if (input.removedAt) {
    return {
      label: 'removed',
      tone: 'unavailable',
      removeAt: input.removedAt,
      countdown: 'done',
    };
  }

  if ((input.errorCode ?? 0) > 0) {
    return {
      label: 'error removable',
      tone: 'unavailable',
      removeAt: input.now.toISOString(),
      countdown: 'eligible now',
    };
  }

  if (input.percentDone >= 1) {
    return {
      label: 'complete',
      tone: 'healthy',
      removeAt: null,
      countdown: 'safe',
    };
  }

  if (!input.noProgressSince) {
    return {
      label: 'active',
      tone: 'healthy',
      removeAt: null,
      countdown: 'tracking',
    };
  }

  const noProgressAt = new Date(input.noProgressSince).getTime();

  if (!Number.isFinite(noProgressAt)) {
    return {
      label: 'active',
      tone: 'healthy',
      removeAt: null,
      countdown: 'tracking',
    };
  }

  const removeAt = new Date(noProgressAt + input.stallNoProgressForMs).toISOString();
  const remainingMs = noProgressAt + input.stallNoProgressForMs - input.now.getTime();

  if (remainingMs <= 0) {
    return {
      label: 'stalled removable',
      tone: 'unavailable',
      removeAt,
      countdown: 'eligible now',
    };
  }

  if (remainingMs <= 60 * 60 * 1000) {
    return {
      label: 'remove soon',
      tone: 'degraded',
      removeAt,
      countdown: formatDurationFromMs(remainingMs),
    };
  }

  return {
    label: 'stalling',
    tone: 'degraded',
    removeAt,
    countdown: formatDurationFromMs(remainingMs),
  };
};

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

const parseGuardFilter = (
  value: string | string[] | undefined
): TransmissionGuardFilter => {
  const normalized = parseStringParam(value);

  switch (normalized) {
    case 'active':
    case 'stalling':
    case 'remove_soon':
    case 'stalled_removable':
    case 'error_removable':
    case 'removed':
    case 'complete':
      return normalized;
    default:
      return 'all';
  }
};

const parseLinkedFilter = (
  value: string | string[] | undefined
): TransmissionLinkedFilter => {
  const normalized = parseStringParam(value);

  switch (normalized) {
    case 'linked':
    case 'unlinked':
      return normalized;
    default:
      return 'all';
  }
};

const clampPage = (page: number, totalItems: number): number => {
  const totalPages = Math.max(Math.ceil(totalItems / PAGE_SIZE), 1);
  return Math.min(page, totalPages);
};

const buildTransmissionParams = (input: {
  sort: TransmissionSort;
  page: number;
  query: string;
  guard: TransmissionGuardFilter;
  linked: TransmissionLinkedFilter;
}): URLSearchParams => {
  const params = new URLSearchParams();

  if (input.sort !== DEFAULT_SORT) {
    params.set('sort', input.sort);
  }

  if (input.query.trim()) {
    params.set('q', input.query.trim());
  }

  if (input.guard !== 'all') {
    params.set('guard', input.guard);
  }

  if (input.linked !== 'all') {
    params.set('linked', input.linked);
  }

  if (input.page > 1) {
    params.set('page', String(input.page));
  }

  return params;
};

const buildTransmissionHref = (input: {
  sort: TransmissionSort;
  page: number;
  query: string;
  guard: TransmissionGuardFilter;
  linked: TransmissionLinkedFilter;
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
  query: string;
  guard: TransmissionGuardFilter;
  linked: TransmissionLinkedFilter;
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
        Page {input.currentPage} of {totalPages} · {input.totalItems} cached torrent
        observations
      </span>
      <div className="table-pagination__links">
        {input.currentPage > 1 ? (
          <a
            href={buildTransmissionHref({
              sort: input.sort,
              page: input.currentPage - 1,
              query: input.query,
              guard: input.guard,
              linked: input.linked,
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
              query: input.query,
              guard: input.guard,
              linked: input.linked,
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
  const query = parseStringParam(searchParams.q).trim();
  const guardFilter = parseGuardFilter(searchParams.guard);
  const linkedFilter = parseLinkedFilter(searchParams.linked);
  const allTorrents = runtime.database.repositories.transmissionTorrentState.listAll();
  const titleCache = new Map<string, string | null>();
  const resolveTitle = (mediaKey: string | null) => {
    if (!mediaKey) {
      return null;
    }

    if (!titleCache.has(mediaKey)) {
      titleCache.set(
        mediaKey,
        runtime.database.repositories.mediaItemState.getByMediaKey(mediaKey)?.title ??
          null
      );
    }

    return titleCache.get(mediaKey) ?? null;
  };
  const now = new Date();
  const filteredTorrents = allTorrents.filter((torrent) => {
    const insight = getGuardInsight({
      removedAt: torrent.removedAt,
      removalReason: torrent.removalReason,
      errorCode: torrent.errorCode,
      percentDone: torrent.percentDone,
      noProgressSince: torrent.noProgressSince,
      stallNoProgressForMs: runtime.config.transmissionGuard.stallNoProgressForMs,
      now,
    });

    if (query) {
      const haystack = [
        torrent.name,
        resolveTitle(torrent.linkedMediaKey) ?? '',
        torrent.linkedMediaKey ?? '',
        torrent.removalReason ?? '',
        insight.label,
        formatTransmissionState(torrent.status),
        torrent.errorString ?? '',
      ]
        .join(' ')
        .toLowerCase();

      if (!haystack.includes(query.toLowerCase())) {
        return false;
      }
    }

    if (guardFilter !== 'all' && insight.label !== guardFilter.replaceAll('_', ' ')) {
      return false;
    }

    if (linkedFilter === 'linked' && !torrent.linkedMediaKey) {
      return false;
    }

    if (linkedFilter === 'unlinked' && torrent.linkedMediaKey) {
      return false;
    }

    return true;
  });
  const sortedTorrents = sortTorrents(filteredTorrents, sort);
  const currentPage = clampPage(
    parsePositivePage(searchParams.page),
    sortedTorrents.length
  );
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
              Transmission cache cleared. The next sync or guard pass will rebuild
              observations from fresh data.
            </p>
          ) : null}

          <form action="/transmission" method="get" className="candidate-filters">
            <div className="candidate-filters__grid">
              <label className="candidate-filters__field candidate-filters__field--wide">
                <span>Search</span>
                <input
                  type="search"
                  name="q"
                  defaultValue={query}
                  placeholder="Torrent, linked media, guard state, or error text"
                />
              </label>

              <label className="candidate-filters__field">
                <span>Linked</span>
                <select name="linked" defaultValue={linkedFilter}>
                  <option value="all">All torrents</option>
                  <option value="linked">Linked only</option>
                  <option value="unlinked">Unlinked only</option>
                </select>
              </label>

              <label className="candidate-filters__field">
                <span>Guard status</span>
                <select name="guard" defaultValue={guardFilter}>
                  <option value="all">All guard states</option>
                  <option value="active">Active</option>
                  <option value="stalling">Stalling</option>
                  <option value="remove_soon">Remove soon</option>
                  <option value="stalled_removable">Stalled removable</option>
                  <option value="error_removable">Error removable</option>
                  <option value="removed">Removed</option>
                  <option value="complete">Complete</option>
                </select>
              </label>

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
                Apply filters
              </button>
            </div>
          </form>

          <div className="candidate-filters__actions">
            <div className="transmission-controls__links">
              <a href="/transmission" className="console-link">
                Clear filters
              </a>
              <span className="console-muted">
                {sortedTorrents.length} matching observation
                {sortedTorrents.length === 1 ? '' : 's'} of {allTorrents.length}
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
        subtitle={`Rows are sorted using the selected view and can be paged when the cache gets large. Stall removal threshold is ${formatDurationFromMs(runtime.config.transmissionGuard.stallNoProgressForMs)}.`}
        actions={renderPagination({
          currentPage,
          totalItems: sortedTorrents.length,
          sort,
          query,
          guard: guardFilter,
          linked: linkedFilter,
        })}
      >
        <DataTable
          columns={[
            { key: 'name', label: 'Torrent' },
            { key: 'state', label: 'State' },
            { key: 'guard', label: 'Guard status' },
            { key: 'progress', label: 'Progress', align: 'right' },
            { key: 'linkedMediaKey', label: 'Linked media' },
            { key: 'noProgressSince', label: 'No progress' },
            { key: 'removeIn', label: 'Remove in' },
            { key: 'lastSeenAt', label: 'Last seen' },
            { key: 'removeAt', label: 'Remove at' },
            { key: 'error', label: 'Error' },
            { key: 'removalReason', label: 'Removal reason' },
          ]}
          rows={pagedTorrents.map((torrent) => {
            const insight = getGuardInsight({
              removedAt: torrent.removedAt,
              removalReason: torrent.removalReason,
              errorCode: torrent.errorCode,
              percentDone: torrent.percentDone,
              noProgressSince: torrent.noProgressSince,
              stallNoProgressForMs: runtime.config.transmissionGuard.stallNoProgressForMs,
              now,
            });

            return {
              name: torrent.name,
              state: (
                <span className="table-app-label">
                  {formatTransmissionState(torrent.status)}
                </span>
              ),
              guard: <StatusBadge status={insight.tone}>{insight.label}</StatusBadge>,
              progress: `${Math.round(torrent.percentDone * 100)}%`,
              linkedMediaKey: torrent.linkedMediaKey ? (
                <div className="linked-media-cell" title={torrent.linkedMediaKey}>
                  <MediaItemLink
                    config={runtime.config}
                    mediaItem={runtime.database.repositories.mediaItemState.getByMediaKey(
                      torrent.linkedMediaKey
                    )}
                    fallbackTitle={resolveTitle(torrent.linkedMediaKey) ?? 'Linked item'}
                    className="external-item-link"
                  />
                  <span className="secondary-value">
                    <code>{torrent.linkedMediaKey}</code>
                  </span>
                </div>
              ) : (
                <span className="console-muted">unlinked</span>
              ),
              noProgressSince: torrent.noProgressSince ? (
                <div className="linked-media-cell">
                  <strong>{formatTimestamp(torrent.noProgressSince)}</strong>
                  <span className="secondary-value">
                    {formatDurationSince(torrent.noProgressSince, now)} ago
                  </span>
                </div>
              ) : (
                <span className="console-muted">active / none</span>
              ),
              removeIn: insight.countdown,
              lastSeenAt: formatTimestamp(torrent.lastSeenAt),
              removeAt: formatTimestamp(insight.removeAt),
              error: torrent.errorCode ? (
                <span>
                  <code className="reason-code">error {torrent.errorCode}</code>
                  {torrent.errorString ? (
                    <>
                      <br />
                      <span className="console-muted">{torrent.errorString}</span>
                    </>
                  ) : null}
                </span>
              ) : (
                <span className="console-muted">none</span>
              ),
              removalReason: torrent.removalReason ? (
                <code className="reason-code">{torrent.removalReason}</code>
              ) : (
                <span className="console-muted">none</span>
              ),
            };
          })}
          emptyMessage="No Transmission torrent observations have been stored yet."
        />
      </SectionCard>
    </ConsoleShell>
  );
}
