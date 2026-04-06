import { probeDependencyHealth } from '@/src/server/console-data';
import { saveSettingsAction, testConnectionAction } from '@/src/server/actions';
import { requireAuthenticatedConsoleContext } from '@/src/server/require-auth';
import {
  buildConnectionSettingsFromConfig,
  buildReleaseSelectionOverridesFromConfig,
  buildSchedulerOverridesFromConfig,
  buildSearchSafetyOverridesFromConfig,
} from '@/src/server/runtime-config';
import {
  ConsoleHeaderActions,
  ConsoleShell,
  SectionCard,
  StatusBadge,
} from '@/src/ui';
import { formatConfigSourceLabel, formatServiceName } from '@/src/ui/formatters';

import { ArrServiceSettingsSection } from './arr-service-settings-section';

export const dynamic = 'force-dynamic';

const statusTone = (configured: boolean) => (configured ? 'healthy' : 'degraded');

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SettingsPage(props: { searchParams: SearchParams }) {
  const runtime = await requireAuthenticatedConsoleContext();
  const dependencyCards = await probeDependencyHealth(runtime);
  const searchParams = await props.searchParams;
  const notice =
    typeof searchParams.notice === 'string' ? searchParams.notice : undefined;
  const noticeStatus =
    typeof searchParams.status === 'string' ? searchParams.status : undefined;
  const testService =
    typeof searchParams.testService === 'string' ? searchParams.testService : undefined;
  const testStatus =
    typeof searchParams.testStatus === 'string' ? searchParams.testStatus : undefined;
  const testNotice =
    typeof searchParams.testNotice === 'string' ? searchParams.testNotice : undefined;
  const testDetail =
    typeof searchParams.testDetail === 'string' ? searchParams.testDetail : undefined;
  const connectionSettings = buildConnectionSettingsFromConfig(runtime.config);
  const searchSafetyOverrides = buildSearchSafetyOverridesFromConfig(
    runtime.config,
    runtime.database
  );
  const schedulerOverrides = buildSchedulerOverridesFromConfig(
    runtime.config,
    runtime.database
  );
  const releaseSelectionOverrides = buildReleaseSelectionOverridesFromConfig(
    runtime.config,
    runtime.database
  );

  return (
    <ConsoleShell
      title="Settings"
      subtitle="Configure connections, verify reachability, and review effective runtime settings."
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
        title="Configuration status"
        subtitle="The app can boot before every dependency is configured. Live work stays blocked until the required services are ready."
      >
        <div className="settings-status-grid">
          {Object.values(runtime.connectionStatus).map((service) => (
            <article key={service.service} className="settings-status-card">
              <div className="settings-status-card__header">
                <h4>{formatServiceName(service.service)}</h4>
                <StatusBadge status={statusTone(service.configured)}>
                  {service.configured ? 'configured' : 'needs setup'}
                </StatusBadge>
              </div>
              <p>{service.summary}</p>
              <dl className="settings-status-card__meta">
                <div>
                  <dt>URL source</dt>
                  <dd>{formatConfigSourceLabel(service.urlSource)}</dd>
                </div>
                <div>
                  <dt>Credential source</dt>
                  <dd>{formatConfigSourceLabel(service.secretSource)}</dd>
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

        <form action={saveSettingsAction} className="settings-form">
          <input
            type="hidden"
            name="saveSettingsCsrfToken"
            value={runtime.csrfTokens.saveSettings}
          />
          <input
            type="hidden"
            name="testSonarrCsrfToken"
            value={runtime.csrfTokens.testSonarr}
          />
          <input
            type="hidden"
            name="testRadarrCsrfToken"
            value={runtime.csrfTokens.testRadarr}
          />
          <input
            type="hidden"
            name="testProwlarrCsrfToken"
            value={runtime.csrfTokens.testProwlarr}
          />
          <input
            type="hidden"
            name="testTransmissionCsrfToken"
            value={runtime.csrfTokens.testTransmission}
          />

          <ArrServiceSettingsSection
            service="sonarr"
            connection={connectionSettings.sonarr}
            releaseSelection={releaseSelectionOverrides.sonarr}
            showTestNotice={testService === 'sonarr'}
            testStatus={testStatus}
            testNotice={testNotice}
            testDetail={testDetail}
          />

          <ArrServiceSettingsSection
            service="radarr"
            connection={connectionSettings.radarr}
            releaseSelection={releaseSelectionOverrides.radarr}
            showTestNotice={testService === 'radarr'}
            testStatus={testStatus}
            testNotice={testNotice}
            testDetail={testDetail}
          />

          <section className="settings-form__section">
            <div className="settings-form__heading">
              <h4>Prowlarr</h4>
              <button
                type="submit"
                formAction={testConnectionAction.bind(null, 'prowlarr')}
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
            {testService === 'prowlarr' && testNotice ? (
              <p
                className={
                  testStatus === 'success'
                    ? 'settings-notice is-success'
                    : 'settings-notice is-error'
                }
              >
                {testNotice}
                {testDetail ? ` ${testDetail}` : ''}
              </p>
            ) : null}
          </section>

          <section className="settings-form__section">
            <div className="settings-form__heading">
              <h4>Transmission</h4>
              <button
                type="submit"
                formAction={testConnectionAction.bind(null, 'transmission')}
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
                placeholder="Optional"
              />
            </label>
            <label>
              <span>Password</span>
              <input
                type="password"
                name="transmissionPassword"
                defaultValue={connectionSettings.transmission.password ?? ''}
                placeholder="Optional"
              />
            </label>
            {testService === 'transmission' && testNotice ? (
              <p
                className={
                  testStatus === 'success'
                    ? 'settings-notice is-success'
                    : 'settings-notice is-error'
                }
              >
                {testNotice}
                {testDetail ? ` ${testDetail}` : ''}
              </p>
            ) : null}
          </section>

          <section className="settings-form__section">
            <div className="settings-form__heading">
              <h4>Scheduler</h4>
            </div>
            <label>
              <span>Scheduler interval (minutes)</span>
              <input
                type="number"
                min="5"
                max="120"
                step="1"
                name="schedulerIntervalMinutes"
                defaultValue={schedulerOverrides.cycleEveryMinutes ?? 30}
              />
            </label>
            <p className="settings-form__hint">
              Applies to the running scheduler immediately after saving.
            </p>
          </section>

          <section className="settings-form__section">
            <div className="settings-form__heading">
              <h4>Dispatch safety budgets</h4>
            </div>
            <p className="settings-form__hint">
              Override the rolling live-dispatch budgets used to protect trackers.
              Leave a field blank to fall back to the config file default.
            </p>
            <label>
              <span>15 minute limit</span>
              <input
                type="number"
                min="1"
                step="1"
                name="rollingLimit15m"
                defaultValue={searchSafetyOverrides.rollingSearchLimits.per15m ?? ''}
              />
            </label>
            <label>
              <span>1 hour limit</span>
              <input
                type="number"
                min="1"
                step="1"
                name="rollingLimit1h"
                defaultValue={searchSafetyOverrides.rollingSearchLimits.per1h ?? ''}
              />
            </label>
            <label>
              <span>24 hour limit</span>
              <input
                type="number"
                min="1"
                step="1"
                name="rollingLimit24h"
                defaultValue={searchSafetyOverrides.rollingSearchLimits.per24h ?? ''}
              />
            </label>
          </section>

          <div className="settings-form__actions">
            <button
              type="submit"
              className="console-button"
            >
              Save settings
            </button>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="Effective configuration"
        subtitle={`Loaded from ${runtime.redactedConfig.meta.configPath}. Session secret source: ${runtime.sessionSecretSource}.`}
      >
        <div className="settings-config-summary">
          <p className="settings-form__hint">
            The full redacted runtime config is available on a separate page so the
            main Settings screen stays responsive.
          </p>
          <a href="/settings/config" className="console-link">
            Open effective configuration
          </a>
        </div>
      </SectionCard>
    </ConsoleShell>
  );
}
