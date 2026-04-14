'use client';

import type { ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

import type { TableColumn } from './operator-console/helpers';

const PERSISTED_QUERY_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

const persistSortState = (
  nextUrl: string,
  cookieName: string | undefined,
  persistedQueryKeys: readonly string[] | undefined
) => {
  if (!cookieName || !persistedQueryKeys?.length) {
    return;
  }

  const url = new URL(nextUrl, window.location.href);
  const payload = Object.fromEntries(
    persistedQueryKeys.map((key) => [key, url.searchParams.get(key) ?? ''])
  );
  const hasPersistedValue = Object.values(payload).some((value) => value !== '');

  if (!hasPersistedValue) {
    document.cookie = `${cookieName}=; path=/; max-age=0; samesite=lax`;
    return;
  }

  document.cookie =
    `${cookieName}=${encodeURIComponent(JSON.stringify(payload))}; ` +
    `path=/; max-age=${PERSISTED_QUERY_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
};

const getSortDirection = (
  column: TableColumn,
  currentSort: string
): 'asc' | 'desc' | null => {
  if (!column.sortAsc && !column.sortDesc) {
    return null;
  }

  if (currentSort === column.sortAsc) {
    return 'asc';
  }

  if (currentSort === column.sortDesc) {
    return 'desc';
  }

  return null;
};

const getNextSort = (column: TableColumn, currentSort: string): string | null => {
  if (!column.sortAsc && !column.sortDesc) {
    return null;
  }

  if (currentSort === column.sortAsc && column.sortDesc) {
    return column.sortDesc;
  }

  if (currentSort === column.sortDesc && column.sortAsc) {
    return column.sortAsc;
  }

  return column.sortAsc ?? column.sortDesc ?? null;
};

export const SortableDataTable = ({
  columns,
  rows,
  emptyMessage,
  basePath,
  sortParam = 'sort',
  defaultSort,
  persistenceCookieName,
  persistedQueryKeys,
}: {
  columns: TableColumn[];
  rows: Array<Record<string, ReactNode>>;
  emptyMessage: string;
  basePath: string;
  sortParam?: string;
  defaultSort: string;
  persistenceCookieName?: string;
  persistedQueryKeys?: readonly string[];
}) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const currentSort = searchParams.get(sortParam) || defaultSort;

  const navigateToSort = (nextSort: string) => {
    const params = new URLSearchParams(searchParams.toString());

    if (nextSort === defaultSort) {
      params.delete(sortParam);
    } else {
      params.set(sortParam, nextSort);
    }

    // Reset page to 1 when sorting changes
    for (const key of Array.from(params.keys())) {
      if (key === 'page' || key.endsWith('Page')) {
        params.delete(key);
      }
    }

    const suffix = params.toString();
    const nextUrl = suffix ? `${basePath}?${suffix}` : basePath;
    persistSortState(nextUrl, persistenceCookieName, persistedQueryKeys);

    startTransition(() => {
      router.replace(nextUrl as never, { scroll: false });
    });
  };

  return (
    <div className="data-table" aria-busy={isPending} data-pending={isPending ? 'true' : 'false'}>
      <table>
        <thead>
          <tr>
            {columns.map((column) => {
              const isSortable = Boolean(column.sortAsc || column.sortDesc);
              const direction = getSortDirection(column, currentSort);
              const nextSort = getNextSort(column, currentSort);

              return (
                <th
                  key={column.key}
                  className={[
                    column.align === 'right' ? 'is-right' : undefined,
                    isSortable ? 'is-sortable' : undefined,
                    direction ? `is-sorted-${direction}` : undefined,
                  ]
                    .filter(Boolean)
                    .join(' ') || undefined}
                >
                  {isSortable && nextSort ? (
                    <button
                      type="button"
                      className="sortable-header"
                      onClick={() => navigateToSort(nextSort)}
                      aria-label={`Sort by ${typeof column.label === 'string' ? column.label : column.key}`}
                      disabled={isPending}
                    >
                      <span>{column.label}</span>
                      <span className="sort-indicator" aria-hidden="true">
                        {direction === 'asc'
                          ? '\u25B2'
                          : direction === 'desc'
                            ? '\u25BC'
                            : '\u25B8'}
                      </span>
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length > 0 ? (
            rows.map((row, index) => (
              <tr
                key={`${index}-${String(row[columns[0]?.key ?? index])}`}
                className={
                  typeof row.__rowClassName === 'string' ? row.__rowClassName : undefined
                }
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={column.align === 'right' ? 'is-right' : undefined}
                  >
                    {row[column.key] ?? null}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} className="data-table__empty">
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
