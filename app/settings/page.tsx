import { getRedactedConfig } from '@/src/server/console-data';
import { requireAuthenticatedConsoleContext } from '@/src/server/require-auth';
import { ConsoleShell, SectionCard } from '@/src/ui';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const runtime = await requireAuthenticatedConsoleContext();
  const redactedConfig = await getRedactedConfig();

  return (
    <ConsoleShell
      title="Settings"
      subtitle="Effective loaded configuration with secrets redacted."
      activePath="/settings"
      currentUser={runtime.authenticated.user.username}
      mode={runtime.config.mode}
      schedulerStatus={runtime.scheduler.getStatus()}
      actionTokens={runtime.csrfTokens}
    >
      <SectionCard
        title="Effective configuration"
        subtitle={`Loaded from ${redactedConfig.meta.configPath}`}
      >
        <pre className="config-pre">{JSON.stringify(redactedConfig, null, 2)}</pre>
      </SectionCard>
    </ConsoleShell>
  );
}
