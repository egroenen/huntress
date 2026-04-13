'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';

import type { SchedulerCoordinatorStatus } from '@/src/scheduler';
import { useNavigationProgress } from '@/src/ui/navigation-progress';
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

const shouldHandleNavigationClick = (
  event: MouseEvent<HTMLAnchorElement>,
  href: string,
  currentUrl: string
) => {
  if (event.defaultPrevented) {
    return false;
  }

  if (event.button !== 0) {
    return false;
  }

  if (event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) {
    return false;
  }

  if (href === currentUrl) {
    return false;
  }

  return true;
};

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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { pendingNavigation, startNavigation } = useNavigationProgress();
  const [resolvedDependencyCards, setResolvedDependencyCards] = useState<
    DependencyHealthCard[] | null
  >(dependencyCards ?? null);
  const effectiveDependencyCards = dependencyCards ?? resolvedDependencyCards ?? [];

  useEffect(() => {
    if (dependencyCards) {
      return;
    }

    const abortController = new AbortController();
    let active = true;

    void fetch('/api/console/dependencies', {
      cache: 'no-store',
      signal: abortController.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Dependency request failed with status ${response.status}`);
        }

        return (await response.json()) as {
          dependencyCards?: DependencyHealthCard[];
        };
      })
      .then((payload) => {
        if (!active) {
          return;
        }

        setResolvedDependencyCards(payload.dependencyCards ?? []);
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setResolvedDependencyCards([]);
      });

    return () => {
      active = false;
      abortController.abort();
    };
  }, [dependencyCards, pathname]);

  const activeDependencyIssues =
    effectiveDependencyCards.filter((card) => card.status !== 'healthy') ?? [];
  const hasUnavailableDependency = activeDependencyIssues.some(
    (card) => card.status === 'unavailable'
  );
  const dependencySummary =
    activeDependencyIssues.length === 1
      ? `${activeDependencyIssues[0]?.name}: ${activeDependencyIssues[0]?.summary}`
      : `${activeDependencyIssues.length} dependency issues active`;
  const highlightedPath = (pendingNavigation?.href as NavPath | undefined) ?? activePath;
  const isNavigating = Boolean(pendingNavigation);
  const currentUrl = searchParams.size > 0 ? `${pathname}?${searchParams.toString()}` : pathname;

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
            const active = item.href === highlightedPath;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? 'console-nav__link is-active' : 'console-nav__link'}
                onClick={(event) => {
                  if (!shouldHandleNavigationClick(event, item.href, currentUrl)) {
                    return;
                  }

                  startNavigation({ href: item.href, label: item.label });
                }}
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
        <div
          className={
            isNavigating
              ? 'console-content console-content--is-navigating'
              : 'console-content'
          }
        >
          {children}
          {isNavigating ? (
            <div className="console-content__loading-overlay" aria-live="polite">
              <div className="console-content__loading-card">
                <span className="console-content__spinner" aria-hidden="true" />
                <strong>Opening {pendingNavigation?.label ?? 'page'}...</strong>
                <small>Loading content...</small>
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
};
