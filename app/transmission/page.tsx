import { resetTransmissionCacheAction } from '@/src/server/actions';
import { hydrateMediaDisplayRecords } from '@/src/server/media-display';
import {
  readPersistedQueryState,
  withPersistedQueryState,
} from '@/src/server/persistent-query';
import { requireAuthenticatedConsoleContext } from '@/src/server/require-auth';
import {
  ConsoleHeaderActions,
  ConsoleShell,
  MediaItemLink,
  QueryFilterForm,
  QueryFilterLink,
  ReasonCodeBadge,
  SectionCard,
  SortableDataTable,
  StatusBadge,
} from '@/src/ui';

import {
  buildTransmissionHref,
  clampPageToSize,
  DEFAULT_SORT,
  formatDurationFromMs,
  formatDurationSince,
  formatTransmissionState,
  formatTransmissionTimestamp,
  getGuardInsight,
  parsePageSize,
  parsePositivePage,
  parseStringParam,
  parseTransmissionFilters,
  renderTransmissionPagination,
} from './helpers';

export const dynamic = 'force-dynamic';
const TRANSMISSION_FILTER_COOKIE = 'huntress_transmission_filters';
const TRANSMISSION_PERSISTED_QUERY_KEYS = [
  'pageSize',
  'q',
  'guard',
  'linked',
  'sort',
] as const;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function TransmissionPage(props: { searchParams: SearchParams }) {
  const runtime = await requireAuthenticatedConsoleContext();
  const searchParams = withPersistedQueryState(
    await props.searchParams,
    await readPersistedQueryState(
      TRANSMISSION_FILTER_COOKIE,
      TRANSMISSION_PERSISTED_QUERY_KEYS
    )
  );
  const notice = parseStringParam(searchParams.notice);
  const noticeStatus = parseStringParam(searchParams.status);
  const filters = parseTransmissionFilters(searchParams);
  const pageSize = parsePageSize(searchParams.pageSize);
  const nowIso = new Date().toISOString();
  const now = new Date(nowIso);
  const totalTorrents = runtime.database.repositories.transmissionTorrentState.count();
  const totalFilteredTorrents =
    runtime.database.repositories.transmissionTorrentState.countFiltered({
      nowIso,
      stallNoProgressForMs: runtime.config.transmissionGuard.stallNoProgressForMs,
      sort: filters.sort,
      query: filters.query,
      guard: filters.guard,
      linked: filters.linked,
    });
  const currentPage = clampPageToSize(
    parsePositivePage(searchParams.page),
    totalFilteredTorrents,
    pageSize
  );
  const pagedTorrents =
    runtime.database.repositories.transmissionTorrentState.listFilteredPage(
      {
        nowIso,
        stallNoProgressForMs: runtime.config.transmissionGuard.stallNoProgressForMs,
        sort: filters.sort,
        query: filters.query,
        guard: filters.guard,
        linked: filters.linked,
      },
      pageSize,
      (currentPage - 1) * pageSize
    );
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
  const displayMediaItems = await hydrateMediaDisplayRecords(
    runtime,
    pagedTorrents
      .map((torrent) => torrent.linkedMediaKey)
      .filter((mediaKey): mediaKey is string => mediaKey !== null)
  );

  return (
    <ConsoleShell
      title="Transmission guard"
      subtitle="Observe cached torrent state, sort the current view, and reset stale observations when you need a fresh rebuild."
      activePath="/transmission"
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
        title="Transmission controls"
        subtitle="Sort the cached observation view and clear the cache when old linkage data needs to be rebuilt from fresh Arr queue state."
        actions={
          <form action={resetTransmissionCacheAction}>
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
            action="/transmission"
            className="candidate-filters"
            persistenceCookieName={TRANSMISSION_FILTER_COOKIE}
            persistedQueryKeys={TRANSMISSION_PERSISTED_QUERY_KEYS}
          >
            <input type="hidden" name="pageSize" value={String(pageSize)} />
            <div className="candidate-filters__grid">
              <label className="candidate-filters__field candidate-filters__field--wide">
                <span>Search</span>
                <input
                  type="search"
                  name="q"
                  defaultValue={filters.query}
                  placeholder="Torrent, linked media, guard state, or error text"
                />
              </label>

              <label className="candidate-filters__field">
                <span>Linked</span>
                <select name="linked" defaultValue={filters.linked}>
                  <option value="all">All torrents</option>
                  <option value="linked">Linked only</option>
                  <option value="unlinked">Unlinked only</option>
                </select>
              </label>

              <label className="candidate-filters__field">
                <span>Guard status</span>
                <select name="guard" defaultValue={filters.guard}>
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

              <input type="hidden" name="sort" value={filters.sort} />
            </div>

            <div className="transmission-controls__actions">
              <button type="submit" className="console-button">
                Apply filters
              </button>
            </div>
          </QueryFilterForm>

          <div className="candidate-filters__actions">
            <div className="transmission-controls__links">
              <QueryFilterLink
                href={buildTransmissionHref({
                  sort: DEFAULT_SORT,
                  page: 1,
                  pageSize,
                  query: '',
                  guard: 'all',
                  linked: 'all',
                })}
                className="console-link"
                persistenceCookieName={TRANSMISSION_FILTER_COOKIE}
                persistedQueryKeys={TRANSMISSION_PERSISTED_QUERY_KEYS}
              >
                Clear filters
              </QueryFilterLink>
              <span className="console-muted">
                {totalFilteredTorrents} matching observation
                {totalFilteredTorrents === 1 ? '' : 's'} of {totalTorrents}
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
        subtitle={`Click column headers to sort. Stall removal threshold is ${formatDurationFromMs(runtime.config.transmissionGuard.stallNoProgressForMs)}.`}
        actions={renderTransmissionPagination({
          currentPage,
          totalItems: totalFilteredTorrents,
          pageSize,
          sort: filters.sort,
          query: filters.query,
          guard: filters.guard,
          linked: filters.linked,
        })}
      >
        <SortableDataTable
          basePath="/transmission"
          sortParam="sort"
          defaultSort={DEFAULT_SORT}
          persistenceCookieName={TRANSMISSION_FILTER_COOKIE}
          persistedQueryKeys={TRANSMISSION_PERSISTED_QUERY_KEYS}
          columns={[
            { key: 'name', label: 'Torrent', sortAsc: 'name_asc', sortDesc: 'name_desc' },
            { key: 'state', label: 'State' },
            { key: 'guard', label: 'Guard status' },
            { key: 'progress', label: 'Progress', align: 'right', sortAsc: 'progress_asc', sortDesc: 'progress_desc' },
            { key: 'linkedMediaKey', label: 'Linked media', sortAsc: 'linked_media_asc', sortDesc: 'linked_media_desc' },
            { key: 'noProgressSince', label: 'No progress' },
            { key: 'removeIn', label: 'Remove in' },
            { key: 'details', label: 'Recent', sortAsc: 'recent_asc', sortDesc: 'recent_desc' },
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
            const dangerousRemoval =
              torrent.removalReason === 'TX_DANGEROUS_DOWNLOAD_REMOVE';

            return {
              __rowClassName: dangerousRemoval ? 'transmission-row--dangerous' : undefined,
              name: (
                <span className="torrent-name-cell" title={torrent.name}>
                  {torrent.name}
                </span>
              ),
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
                    mediaItem={displayMediaItems.get(torrent.linkedMediaKey) ?? null}
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
                  <strong>{formatTransmissionTimestamp(torrent.noProgressSince)}</strong>
                  <span className="secondary-value">
                    {formatDurationSince(torrent.noProgressSince, now)} ago
                  </span>
                </div>
              ) : (
                <span className="console-muted">active / none</span>
              ),
              removeIn: insight.countdown,
              details: (
                <div className="transmission-details-cell">
                  {dangerousRemoval ? (
                    <span className="transmission-security-flag">⚠ Security risk</span>
                  ) : null}
                  <span>
                    <strong>Last seen:</strong>{' '}
                    {formatTransmissionTimestamp(torrent.lastSeenAt)}
                  </span>
                  <span>
                    <strong>Remove at:</strong>{' '}
                    {formatTransmissionTimestamp(insight.removeAt)}
                  </span>
                  <span>
                    <strong>Removal reason:</strong>{' '}
                    {torrent.removalReason ? (
                      <ReasonCodeBadge reasonCode={torrent.removalReason} />
                    ) : (
                      <span className="console-muted">none</span>
                    )}
                  </span>
                  <span>
                    <strong>Error:</strong>{' '}
                    {torrent.errorCode ? (
                      <>
                        <code className="reason-code">error {torrent.errorCode}</code>
                        {torrent.errorString ? ` ${torrent.errorString}` : ''}
                      </>
                    ) : (
                      <span className="console-muted">none</span>
                    )}
                  </span>
                </div>
              ),
            };
          })}
          emptyMessage="No Transmission torrent observations have been stored yet."
        />
      </SectionCard>

    </ConsoleShell>
  );
}
