import { getActivityFeedState } from '@/src/observability';
import { requireAuthenticatedConsoleContext } from '@/src/server/require-auth';
import { AutoRefresh } from '@/src/ui/auto-refresh';
import { ConsoleShell, DataTable, SectionCard, StatCard, StatsGrid, StatusBadge } from '@/src/ui';

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

const formatProgress = (
  current: number | null,
  total: number | null
): string => {
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

  return (
    <ConsoleShell
      title="Status"
      subtitle="Live progress view for the active scheduler run, with a recent event feed so you can see exactly where work is up to."
      activePath="/status"
      currentUser={runtime.authenticated.user.username}
      mode={runtime.config.mode}
      schedulerStatus={runtime.scheduler.getStatus()}
      actionTokens={runtime.csrfTokens}
    >
      <AutoRefresh intervalMs={3000} />

      <StatsGrid>
        <StatCard
          label="Active run"
          value={runtime.scheduler.getStatus().activeRun?.runType.replace('_', ' ') ?? 'idle'}
          tone={runtime.scheduler.getStatus().activeRun ? 'success' : 'default'}
          detail={
            runtime.scheduler.getStatus().activeRun
              ? formatTimestamp(runtime.scheduler.getStatus().activeRun?.startedAt ?? null)
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
          detail={current?.detail ?? 'Auto-refreshing every 3 seconds'}
        />
        <StatCard
          label="Progress"
          value={formatProgress(current?.progressCurrent ?? null, current?.progressTotal ?? null)}
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
      >
        <div className="activity-panel">
          <div className="activity-panel__header">
            <div>
              <span className="console-meta__label">Source</span>
              <strong>{current?.source ?? 'scheduler'}</strong>
            </div>
            <StatusBadge
              status={toBadgeStatus(current?.level ?? 'info', current?.active ?? false)}
            >
              {current ? (current.active ? current.level : 'idle') : 'idle'}
            </StatusBadge>
          </div>
          <h4>{current?.message ?? 'No active work right now.'}</h4>
          <p className="activity-panel__detail">
            {current?.detail ?? 'This page refreshes automatically while the service is running.'}
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
            <span>Run {current?.runId ?? 'n/a'}</span>
            <span>Progress {formatProgress(current?.progressCurrent ?? null, current?.progressTotal ?? null)}</span>
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
            time: formatTimestamp(event.occurredAt),
            source: (
              <span className="table-app-label table-app-label--inline">{event.source}</span>
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
            run: event.runId ?? 'n/a',
          }))}
          emptyMessage="No activity has been recorded yet."
        />
      </SectionCard>
    </ConsoleShell>
  );
}
