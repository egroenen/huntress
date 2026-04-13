import type { ReactNode } from 'react';

import type {
  TransmissionTorrentGuardFilter,
  TransmissionTorrentLinkedFilter,
  TransmissionTorrentSort,
  TransmissionTorrentStateRecord,
} from '@/src/db';
import { TablePagination } from '@/src/ui';

export const DEFAULT_PAGE_SIZE = 50;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export const DEFAULT_SORT = 'recent_desc';
const TRANSMISSION_FILTER_COOKIE = 'huntress_transmission_filters';
const TRANSMISSION_PERSISTED_QUERY_KEYS = [
  'pageSize',
  'q',
  'guard',
  'linked',
  'sort',
] as const;

export interface TransmissionFilters {
  sort: TransmissionTorrentSort;
  query: string;
  guard: TransmissionTorrentGuardFilter;
  linked: TransmissionTorrentLinkedFilter;
}

export interface GuardInsight {
  label: string;
  tone: 'healthy' | 'degraded' | 'unavailable' | 'success';
  removeAt: string | null;
  countdown: string;
}

export const formatDurationFromMs = (durationMs: number): string => {
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

export const formatDurationSince = (value: string | null, now: Date): string => {
  if (!value) {
    return 'n/a';
  }

  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return 'n/a';
  }

  return formatDurationFromMs(Math.max(now.getTime() - timestamp, 0));
};

