import { QueryFilterForm, QueryFilterLink } from './query-filter-form';

interface TablePaginationHiddenInput {
  name: string;
  value: string;
}

interface TablePaginationProps {
  action: string;
  currentPage: number;
  totalPages: number;
  summary: string;
  pageSize: number;
  pageSizeParamName?: string;
  pageParamName?: string;
  pageSizeOptions: readonly number[];
  hiddenInputs?: TablePaginationHiddenInput[];
  firstHref?: string | null;
  previousHref?: string | null;
  nextHref?: string | null;
  lastHref?: string | null;
  persistenceCookieName?: string;
  persistedQueryKeys?: readonly string[];
}

export const TablePagination = ({
  action,
  currentPage,
  firstHref,
  hiddenInputs = [],
  lastHref,
  nextHref,
  pageParamName = 'page',
  pageSize,
  pageSizeOptions,
  pageSizeParamName = 'pageSize',
  previousHref,
  persistenceCookieName,
  persistedQueryKeys,
  summary,
  totalPages,
}: TablePaginationProps) => {
  return (
    <div className="table-pagination">
      <span className="console-muted">{summary}</span>
      <div className="table-pagination__controls">
        <QueryFilterForm
          action={action}
          className="table-pagination__form"
          autoSubmitOnChange
          pendingMessage={null}
          persistenceCookieName={persistenceCookieName}
          persistedQueryKeys={persistedQueryKeys}
        >
          {hiddenInputs.map((input) => (
            <input key={`${input.name}:${input.value}`} type="hidden" {...input} />
          ))}
          <input type="hidden" name={pageParamName} value="1" />
          <label className="table-pagination__page-size">
            <span className="console-muted">Rows</span>
            <span className="table-pagination__page-size-control">
              <select
                name={pageSizeParamName}
                defaultValue={String(pageSize)}
                aria-label="Rows per page"
              >
                {pageSizeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <span className="table-pagination__page-size-caret" aria-hidden="true">
                ▾
              </span>
            </span>
          </label>
        </QueryFilterForm>
        <div className="table-pagination__links" aria-label="Pagination">
          {firstHref ? (
            <QueryFilterLink
              href={firstHref}
              className="console-link table-pagination__nav-link"
              persistenceCookieName={persistenceCookieName}
              persistedQueryKeys={persistedQueryKeys}
            >
              {'«'}
            </QueryFilterLink>
          ) : (
            <span className="console-muted table-pagination__nav-link is-disabled">
              {'«'}
            </span>
          )}
          {previousHref ? (
            <QueryFilterLink
              href={previousHref}
              className="console-link table-pagination__nav-link"
              persistenceCookieName={persistenceCookieName}
              persistedQueryKeys={persistedQueryKeys}
            >
              {'‹'}
            </QueryFilterLink>
          ) : (
            <span className="console-muted table-pagination__nav-link is-disabled">
              {'‹'}
            </span>
          )}
          <span className="console-muted table-pagination__page-indicator">
            {currentPage} / {Math.max(totalPages, 1)}
          </span>
          {nextHref ? (
            <QueryFilterLink
              href={nextHref}
              className="console-link table-pagination__nav-link"
              persistenceCookieName={persistenceCookieName}
              persistedQueryKeys={persistedQueryKeys}
            >
              {'›'}
            </QueryFilterLink>
          ) : (
            <span className="console-muted table-pagination__nav-link is-disabled">
              {'›'}
            </span>
          )}
          {lastHref ? (
            <QueryFilterLink
              href={lastHref}
              className="console-link table-pagination__nav-link"
              persistenceCookieName={persistenceCookieName}
              persistedQueryKeys={persistedQueryKeys}
            >
              {'»'}
            </QueryFilterLink>
          ) : (
            <span className="console-muted table-pagination__nav-link is-disabled">
              {'»'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
