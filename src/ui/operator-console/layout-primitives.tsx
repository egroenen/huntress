import type { ReactNode } from 'react';

import type { TableColumn } from './helpers';
import { StatusBadge } from './status-badge';

export interface DependencyHealthCard {
  name: string;
  status: 'healthy' | 'degraded' | 'unavailable';
  summary: string;
  detail?: string | null;
}

export const StatsGrid = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => {
  const classes = ['stats-grid', className].filter(Boolean).join(' ');
  return <section className={classes}>{children}</section>;
};

export const StatCard = ({
  label,
  value,
  tone = 'default',
  detail,
}: {
  label: string;
  value: string | number;
  tone?: 'default' | 'success' | 'warn' | 'danger';
  detail?: ReactNode;
}) => {
  return (
    <article className={`stat-card stat-card--${tone}`}>
      <span className="stat-card__label">{label}</span>
      <strong className="stat-card__value">{value}</strong>
      {detail ? <div className="stat-card__detail">{detail}</div> : null}
    </article>
  );
};

export const SectionCard = ({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) => {
  return (
    <section className="section-card">
      <header className="section-card__header">
        <div>
          <h3>{title}</h3>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {actions ? <div className="section-card__actions">{actions}</div> : null}
      </header>
      <div className="section-card__body">{children}</div>
    </section>
  );
};

export const DataTable = ({
  columns,
  rows,
  emptyMessage,
}: {
  columns: TableColumn[];
  rows: Array<Record<string, ReactNode>>;
  emptyMessage: string;
}) => {
  return (
    <div className="data-table">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className={column.align === 'right' ? 'is-right' : undefined}
              >
                {column.label}
              </th>
            ))}
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

export const DependencyHealthGrid = ({
  dependencies,
}: {
  dependencies: DependencyHealthCard[];
}) => {
  return (
    <section className="dependency-grid">
      {dependencies.map((dependency) => (
        <article key={dependency.name} className="dependency-card">
          <div className="dependency-card__header">
            <h4>{dependency.name}</h4>
            <StatusBadge status={dependency.status}>{dependency.status}</StatusBadge>
          </div>
          <p>{dependency.summary}</p>
          {dependency.detail ? (
            <small className="dependency-card__detail">{dependency.detail}</small>
          ) : null}
        </article>
      ))}
    </section>
  );
};

export const EmptyState = ({ title, body }: { title: string; body: string }) => {
  return (
    <div className="empty-state">
      <h4>{title}</h4>
      <p>{body}</p>
    </div>
  );
};
