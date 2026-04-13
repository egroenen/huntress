import {
  ConsoleShell,
  SectionCard,
  StatCard,
  StatsGrid,
} from '@/src/ui';

const loadingSchedulerStatus = {
  startedAt: new Date(0).toISOString(),
  startupGraceActive: false,
  nextScheduledRunAt: null,
  maxRunDurationMs: 30 * 60_000,
  activeRun: null,
} as const;

export default function StatusLoading() {
  return (
    <ConsoleShell
      title="Status"
      subtitle="Loading live scheduler state and recent event activity."
      activePath="/status"
      currentUser="Loading..."
      mode="live"
      schedulerStatus={loadingSchedulerStatus}
    >
      <StatsGrid>
        <StatCard label="Active run" value="Loading..." detail="Fetching scheduler status" />
        <StatCard label="Current stage" value="Loading..." detail="Fetching current activity" />
        <StatCard label="Last update" value="Loading..." detail="Waiting for latest event" />
        <StatCard label="Progress" value="Loading..." detail="Preparing event summary" />
      </StatsGrid>

      <SectionCard
        title="Current activity"
        subtitle="Loading the latest activity snapshot."
      >
        <p className="console-muted">Fetching current scheduler activity...</p>
      </SectionCard>

      <SectionCard
        title="Recent event feed"
        subtitle="Loading the latest event rows."
      >
        <p className="console-muted">Fetching recent run and dispatch events...</p>
      </SectionCard>
    </ConsoleShell>
  );
}
