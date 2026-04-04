import { getDashboardCandidateSnapshot } from '@/src/server/console-data';
import { requireAuthenticatedConsoleContext } from '@/src/server/require-auth';
import {
  ConsoleShell,
  DataTable,
  ReasonCodeBadge,
  SectionCard,
  StatusBadge,
} from '@/src/ui';

export const dynamic = 'force-dynamic';

const formatTimestamp = (value: string | null): string => {
  if (!value) {
    return 'n/a';
  }

  return new Intl.DateTimeFormat('en-NZ', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
};

export default async function CandidatesPage() {
  const runtime = await requireAuthenticatedConsoleContext();
  const candidates = getDashboardCandidateSnapshot(runtime);

  return (
    <ConsoleShell
      title="Candidate preview"
      subtitle="This page shows the decision engine output before any live dispatch occurs."
      activePath="/candidates"
      currentUser={runtime.authenticated.user.username}
      mode={runtime.config.mode}
      schedulerStatus={runtime.scheduler.getStatus()}
      actionTokens={runtime.csrfTokens}
    >
      {(['sonarr', 'radarr'] as const).map((app) => (
        <SectionCard
          key={app}
          title={app === 'sonarr' ? 'Sonarr candidates' : 'Radarr candidates'}
          subtitle={`Separate policy evaluation for ${app}.`}
        >
          <DataTable
            columns={[
              { key: 'title', label: 'Title' },
              { key: 'wantedState', label: 'Wanted state' },
              { key: 'decision', label: 'Decision' },
              { key: 'reason', label: 'Reason code' },
              { key: 'retryCount', label: 'Retries', align: 'right' },
              { key: 'nextEligibleAt', label: 'Next eligible' },
            ]}
            rows={candidates[app].map((candidate) => ({
              title: candidate.title,
              wantedState: candidate.wantedState,
              decision: (
                <StatusBadge
                  status={candidate.decision === 'dispatch' ? 'success' : 'degraded'}
                >
                  {candidate.decision}
                </StatusBadge>
              ),
              reason: <ReasonCodeBadge reasonCode={candidate.reasonCode} />,
              retryCount: candidate.retryCount,
              nextEligibleAt: formatTimestamp(candidate.nextEligibleAt),
            }))}
            emptyMessage={`No ${app} candidates are currently available.`}
          />
        </SectionCard>
      ))}
    </ConsoleShell>
  );
}
