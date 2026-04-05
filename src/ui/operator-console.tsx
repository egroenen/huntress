import Link from 'next/link';
import type { ReactNode } from 'react';

import type { SchedulerCoordinatorStatus } from '@/src/scheduler';
import {
  formatDisplayMode,
  formatReasonCodeLabel,
  formatRunTypeLabel,
} from './formatters';

type NavPath =
  | '/'
  | '/status'
  | '/runs'
  | '/candidates'
  | '/suppressions'
  | '/transmission'
  | '/settings';

export interface ConsoleActionTokens {
  logout: string;
  runSync: string;
  runDry: string;
  runLive: string;
  recoverRun: string;
  manualFetch: string;
  resetTransmissionCache: string;
  clearSuppressions: string;
}

export interface DependencyHealthCard {
  name: string;
  status: 'healthy' | 'degraded' | 'unavailable';
  summary: string;
  detail?: string | null;
}

interface ConsoleShellProps {
  title: string;
  subtitle: string;
  activePath: NavPath;
  currentUser: string;
  mode: 'dry-run' | 'live';
  schedulerStatus: SchedulerCoordinatorStatus;
  actionTokens: ConsoleActionTokens;
  dependencyCards?: DependencyHealthCard[];
  children: ReactNode;
}

interface StatsGridProps {
  children: ReactNode;
  className?: string;
}

interface StatCardProps {
  label: string;
  value: string | number;
  tone?: 'default' | 'success' | 'warn' | 'danger';
  detail?: ReactNode;
}

interface SectionCardProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}

interface TableProps {
  columns: Array<{
    key: string;
    label: ReactNode;
    align?: 'left' | 'right';
  }>;
  rows: Array<Record<string, ReactNode>>;
  emptyMessage: string;
}

const navigationItems: Array<{ href: NavPath; label: string; badge?: string }> = [
  { href: '/', label: 'Overview' },
  { href: '/status', label: 'Status' },
  { href: '/runs', label: 'Runs' },
  { href: '/candidates', label: 'Candidates' },
  { href: '/suppressions', label: 'Suppressions' },
  { href: '/transmission', label: 'Transmission' },
  { href: '/settings', label: 'Settings' },
];

