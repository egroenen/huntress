import type { ReactNode } from 'react';

import { createCsrfToken } from '@/src/auth';
import {
  clearAllMatchingSuppressionsAction,
  clearSelectedSuppressionsAction,
  clearSuppressionAction,
} from '@/src/server/actions';
import { hydrateMediaDisplayRecords } from '@/src/server/media-display';
import {
  ConfirmButton,
  ConsoleHeaderActions,
  ConsoleShell,
  DataTable,
  MediaItemLink,
  QueryFilterForm,
  QueryFilterLink,
  SectionCard,
  SuppressionSelectAll,
  TablePagination,
} from '@/src/ui';
import { formatServiceName } from '@/src/ui/formatters';
import {
  readPersistedQueryState,
  withPersistedQueryState,
} from '@/src/server/persistent-query';
import { requireAuthenticatedConsoleContext } from '@/src/server/require-auth';

export const dynamic = 'force-dynamic';

const DEFAULT_PAGE_SIZE = 50;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const SUPPRESSIONS_FILTER_COOKIE = 'huntress_suppressions_filters';
const SUPPRESSIONS_PERSISTED_QUERY_KEYS = ['q', 'pageSize'] as const;

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

const parseStringParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? '') : (value ?? '');

const parsePositivePage = (value: string | string[] | undefined): number => {
  const parsed = Number.parseInt(parseStringParam(value), 10);

  if (Number.isNaN(parsed) || parsed < 1) {
    return 1;
  }

  return parsed;
};

const parsePageSize = (value: string | string[] | undefined): number => {
  const parsed = Number.parseInt(parseStringParam(value), 10);

  return PAGE_SIZE_OPTIONS.includes(parsed as (typeof PAGE_SIZE_OPTIONS)[number])
    ? parsed
    : DEFAULT_PAGE_SIZE;
};

const clampPage = (page: number, totalItems: number, pageSize: number): number => {
  const totalPages = Math.max(Math.ceil(totalItems / pageSize), 1);
  return Math.min(page, totalPages);
};

const buildSuppressionsHref = (input: {
  page: number;
  pageSize: number;
  query: string;
}): string => {
  const params = new URLSearchParams();

  if (input.query.trim()) {
    params.set('q', input.query.trim());
  }

  if (input.pageSize !== DEFAULT_PAGE_SIZE) {
    params.set('pageSize', String(input.pageSize));
  }

  if (input.page > 1) {
    params.set('page', String(input.page));
  }

  const suffix = params.toString();

  return suffix ? `/suppressions?${suffix}` : '/suppressions';
};

const renderPagination = (
  currentPage: number,
  totalItems: number,
  pageSize: number,
  query: string
): ReactNode => {
  const totalPages = Math.max(Math.ceil(totalItems / pageSize), 1);
  return (
    <TablePagination
      action="/suppressions"
      currentPage={currentPage}
      totalPages={totalPages}
      summary={
        totalItems <= pageSize
          ? `Showing all ${totalItems} active suppressions.`
          : `${totalItems} active suppressions`
      }
      pageSize={pageSize}
      pageSizeOptions={PAGE_SIZE_OPTIONS}
      hiddenInputs={query ? [{ name: 'q', value: query }] : []}
      firstHref={
        currentPage > 1 ? buildSuppressionsHref({ page: 1, pageSize, query }) : null
      }
      previousHref={
        currentPage > 1
          ? buildSuppressionsHref({ page: currentPage - 1, pageSize, query })
          : null
      }
      nextHref={
        currentPage < totalPages
          ? buildSuppressionsHref({ page: currentPage + 1, pageSize, query })
          : null
      }
      lastHref={
        currentPage < totalPages
          ? buildSuppressionsHref({ page: totalPages, pageSize, query })
          : null
      }
      persistenceCookieName={SUPPRESSIONS_FILTER_COOKIE}
      persistedQueryKeys={SUPPRESSIONS_PERSISTED_QUERY_KEYS}
    />
  );
};

const formatFingerprintType = (value: string): string => {
  switch (value) {
    case 'release_title':
      return 'Release title';
    case 'torrent_hash':
      return 'Torrent hash';
    case 'download_url':
      return 'Download URL';
    default:
      return formatServiceName(value.replaceAll('_', ' '));
  }
};

