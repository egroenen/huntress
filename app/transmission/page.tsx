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

export default async function TransmissionPage() {
  const runtime = await requireAuthenticatedConsoleContext();
  const recentTorrents =
    runtime.database.repositories.transmissionTorrentState.listRecent(50);

  return (
    <ConsoleShell
      title="Transmission guard"
      subtitle="Observe current torrent state and guard-triggered removals without leaving the console."
      activePath="/transmission"
      currentUser={runtime.authenticated.user.username}
      mode={runtime.config.mode}
      schedulerStatus={runtime.scheduler.getStatus()}
      actionTokens={runtime.csrfTokens}
    >
      <SectionCard
        title="Recent torrent observations"
        subtitle="Rows are ordered by latest removal or observation time."
      >
        <DataTable
          columns={[
            { key: 'name', label: 'Torrent' },
            { key: 'progress', label: 'Progress' },
            { key: 'linkedMediaKey', label: 'Linked media' },
            { key: 'lastSeenAt', label: 'Last seen' },
            { key: 'removedAt', label: 'Removed at' },
            { key: 'removalReason', label: 'Removal reason' },
          ]}
          rows={recentTorrents.map((torrent) => ({
            name: torrent.name,
            progress: `${Math.round(torrent.percentDone * 100)}%`,
            linkedMediaKey: torrent.linkedMediaKey ?? 'unlinked',
            lastSeenAt: formatTimestamp(torrent.lastSeenAt),
            removedAt: formatTimestamp(torrent.removedAt),
            removalReason: torrent.removalReason ? (
              <code className="reason-code">{torrent.removalReason}</code>
            ) : (
              <span className="console-muted">none</span>
            ),
          }))}
          emptyMessage="No Transmission torrent observations have been stored yet."
        />
      </SectionCard>
    </ConsoleShell>
  );
}
