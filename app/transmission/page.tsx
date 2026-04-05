import { resetTransmissionCacheAction } from '@/src/server/actions';
import { probeDependencyHealth } from '@/src/server/console-data';
import { hydrateMediaDisplayRecords } from '@/src/server/media-display';
import { requireAuthenticatedConsoleContext } from '@/src/server/require-auth';
import {
  ConsoleHeaderActions,
  ConsoleShell,
  DataTable,
  MediaItemLink,
  ReasonCodeBadge,
  SectionCard,
  StatusBadge,
} from '@/src/ui';

import {
  clampPage,
  filterTransmissionTorrents,
  formatDurationFromMs,
  formatDurationSince,
  formatTransmissionState,
  formatTransmissionTimestamp,
  getGuardInsight,
  PAGE_SIZE,
  parsePositivePage,
  parseStringParam,
  parseTransmissionFilters,
  renderTransmissionPagination,
  sortTransmissionTorrents,
} from './helpers';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function TransmissionPage(props: { searchParams: SearchParams }) {
  const runtime = await requireAuthenticatedConsoleContext();
  const dependencyCards = await probeDependencyHealth(runtime);
  const searchParams = await props.searchParams;
  const notice = parseStringParam(searchParams.notice);
  const noticeStatus = parseStringParam(searchParams.status);
  const filters = parseTransmissionFilters(searchParams);
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
  const filteredTorrents = filterTransmissionTorrents({
    torrents: allTorrents,
    filters,
    now,
    stallNoProgressForMs: runtime.config.transmissionGuard.stallNoProgressForMs,
    resolveTitle,
  });
  const sortedTorrents = sortTransmissionTorrents(filteredTorrents, filters.sort);
  const currentPage = clampPage(
    parsePositivePage(searchParams.page),
    sortedTorrents.length
  );
  const start = (currentPage - 1) * PAGE_SIZE;
  const pagedTorrents = sortedTorrents.slice(start, start + PAGE_SIZE);
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

          <form action="/transmission" method="get" className="candidate-filters">
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

              <label className="candidate-filters__field">
                <span>Sort</span>
                <select name="sort" defaultValue={filters.sort}>
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
        actions={renderTransmissionPagination({
          currentPage,
          totalItems: sortedTorrents.length,
          sort: filters.sort,
          query: filters.query,
          guard: filters.guard,
          linked: filters.linked,
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
            { key: 'details', label: 'Details' },
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
