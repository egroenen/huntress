import type { ReactNode } from 'react';

import { createCsrfToken } from '@/src/auth';
import { probeDependencyHealth } from '@/src/server/console-data';
import { hydrateMediaDisplayRecords } from '@/src/server/media-display';
import {
  ConfirmButton,
  ConsoleShell,
  DataTable,
  MediaItemLink,
  SectionCard,
  SuppressionSelectAll,
} from '@/src/ui';
import { formatServiceName } from '@/src/ui/formatters';
import { requireAuthenticatedConsoleContext } from '@/src/server/require-auth';

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

const parseStringParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? '') : (value ?? '');

const parsePositivePage = (value: string | string[] | undefined): number => {
  const parsed = Number.parseInt(parseStringParam(value), 10);

  if (Number.isNaN(parsed) || parsed < 1) {
    return 1;
  }

  return parsed;
};

const clampPage = (page: number, totalItems: number): number => {
  const totalPages = Math.max(Math.ceil(totalItems / PAGE_SIZE), 1);
  return Math.min(page, totalPages);
};

const buildSuppressionsHref = (input: { page: number; query: string }): string => {
  const params = new URLSearchParams();

  if (input.query.trim()) {
    params.set('q', input.query.trim());
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
  query: string
): ReactNode => {
  const totalPages = Math.max(Math.ceil(totalItems / PAGE_SIZE), 1);

  if (totalItems <= PAGE_SIZE) {
    return (
      <span className="console-muted">Showing all {totalItems} active suppressions.</span>
    );
  }

  return (
    <div className="table-pagination">
      <span className="console-muted">
        Page {currentPage} of {totalPages} · {totalItems} active suppressions
      </span>
      <div className="table-pagination__links">
        {currentPage > 1 ? (
          <a
            href={buildSuppressionsHref({ page: currentPage - 1, query })}
            className="console-link"
          >
            Previous
          </a>
        ) : (
          <span className="console-muted">Previous</span>
        )}
        {currentPage < totalPages ? (
          <a
            href={buildSuppressionsHref({ page: currentPage + 1, query })}
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
  const dependencyCards = await probeDependencyHealth(runtime);
  const searchParams = await props.searchParams;
  const query = parseStringParam(searchParams.q).trim();
  const notice =
    typeof searchParams.notice === 'string' ? searchParams.notice : undefined;
  const noticeStatus =
    typeof searchParams.status === 'string' ? searchParams.status : undefined;
  const suppressions = runtime.database.repositories.releaseSuppressions.listActive(
    new Date().toISOString()
  );
  const returnToBase = buildSuppressionsHref({
    page: parsePositivePage(searchParams.page),
    query,
  });
  const displayMediaItems = await hydrateMediaDisplayRecords(
    runtime,
    suppressions.map((suppression) => suppression.mediaKey)
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

  const filteredSuppressions = suppressions.filter((suppression) => {
    if (!query) {
      return true;
    }

    const haystack = [
      resolveTitle(suppression.mediaKey) ?? '',
      suppression.mediaKey,
      suppression.fingerprintType,
      suppression.fingerprintValue,
      suppression.reason,
      suppression.source,
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(query.toLowerCase());
  });

  const currentPage = clampPage(
    parsePositivePage(searchParams.page),
    filteredSuppressions.length
  );
  const pagedSuppressions = filteredSuppressions.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );
  const returnTo = buildSuppressionsHref({
    page: currentPage,
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
      actionTokens={runtime.csrfTokens}
      dependencyCards={dependencyCards}
    >
      <SectionCard
        title="Active suppressions"
        subtitle="These blocks expire automatically unless cleared early."
        actions={renderPagination(currentPage, filteredSuppressions.length, query)}
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
        <form action="/suppressions" method="get" className="candidate-filters">
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
              {filteredSuppressions.length} matching suppression
              {filteredSuppressions.length === 1 ? '' : 's'} of {suppressions.length}
            </span>
            <div className="transmission-controls__links">
              <a href="/suppressions" className="console-link">
                Clear filters
              </a>
              <button type="submit" className="console-button">
                Apply filters
              </button>
            </div>
          </div>
        </form>
        <div className="bulk-actions">
          <form
            id="bulk-clear-selected-form"
            action="/api/suppressions/clear-selected"
            method="post"
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
          <form
            action="/api/suppressions/clear-selected"
            method="post"
            className="bulk-actions__group"
          >
            <input
              type="hidden"
              name="csrfToken"
              value={runtime.csrfTokens.clearSuppressions}
            />
            <input type="hidden" name="returnTo" value={returnToBase} />
            {filteredSuppressions
              .map((suppression) => suppression.id)
              .filter((id): id is number => typeof id === 'number')
              .map((id) => (
                <input key={id} type="hidden" name="suppressionIds" value={id} />
              ))}
            <ConfirmButton
              type="submit"
              className="console-button console-button--ghost"
              confirmMessage={`Clear all ${filteredSuppressions.length} matching suppressions?`}
              disabled={filteredSuppressions.length === 0}
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
                action={`/api/suppressions/${suppression.id}/clear`}
                method="post"
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
