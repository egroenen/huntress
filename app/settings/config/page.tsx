import { requireAuthenticatedConsoleContext } from '@/src/server/require-auth';
import {
  ConsoleHeaderActions,
  ConsoleShell,
  SectionCard,
} from '@/src/ui';
import { probeDependencyHealth } from '@/src/server/console-data';

export const dynamic = 'force-dynamic';

export default async function SettingsConfigPage() {
  const runtime = await requireAuthenticatedConsoleContext();
  const dependencyCards = await probeDependencyHealth(runtime);

  return (
    <ConsoleShell
      title="Effective configuration"
      subtitle="Full redacted runtime configuration."
      activePath="/settings"
      currentUser={runtime.authenticated.user.username}
      mode={runtime.config.mode}
      schedulerStatus={runtime.scheduler.getStatus()}
      dependencyCards={dependencyCards}
      headerActions={
        <ConsoleHeaderActions
          mode={runtime.config.mode}
          schedulerStatus={runtime.scheduler.getStatus()}
          actionTokens={runtime.csrfTokens}
        />
      }
    >
      <SectionCard
        title="Redacted config"
        subtitle={`Loaded from ${runtime.redactedConfig.meta.configPath}. Session secret source: ${runtime.sessionSecretSource}.`}
        actions={
          <a href="/settings" className="console-link">
            Back to settings
          </a>
        }
      >
        <pre className="config-pre">{JSON.stringify(runtime.redactedConfig, null, 2)}</pre>
      </SectionCard>
    </ConsoleShell>
  );
}