export const formatTransmissionState = (status: number): string => {
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

export const getGuardInsight = (input: {
  removedAt: string | null;
  removalReason: string | null;
  errorCode: number | null;
  percentDone: number;
  noProgressSince: string | null;
  stallNoProgressForMs: number;
  now: Date;
}): GuardInsight => {
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

export const formatTransmissionTimestamp = (value: string | null): string => {
  if (!value) {
    return 'n/a';
  }

  return new Intl.DateTimeFormat('en-NZ', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
};

export const parseStringParam = (value: string | string[] | undefined): string => {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
};

export const parsePositivePage = (value: string | string[] | undefined): number => {
  const normalized = parseStringParam(value);
  const parsed = Number.parseInt(normalized, 10);

  if (Number.isNaN(parsed) || parsed < 1) {
    return 1;
  }

  return parsed;
};

const parseSort = (
  value: string | string[] | undefined
): TransmissionTorrentSort => {
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
): TransmissionTorrentGuardFilter => {
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
): TransmissionTorrentLinkedFilter => {
  const normalized = parseStringParam(value);

  switch (normalized) {
    case 'linked':
    case 'unlinked':
      return normalized;
    default:
      return 'all';
  }
};

export const parseTransmissionFilters = (
  searchParams: Record<string, string | string[] | undefined>
): TransmissionFilters => {
  return {
    sort: parseSort(searchParams.sort),
    query: parseStringParam(searchParams.q).trim(),
    guard: parseGuardFilter(searchParams.guard),
    linked: parseLinkedFilter(searchParams.linked),
  };
};

export const clampPage = (page: number, totalItems: number): number => {
  const totalPages = Math.max(Math.ceil(totalItems / DEFAULT_PAGE_SIZE), 1);
  return Math.min(page, totalPages);
};

export const parsePageSize = (value: string | string[] | undefined): number => {
  const parsed = Number.parseInt(parseStringParam(value), 10);

  return PAGE_SIZE_OPTIONS.includes(parsed as (typeof PAGE_SIZE_OPTIONS)[number])
    ? parsed
    : DEFAULT_PAGE_SIZE;
};

export const clampPageToSize = (
  page: number,
  totalItems: number,
  pageSize: number
): number => {
  const totalPages = Math.max(Math.ceil(totalItems / pageSize), 1);
  return Math.min(page, totalPages);
};

const buildTransmissionParams = (input: {
  sort: TransmissionTorrentSort;
  page: number;
  pageSize: number;
  query: string;
  guard: TransmissionTorrentGuardFilter;
  linked: TransmissionTorrentLinkedFilter;
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

  if (input.pageSize !== DEFAULT_PAGE_SIZE) {
    params.set('pageSize', String(input.pageSize));
  }

  if (input.page > 1) {
    params.set('page', String(input.page));
  }

  return params;
};

export const buildTransmissionHref = (input: {
  sort: TransmissionTorrentSort;
  page: number;
  pageSize: number;
  query: string;
  guard: TransmissionTorrentGuardFilter;
  linked: TransmissionTorrentLinkedFilter;
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
  left: Pick<
    TransmissionTorrentStateRecord,
    'name' | 'percentDone' | 'linkedMediaKey' | 'removedAt' | 'lastSeenAt'
  >,
  right: Pick<
    TransmissionTorrentStateRecord,
    'name' | 'percentDone' | 'linkedMediaKey' | 'removedAt' | 'lastSeenAt'
  >,
  sort: TransmissionTorrentSort
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

export const sortTransmissionTorrents = (
  torrents: TransmissionTorrentStateRecord[],
  sort: TransmissionTorrentSort
): TransmissionTorrentStateRecord[] => {
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

export const filterTransmissionTorrents = (input: {
  torrents: TransmissionTorrentStateRecord[];
  filters: TransmissionFilters;
  now: Date;
  stallNoProgressForMs: number;
  resolveTitle: (mediaKey: string | null) => string | null;
}): TransmissionTorrentStateRecord[] => {
  return input.torrents.filter((torrent) => {
    const insight = getGuardInsight({
      removedAt: torrent.removedAt,
      removalReason: torrent.removalReason,
      errorCode: torrent.errorCode,
      percentDone: torrent.percentDone,
      noProgressSince: torrent.noProgressSince,
      stallNoProgressForMs: input.stallNoProgressForMs,
      now: input.now,
    });

    if (input.filters.query) {
      const haystack = [
        torrent.name,
        input.resolveTitle(torrent.linkedMediaKey) ?? '',
        torrent.linkedMediaKey ?? '',
        torrent.removalReason ?? '',
        insight.label,
        formatTransmissionState(torrent.status),
        torrent.errorString ?? '',
      ]
        .join(' ')
        .toLowerCase();

      if (!haystack.includes(input.filters.query.toLowerCase())) {
        return false;
      }
    }

    if (
      input.filters.guard !== 'all' &&
      insight.label !== input.filters.guard.replaceAll('_', ' ')
    ) {
      return false;
    }

    if (input.filters.linked === 'linked' && !torrent.linkedMediaKey) {
      return false;
    }

    if (input.filters.linked === 'unlinked' && torrent.linkedMediaKey) {
      return false;
    }

    return true;
  });
};

export const renderTransmissionPagination = (input: {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  sort: TransmissionTorrentSort;
  query: string;
  guard: TransmissionTorrentGuardFilter;
  linked: TransmissionTorrentLinkedFilter;
}): ReactNode => {
  const totalPages = Math.max(Math.ceil(input.totalItems / input.pageSize), 1);

  return (
    <TablePagination
      action="/transmission"
      currentPage={input.currentPage}
      totalPages={totalPages}
      summary={
        input.totalItems <= input.pageSize
          ? `Showing all ${input.totalItems} cached torrent observations.`
          : `${input.totalItems} cached torrent observations`
      }
      pageSize={input.pageSize}
      pageSizeOptions={PAGE_SIZE_OPTIONS}
      hiddenInputs={[
        ...(input.sort !== DEFAULT_SORT ? [{ name: 'sort', value: input.sort }] : []),
        ...(input.query ? [{ name: 'q', value: input.query }] : []),
        ...(input.guard !== 'all' ? [{ name: 'guard', value: input.guard }] : []),
        ...(input.linked !== 'all' ? [{ name: 'linked', value: input.linked }] : []),
      ]}
      firstHref={
        input.currentPage > 1
          ? buildTransmissionHref({
              sort: input.sort,
              page: 1,
              pageSize: input.pageSize,
              query: input.query,
              guard: input.guard,
              linked: input.linked,
            })
          : null
      }
      previousHref={
        input.currentPage > 1
          ? buildTransmissionHref({
              sort: input.sort,
              page: input.currentPage - 1,
              pageSize: input.pageSize,
              query: input.query,
              guard: input.guard,
              linked: input.linked,
            })
          : null
      }
      nextHref={
        input.currentPage < totalPages
          ? buildTransmissionHref({
              sort: input.sort,
              page: input.currentPage + 1,
              pageSize: input.pageSize,
              query: input.query,
              guard: input.guard,
              linked: input.linked,
            })
          : null
      }
      lastHref={
        input.currentPage < totalPages
          ? buildTransmissionHref({
              sort: input.sort,
              page: totalPages,
              pageSize: input.pageSize,
              query: input.query,
              guard: input.guard,
              linked: input.linked,
            })
          : null
      }
      persistenceCookieName={TRANSMISSION_FILTER_COOKIE}
      persistedQueryKeys={TRANSMISSION_PERSISTED_QUERY_KEYS}
    />
  );
};
