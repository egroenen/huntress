import Link from 'next/link';
import type { ReactNode } from 'react';

import type { SchedulerCoordinatorStatus } from '@/src/scheduler';
import { formatDisplayMode } from '@/src/ui/formatters';

import { BrandMark } from './brand-mark';
import { formatConsoleTimestamp, navigationItems } from './helpers';
import type { DependencyHealthCard } from './layout-primitives';

type NavPath =
  | '/'
  | '/status'
  | '/runs'
  | '/candidates'
  | '/suppressions'
  | '/transmission'
  | '/settings';

export const ConsoleShell = ({
  title,
  subtitle,
  activePath,
  currentUser,
  mode,
  schedulerStatus,
  dependencyCards,
  headerActions,
  children,
}: {
  title: string;
  subtitle: string;
  activePath: NavPath;
  currentUser: string;
  mode: 'dry-run' | 'live';
  schedulerStatus: SchedulerCoordinatorStatus;
  dependencyCards?: DependencyHealthCard[];
  headerActions?: ReactNode;
  children: ReactNode;
}) => {
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
            <strong>{formatConsoleTimestamp(schedulerStatus.nextScheduledRunAt)}</strong>
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

          {headerActions}
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
