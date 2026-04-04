import { createCsrfToken } from '@/src/auth';
import { requireAuthenticatedConsoleContext } from '@/src/server/require-auth';
import { ConsoleShell, DataTable, SectionCard } from '@/src/ui';

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

export default async function SuppressionsPage() {
  const runtime = await requireAuthenticatedConsoleContext();
  const suppressions = runtime.database.repositories.releaseSuppressions.listActive(
    new Date().toISOString()
  );

  return (
    <ConsoleShell
      title="Suppressions"
      subtitle="Active release suppressions created by Transmission guard actions or future policy layers."
      activePath="/suppressions"
      currentUser={runtime.authenticated.user.username}
      mode={runtime.config.mode}
      schedulerStatus={runtime.scheduler.getStatus()}
      actionTokens={runtime.csrfTokens}
    >
      <SectionCard
        title="Active suppressions"
        subtitle="These blocks expire automatically unless cleared early."
      >
        <DataTable
          columns={[
            { key: 'mediaKey', label: 'Media key' },
            { key: 'fingerprintType', label: 'Fingerprint' },
            { key: 'reason', label: 'Reason' },
            { key: 'expiresAt', label: 'Expires' },
            { key: 'action', label: 'Action', align: 'right' },
          ]}
          rows={suppressions.map((suppression) => ({
            mediaKey: suppression.mediaKey,
            fingerprintType: `${suppression.fingerprintType}: ${suppression.fingerprintValue}`,
            reason: suppression.reason,
            expiresAt: formatTimestamp(suppression.expiresAt),
            action: suppression.id ? (
              <form
                action={`/api/suppressions/${suppression.id}/clear`}
                method="post"
                className="table-inline-form"
              >
                <input
                  type="hidden"
                  name="csrfToken"
                  value={createCsrfToken(
                    `action:clear-suppression:${suppression.id}:${runtime.authenticated.sessionId}`,
                    runtime.config.auth.sessionSecret
                  )}
                />
                <button type="submit" className="table-inline-button">
                  Clear
                </button>
              </form>
            ) : null,
          }))}
          emptyMessage="No active suppressions are currently recorded."
        />
      </SectionCard>
    </ConsoleShell>
  );
}
