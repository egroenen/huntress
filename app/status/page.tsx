import { getActivityFeedState } from '@/src/observability';
import { requireAuthenticatedConsoleContext } from '@/src/server/require-auth';
import { AutoRefresh } from '@/src/ui/auto-refresh';
import {
  ConsoleShell,
  DataTable,
  SectionCard,
  StatCard,
  StatsGrid,
  StatusBadge,
} from '@/src/ui';
import {
  formatRunTypeLabel,
  formatServiceName,
  formatShortRunId,
} from '@/src/ui/formatters';

export const dynamic = 'force-dynamic';

const formatTimestamp = (value: string | null): string => {
  if (!value) {
    return 'n/a';
  }

  return new Intl.DateTimeFormat('en-NZ', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(value));
};

const formatProgress = (current: number | null, total: number | null): string => {
  if (current === null && total === null) {
    return 'n/a';
  }

  if (current !== null && total !== null) {
    return `${current} / ${total}`;
  }

  return String(current ?? total);
};

const toBadgeStatus = (
  level: 'info' | 'warn' | 'error',
  active: boolean
): 'running' | 'degraded' | 'failed' | 'success' => {
  if (level === 'error') {
    return 'failed';
  }

  if (level === 'warn') {
    return 'degraded';
  }

  return active ? 'running' : 'success';
};

export default async function StatusPage() {
  const runtime = await requireAuthenticatedConsoleContext();
  const activity = getActivityFeedState(runtime.database);
  const current = activity.current;
  const schedulerStatus = runtime.scheduler.getStatus();
  const activeRun = schedulerStatus.activeRun;
  const autoRefreshEnabled = Boolean(activeRun);

  return (
    <ConsoleShell
      title="Status"
      subtitle="Live progress view for the active scheduler run, with a recent event feed so you can see exactly where work is up to."
      activePath="/status"
      currentUser={runtime.authenticated.user.username}
      mode={runtime.config.mode}
      schedulerStatus={schedulerStatus}
      actionTokens={runtime.csrfTokens}
    >
      <AutoRefresh intervalMs={5000} enabled={autoRefreshEnabled} />

      <StatsGrid>
        <StatCard
          label="Active run"
          value={activeRun ? formatRunTypeLabel(activeRun.runType) : 'idle'}
          tone={activeRun ? (activeRun.overrun ? 'danger' : 'success') : 'default'}
          detail={
            activeRun
              ? `${formatTimestamp(activeRun.startedAt)} · ${Math.round(activeRun.durationMs / 1000)}s elapsed`
              : 'No scheduler lock currently active'
          }
        />
        <StatCard
          label="Current stage"
          value={current?.stage.replaceAll('_', ' ') ?? 'idle'}
          tone={
            current?.level === 'error'
              ? 'danger'
              : current?.level === 'warn'
                ? 'warn'
                : current?.active
                  ? 'success'
                  : 'default'
          }
          detail={current?.message ?? 'Waiting for the next action'}
        />
        <StatCard
          label="Last update"
          value={formatTimestamp(current?.occurredAt ?? null)}
          detail={
            current?.detail ??
            (autoRefreshEnabled
              ? 'Live refresh active every 5 seconds'
              : 'Refresh resumes automatically during the next active run')
          }
        />
        <StatCard
          label="Progress"
          value={formatProgress(
            current?.progressCurrent ?? null,
            current?.progressTotal ?? null
          )}
          detail={
            current?.progressTotal
              ? `${Math.round(((current.progressCurrent ?? 0) / current.progressTotal) * 100)}% complete`
              : 'Progress not available for this step'
          }
        />
      </StatsGrid>

      <SectionCard
        title="Current activity"
        subtitle="The most recent active stage reported by the running job."
        actions={
          <div className="section-card__actions">
            {autoRefreshEnabled ? (
              <span className="status-live-indicator">
                <span className="status-live-indicator__dot" />
                Live refresh
              </span>
            ) : null}
            {activeRun ? (
              <form action="/api/actions/recover-run" method="post">
                <input
                  type="hidden"
                  name="csrfToken"
                  value={runtime.csrfTokens.recoverRun}
                />
                <button type="submit" className="table-inline-button">
                  Recover run
                </button>
              </form>
            ) : null}
          </div>
        }
      >
        <div className="activity-panel">
          <div className="activity-panel__header">
            <div>
              <span className="console-meta__label">Source</span>
              <strong>{formatServiceName(current?.source ?? 'scheduler')}</strong>
            </div>
            <StatusBadge
              status={toBadgeStatus(current?.level ?? 'info', current?.active ?? false)}
            >
              {current ? (current.active ? current.level : 'idle') : 'idle'}
            </StatusBadge>
          </div>
          <h4>{current?.message ?? 'No active work right now.'}</h4>
          <p className="activity-panel__detail">
            {current?.detail ??
              'This page refreshes automatically while the service is running.'}
          </p>
          <div className="activity-progress">
            <div
              className="activity-progress__bar"
              style={{
                width:
                  current?.progressCurrent !== null &&
                  current?.progressCurrent !== undefined &&
                  current?.progressTotal
                    ? `${Math.max(
                        6,
                        Math.min(
                          100,
                          (current.progressCurrent / current.progressTotal) * 100
                        )
                      )}%`
                    : '6%',
              }}
            />
          </div>
          <div className="activity-panel__meta">
            <span>Updated {formatTimestamp(current?.occurredAt ?? null)}</span>
            <span title={current?.runId ?? undefined}>
              Run {formatShortRunId(current?.runId ?? null)}
            </span>
            <span>
              Progress{' '}
              {formatProgress(
                current?.progressCurrent ?? null,
                current?.progressTotal ?? null
              )}
            </span>
            {activeRun ? (
              <span>
                Max duration {Math.round(schedulerStatus.maxRunDurationMs / 60_000)}m
                {activeRun.overrun ? ' · overrun' : ''}
              </span>
            ) : null}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Recent event feed"
        subtitle="Newest first. This is the detailed step-by-step trail for the current and recent runs."
      >
        <DataTable
          columns={[
            { key: 'time', label: 'Time' },
            { key: 'source', label: 'Source' },
            { key: 'stage', label: 'Stage' },
            { key: 'message', label: 'Message' },
            { key: 'progress', label: 'Progress', align: 'right' },
            { key: 'run', label: 'Run' },
          ]}
          rows={activity.recent.map((event) => ({
            time: (
              <span className="timestamp-cell">{formatTimestamp(event.occurredAt)}</span>
            ),
            source: (
              <span className="table-app-label table-app-label--inline">
                {formatServiceName(event.source)}
              </span>
            ),
            stage: (
              <span className="activity-stage">
                <StatusBadge status={toBadgeStatus(event.level, event.active)}>
                  {event.level}
                </StatusBadge>
                <code className="reason-code">{event.stage}</code>
              </span>
            ),
            message: (
              <div className="activity-message">
                <strong>{event.message}</strong>
                {event.detail ? <small>{event.detail}</small> : null}
              </div>
            ),
            progress: formatProgress(event.progressCurrent, event.progressTotal),
            run: event.runId ? (
              <span className="run-id-cell" title={event.runId}>
                {formatShortRunId(event.runId)}
              </span>
            ) : (
              'n/a'
            ),
          }))}
          emptyMessage="No activity has been recorded yet."
        />
      </SectionCard>
    </ConsoleShell>
  );
}
