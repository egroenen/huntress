import { getRedactedConfig } from '@/src/server/console-data';
import { requireAuthenticatedConsoleContext } from '@/src/server/require-auth';
import { buildConnectionSettingsFromConfig } from '@/src/server/runtime-config';
import { ConsoleShell, SectionCard, StatusBadge } from '@/src/ui';

export const dynamic = 'force-dynamic';

const statusTone = (configured: boolean) => (configured ? 'healthy' : 'degraded');

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SettingsPage(props: { searchParams: SearchParams }) {
  const runtime = await requireAuthenticatedConsoleContext();
  const redactedConfig = await getRedactedConfig();
  const searchParams = await props.searchParams;
  const notice =
    typeof searchParams.notice === 'string' ? searchParams.notice : undefined;
  const noticeStatus =
    typeof searchParams.status === 'string' ? searchParams.status : undefined;
  const connectionSettings = buildConnectionSettingsFromConfig(runtime.config);

  return (
    <ConsoleShell
      title="Settings"
      subtitle="Configure connections, verify reachability, and review effective runtime settings."
      activePath="/settings"
      currentUser={runtime.authenticated.user.username}
      mode={runtime.config.mode}
      schedulerStatus={runtime.scheduler.getStatus()}
      actionTokens={runtime.csrfTokens}
    >
      <SectionCard
        title="Configuration status"
        subtitle="The app can boot before every dependency is configured. Live work stays blocked until the required services are ready."
      >
        <div className="settings-status-grid">
          {Object.values(runtime.connectionStatus).map((service) => (
            <article key={service.service} className="settings-status-card">
              <div className="settings-status-card__header">
                <h4>{service.service}</h4>
                <StatusBadge status={statusTone(service.configured)}>
                  {service.configured ? 'configured' : 'needs setup'}
                </StatusBadge>
              </div>
              <p>{service.summary}</p>
              <dl className="settings-status-card__meta">
                <div>
                  <dt>URL source</dt>
                  <dd>{service.urlSource}</dd>
                </div>
                <div>
                  <dt>Credential source</dt>
                  <dd>{service.secretSource}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Connections"
        subtitle="Saved values are persisted in the app. Environment variables still override them when present."
      >
        {notice ? (
          <p
            className={
              noticeStatus === 'success'
                ? 'settings-notice is-success'
                : 'settings-notice is-error'
            }
          >
            {notice}
          </p>
        ) : null}

        <form action="/api/settings/save" method="post" className="settings-form">
          <section className="settings-form__section">
            <div className="settings-form__heading">
              <h4>Sonarr</h4>
              <button
                type="submit"
                formAction="/api/settings/test/sonarr"
                name="csrfToken"
                value={runtime.csrfTokens.testSonarr}
                className="console-button console-button--ghost"
              >
                Test connection
              </button>
            </div>
            <label>
              <span>URL</span>
              <input
                type="url"
                name="sonarrUrl"
                defaultValue={connectionSettings.sonarr.url ?? ''}
              />
            </label>
            <label>
              <span>API key</span>
              <input
                type="password"
                name="sonarrApiKey"
                defaultValue={connectionSettings.sonarr.apiKey ?? ''}
              />
            </label>
          </section>

          <section className="settings-form__section">
            <div className="settings-form__heading">
              <h4>Radarr</h4>
              <button
                type="submit"
                formAction="/api/settings/test/radarr"
                name="csrfToken"
                value={runtime.csrfTokens.testRadarr}
                className="console-button console-button--ghost"
              >
                Test connection
              </button>
            </div>
            <label>
              <span>URL</span>
              <input
                type="url"
                name="radarrUrl"
                defaultValue={connectionSettings.radarr.url ?? ''}
              />
            </label>
            <label>
              <span>API key</span>
              <input
                type="password"
                name="radarrApiKey"
                defaultValue={connectionSettings.radarr.apiKey ?? ''}
              />
            </label>
          </section>

          <section className="settings-form__section">
            <div className="settings-form__heading">
              <h4>Prowlarr</h4>
              <button
                type="submit"
                formAction="/api/settings/test/prowlarr"
                name="csrfToken"
                value={runtime.csrfTokens.testProwlarr}
                className="console-button console-button--ghost"
              >
                Test connection
              </button>
            </div>
            <label>
              <span>URL</span>
              <input
                type="url"
                name="prowlarrUrl"
                defaultValue={connectionSettings.prowlarr.url ?? ''}
              />
            </label>
            <label>
              <span>API key</span>
              <input
                type="password"
                name="prowlarrApiKey"
                defaultValue={connectionSettings.prowlarr.apiKey ?? ''}
              />
            </label>
          </section>

          <section className="settings-form__section">
            <div className="settings-form__heading">
              <h4>Transmission</h4>
              <button
                type="submit"
                formAction="/api/settings/test/transmission"
                name="csrfToken"
                value={runtime.csrfTokens.testTransmission}
                className="console-button console-button--ghost"
              >
                Test connection
              </button>
            </div>
            <label>
              <span>URL</span>
              <input
                type="url"
                name="transmissionUrl"
                defaultValue={connectionSettings.transmission.url ?? ''}
              />
            </label>
            <label>
              <span>Username</span>
              <input
                type="text"
                name="transmissionUsername"
                defaultValue={connectionSettings.transmission.username ?? ''}
              />
            </label>
            <label>
              <span>Password</span>
              <input
                type="password"
                name="transmissionPassword"
                defaultValue={connectionSettings.transmission.password ?? ''}
              />
            </label>
          </section>

          <div className="settings-form__actions">
            <button
              type="submit"
              className="console-button"
              name="csrfToken"
              value={runtime.csrfTokens.saveSettings}
            >
              Save connection settings
            </button>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="Effective configuration"
        subtitle={`Loaded from ${redactedConfig.meta.configPath}. Session secret source: ${runtime.sessionSecretSource}.`}
      >
        <pre className="config-pre">{JSON.stringify(redactedConfig, null, 2)}</pre>
      </SectionCard>
    </ConsoleShell>
  );
}