const formatFingerprintValue = (type: string, value: string): string => {
  const trimmedValue = value.trim();

  if (type === 'release_title') {
    return trimmedValue
      .replace(/\s+/g, ' ')
      .replace(/(^\w)|(\s\w)/g, (match) => match.toUpperCase());
  }

  return trimmedValue;
};

const truncateValue = (value: string, maxLength = 88): string => {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
};

export default async function SuppressionsPage(props: { searchParams: SearchParams }) {
  const runtime = await requireAuthenticatedConsoleContext();
  const searchParams = withPersistedQueryState(
    await props.searchParams,
    await readPersistedQueryState(
      SUPPRESSIONS_FILTER_COOKIE,
      SUPPRESSIONS_PERSISTED_QUERY_KEYS
    )
  );
  const query = parseStringParam(searchParams.q).trim();
  const pageSize = parsePageSize(searchParams.pageSize);
  const notice =
    typeof searchParams.notice === 'string' ? searchParams.notice : undefined;
  const noticeStatus =
    typeof searchParams.status === 'string' ? searchParams.status : undefined;
  const nowIso = new Date().toISOString();
  const totalSuppressions =
    runtime.database.repositories.releaseSuppressions.countActive(nowIso);
  const filteredSuppressionCount =
    runtime.database.repositories.releaseSuppressions.countActiveFiltered(nowIso, {
      query,
    });
  const currentPage = clampPage(
    parsePositivePage(searchParams.page),
    filteredSuppressionCount,
    pageSize
  );
  const pagedSuppressions =
    runtime.database.repositories.releaseSuppressions.listActiveFilteredPage(
      nowIso,
      pageSize,
      (currentPage - 1) * pageSize,
      { query }
    );
  const displayMediaItems = await hydrateMediaDisplayRecords(
    runtime,
    pagedSuppressions.map((suppression) => suppression.mediaKey)
  );

  const titleCache = new Map<string, string | null>();
  const resolveTitle = (mediaKey: string) => {
    if (!titleCache.has(mediaKey)) {
      titleCache.set(
        mediaKey,
        displayMediaItems.get(mediaKey)?.title ??
          runtime.database.repositories.mediaItemState.getByMediaKey(mediaKey)?.title ??
          mediaKey
      );
    }

    return titleCache.get(mediaKey) ?? null;
  };
  const returnTo = buildSuppressionsHref({
    page: currentPage,
    pageSize,
    query,
  });

  return (
    <ConsoleShell
      title="Suppressions"
      subtitle="Active release suppressions created by Transmission guard actions or future policy layers."
      activePath="/suppressions"
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
        title="Active suppressions"
        subtitle="These blocks expire automatically unless cleared early."
        actions={renderPagination(currentPage, filteredSuppressionCount, pageSize, query)}
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
          action="/suppressions"
          className="candidate-filters"
          persistenceCookieName={SUPPRESSIONS_FILTER_COOKIE}
          persistedQueryKeys={SUPPRESSIONS_PERSISTED_QUERY_KEYS}
        >
          <input type="hidden" name="pageSize" value={String(pageSize)} />
          <div className="candidate-filters__grid">
            <label className="candidate-filters__field candidate-filters__field--wide">
              <span>Search</span>
              <input
                type="search"
                name="q"
                defaultValue={query}
                placeholder="Title, media key, reason, fingerprint, or source"
              />
            </label>
          </div>
          <div className="candidate-filters__actions">
            <span className="console-muted">
              {filteredSuppressionCount} matching suppression
              {filteredSuppressionCount === 1 ? '' : 's'} of {totalSuppressions}
            </span>
            <div className="transmission-controls__links">
              <QueryFilterLink
                href={buildSuppressionsHref({ page: 1, pageSize, query: '' })}
                className="console-link"
                persistenceCookieName={SUPPRESSIONS_FILTER_COOKIE}
                persistedQueryKeys={SUPPRESSIONS_PERSISTED_QUERY_KEYS}
              >
                Clear filters
              </QueryFilterLink>
              <button type="submit" className="console-button">
                Apply filters
              </button>
            </div>
          </div>
        </QueryFilterForm>
        <div className="bulk-actions">
          <form
            id="bulk-clear-selected-form"
            action={clearSelectedSuppressionsAction}
            className="bulk-actions__group"
          >
            <input
              type="hidden"
              name="csrfToken"
              value={runtime.csrfTokens.clearSuppressions}
            />
            <input type="hidden" name="returnTo" value={returnTo} />
            <ConfirmButton
              type="submit"
              className="console-button console-button--ghost"
              confirmMessage="Clear the selected suppressions?"
            >
              Clear selected
            </ConfirmButton>
          </form>
          <form action={clearAllMatchingSuppressionsAction} className="bulk-actions__group">
            <input
              type="hidden"
              name="csrfToken"
              value={runtime.csrfTokens.clearSuppressions}
            />
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="q" value={query} />
            <ConfirmButton
              type="submit"
              className="console-button console-button--ghost"
              confirmMessage={`Clear all ${filteredSuppressionCount} matching suppressions?`}
              disabled={filteredSuppressionCount === 0}
            >
              Clear all matching
            </ConfirmButton>
          </form>
        </div>
        <DataTable
          columns={[
            {
              key: 'select',
              label: <SuppressionSelectAll />,
            },
            { key: 'title', label: 'Title' },
            { key: 'mediaKey', label: 'Media key' },
            { key: 'fingerprintType', label: 'Fingerprint' },
            { key: 'reason', label: 'Reason' },
            { key: 'expiresAt', label: 'Expires' },
            { key: 'action', label: 'Action', align: 'right' },
          ]}
          rows={pagedSuppressions.map((suppression) => ({
            select:
              suppression.id !== undefined ? (
                <input
                  type="checkbox"
                  name="suppressionIds"
                  value={suppression.id}
                  form="bulk-clear-selected-form"
                  data-suppression-selectable="true"
                  className="table-select-checkbox"
                  aria-label={`Select suppression for ${resolveTitle(suppression.mediaKey) ?? suppression.mediaKey}`}
                />
              ) : null,
            title: (
              <div className="suppression-title" title={suppression.mediaKey}>
                <MediaItemLink
                  config={runtime.config}
                  mediaItem={displayMediaItems.get(suppression.mediaKey) ?? null}
                  fallbackTitle={resolveTitle(suppression.mediaKey) ?? suppression.mediaKey}
                  className="external-item-link"
                />
                <span className="secondary-value">
                  <code>{suppression.mediaKey}</code>
                </span>
              </div>
            ),
            mediaKey: suppression.mediaKey,
            fingerprintType: (
              <div
                title={`${suppression.fingerprintType}: ${suppression.fingerprintValue}`}
              >
                <strong>{formatFingerprintType(suppression.fingerprintType)}</strong>
                <span
                  className="secondary-value truncated-secondary-value"
                  title={formatFingerprintValue(
                    suppression.fingerprintType,
                    suppression.fingerprintValue
                  )}
                >
                  {formatFingerprintValue(
                    suppression.fingerprintType,
                    truncateValue(suppression.fingerprintValue)
                  )}
                </span>
              </div>
            ),
            reason: suppression.reason,
            expiresAt: formatTimestamp(suppression.expiresAt),
            action: suppression.id ? (
              <form
                action={clearSuppressionAction.bind(null, suppression.id)}
                className="table-inline-form"
              >
                <input
                  type="hidden"
                  name="csrfToken"
                  value={createCsrfToken(
                    `action:clear-suppression:${suppression.id}:${runtime.authenticated.sessionId}`,
                    runtime.config.auth.sessionSecret
                  )}
                />
                <ConfirmButton
                  type="submit"
                  className="table-inline-button"
                  confirmMessage={`Clear suppression for ${resolveTitle(suppression.mediaKey) ?? suppression.mediaKey}?`}
                >
                  Clear
                </ConfirmButton>
              </form>
            ) : null,
          }))}
          emptyMessage="No active suppressions are currently recorded."
        />
      </SectionCard>
    </ConsoleShell>
  );
}