const formatTimestamp = (value: string | null): string => {
  if (!value) {
    return 'n/a';
  }

  return new Intl.DateTimeFormat('en-NZ', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
};

export const StatusBadge = ({
  status,
  children,
  title,
  ariaLabel,
}: {
  status: string;
  children?: ReactNode;
  title?: string;
  ariaLabel?: string;
}) => {
  const normalizedStatus = [
    'healthy',
    'degraded',
    'unavailable',
    'running',
    'success',
    'info',
    'partial',
    'failed',
  ].includes(status)
    ? status
    : 'degraded';

  return (
    <span
      className={`status-badge status-badge--${normalizedStatus}`}
      title={title}
      aria-label={ariaLabel}
    >
      {children ?? status.replace('_', ' ')}
    </span>
  );
};

export const ReasonCodeBadge = ({ reasonCode }: { reasonCode: string }) => {
  return (
    <code
      className="reason-code"
      title={`${formatReasonCodeLabel(reasonCode)} (${reasonCode})`}
    >
      {formatReasonCodeLabel(reasonCode)}
    </code>
  );
};

const BrandMark = () => {
  return (
    <svg
      className="console-brand__mark"
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="edarr-brand-ring" x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stopColor="#5ad5ef" />
          <stop offset="100%" stopColor="#1786b3" />
        </linearGradient>
        <linearGradient id="edarr-brand-core" x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stopColor="#ffd06a" />
          <stop offset="100%" stopColor="#d98d11" />
        </linearGradient>
      </defs>

      <circle
        cx="32"
        cy="32"
        r="22"
        fill="none"
        stroke="url(#edarr-brand-ring)"
        strokeWidth="8"
      />
      <path
        d="M32 10a22 22 0 0 1 19.05 11H38.5a9.5 9.5 0 0 0-6.5-2.55z"
        fill="url(#edarr-brand-ring)"
      />
      <path
        d="M54 32a22 22 0 0 1-11 19.05V38.5A9.5 9.5 0 0 0 45.55 32z"
        fill="url(#edarr-brand-ring)"
      />
      <path
        d="M32 54a22 22 0 0 1-19.05-11H25.5A9.5 9.5 0 0 0 32 45.55z"
        fill="url(#edarr-brand-ring)"
      />
      <path d="M26 18h15l-8 10h7L23 46l5-13h-6z" fill="url(#edarr-brand-core)" />
      <circle cx="32" cy="32" r="3.2" fill="#0f1723" />
    </svg>
  );
};

export const ConsoleShell = ({
  title,
  subtitle,
  activePath,
  currentUser,
  mode,
  schedulerStatus,
  actionTokens,
  dependencyCards,
  children,
}: ConsoleShellProps) => {
  const activeDependencyIssues =
    dependencyCards?.filter((card) => card.status !== 'healthy') ?? [];
  const hasUnavailableDependency = activeDependencyIssues.some(
    (card) => card.status === 'unavailable'
  );
  const dependencySummary =
    activeDependencyIssues.length === 1
      ? `${activeDependencyIssues[0]?.name}: ${activeDependencyIssues[0]?.summary}`
      : `${activeDependencyIssues.length} dependency issues active`;

  return (
    <div className="console-shell">
      <aside className="console-sidebar">
        <div className="console-brand">
          <BrandMark />
          <div>
            <h1 className="console-brand__title">Operator Console</h1>
          </div>
        </div>

        <nav className="console-nav" aria-label="Primary">
          {navigationItems.map((item) => {
            const active = item.href === activePath;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? 'console-nav__link is-active' : 'console-nav__link'}
              >
                <span>{item.label}</span>
                {item.badge ? <small>{item.badge}</small> : null}
              </Link>
            );
          })}
        </nav>

        <div className="console-sidebar__meta">
          <div>
            <span className="console-meta__label">Dispatch mode</span>
            <strong>{formatDisplayMode(mode)}</strong>
          </div>
          <div>
            <span className="console-meta__label">Next cycle</span>
            <strong>{formatTimestamp(schedulerStatus.nextScheduledRunAt)}</strong>
          </div>
          <div>
            <span className="console-meta__label">User</span>
            <strong>{currentUser}</strong>
          </div>
        </div>
      </aside>

      <main className="console-main">
        <header className="console-header">
          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>

          <div className="console-header__meta">
            <div className="header-status-stack">
              <StatusBadge
                status={mode === 'live' ? 'success' : 'degraded'}
                title={
                  mode === 'live'
                    ? 'Live dispatch is enabled. Manual and scheduled live cycles can send real searches to Sonarr and Radarr, subject to safety rules.'
                    : 'Dry-run mode is enabled. The system will evaluate and record decisions, but it will not send real searches.'
                }
                ariaLabel={
                  mode === 'live' ? 'Live dispatch enabled' : 'Dry-run mode enabled'
                }
              >
                {mode === 'live' ? 'live dispatch' : 'dry-run mode'}
              </StatusBadge>
              {schedulerStatus.startupGraceActive ? (
                <StatusBadge
                  status="info"
                  title="Startup grace is active. Automatic live dispatch is temporarily paused while the service settles after startup."
                  ariaLabel="Startup grace active"
                >
                  startup grace active
                </StatusBadge>
              ) : null}
              {schedulerStatus.activeRun ? (
                <StatusBadge
                  status="running"
                  title={`A ${formatRunTypeLabel(schedulerStatus.activeRun.runType)} is currently active. Open Status to watch detailed progress or use Recover run if it is stuck.`}
                  ariaLabel={`${formatRunTypeLabel(schedulerStatus.activeRun.runType)} run active`}
                >
                  {formatRunTypeLabel(schedulerStatus.activeRun.runType)} running
                </StatusBadge>
              ) : null}
            </div>

            <div className="console-actions">
              {schedulerStatus.activeRun ? (
                <form action="/api/actions/recover-run" method="post">
                  <input type="hidden" name="csrfToken" value={actionTokens.recoverRun} />
                  <button
                    type="submit"
                    className="console-button console-button--ghost"
                    title="Force clear the currently active run if it is stuck, release the scheduler lock, and mark it as failed."
                    aria-label="Recover run: force clear the active run, release the scheduler lock, and mark it failed"
                  >
                    Recover run
                  </button>
                </form>
              ) : null}
              <form action="/api/actions/run-sync" method="post">
                <input type="hidden" name="csrfToken" value={actionTokens.runSync} />
                <button
                  type="submit"
                  className="console-button console-button--ghost"
                  title="Refresh Sonarr, Radarr, and Transmission state without dispatching any searches."
                  aria-label="Run sync: refresh Sonarr, Radarr, and Transmission state without dispatching searches"
                >
                  Run sync
                </button>
              </form>
              <form action="/api/actions/run-dry" method="post">
                <input type="hidden" name="csrfToken" value={actionTokens.runDry} />
                <button
                  type="submit"
                  className="console-button console-button--ghost"
                  title="Evaluate what would be searched right now and record the decisions, but do not send any searches to Sonarr or Radarr."
                  aria-label="Dry cycle: preview and record search decisions without sending searches"
                >
                  Dry cycle
                </button>
              </form>
              <form action="/api/actions/run-live" method="post">
                <input type="hidden" name="csrfToken" value={actionTokens.runLive} />
                <button
                  type="submit"
                  className="console-button"
                  title="Run a full cycle and allow live search dispatches, subject to cooldowns, budgets, and safety checks."
                  aria-label="Live cycle: run a full cycle and allow live search dispatches"
                >
                  Live cycle
                </button>
              </form>
              <form action="/auth/logout" method="post">
                <input type="hidden" name="csrfToken" value={actionTokens.logout} />
                <button
                  type="submit"
                  className="console-button console-button--ghost"
                  title="Sign out of the operator console."
                  aria-label="Sign out of the operator console"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </header>

        {activeDependencyIssues.length > 0 ? (
          <div
            className={
              hasUnavailableDependency
                ? 'dependency-banner dependency-banner--error'
                : 'dependency-banner dependency-banner--warn'
            }
          >
            <div>
              <strong>{dependencySummary}</strong>
              <p>
                {activeDependencyIssues
                  .map((card) => `${card.name}: ${card.detail ?? card.summary}`)
                  .join(' · ')}
              </p>
            </div>
            <Link href="/" className="console-link">
              Review dependency health
            </Link>
          </div>
        ) : null}
        <div className="console-content">{children}</div>
      </main>
    </div>
  );
};

export const StatsGrid = ({ children, className }: StatsGridProps) => {
  const classes = ['stats-grid', className].filter(Boolean).join(' ');
  return <section className={classes}>{children}</section>;
};

export const StatCard = ({ label, value, tone = 'default', detail }: StatCardProps) => {
  return (
    <article className={`stat-card stat-card--${tone}`}>
      <span className="stat-card__label">{label}</span>
      <strong className="stat-card__value">{value}</strong>
      {detail ? <div className="stat-card__detail">{detail}</div> : null}
    </article>
  );
};

export const SectionCard = ({ title, subtitle, actions, children }: SectionCardProps) => {
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

export const DataTable = ({ columns, rows, emptyMessage }: TableProps) => {
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
