import { getRedactedConfig, probeDependencyHealth } from '@/src/server/console-data';
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

export const dynamic = 'force-dynamic';

const statusTone = (configured: boolean) => (configured ? 'healthy' : 'degraded');

const RESOLUTION_OPTIONS = [
  { value: '0', label: 'Any resolution' },
  { value: '480', label: '480p' },
  { value: '576', label: '576p' },
  { value: '720', label: '720p' },
  { value: '1080', label: '1080p' },
  { value: '1440', label: '1440p' },
  { value: '2160', label: '2160p / 4K' },
] as const;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SettingsPage(props: { searchParams: SearchParams }) {
  const runtime = await requireAuthenticatedConsoleContext();
  const redactedConfig = await getRedactedConfig();
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

          <section className="settings-form__section">
            <div className="settings-form__heading">
              <h4>Sonarr</h4>
              <button
                type="submit"
                formAction={testConnectionAction.bind(null, 'sonarr')}
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
            <label className="settings-form__checkbox">
              <input
                type="checkbox"
                name="sonarrFetchAllPages"
                defaultChecked={connectionSettings.sonarr.fetchAllWantedPages}
              />
              <span>Fetch all wanted pages on each sync</span>
            </label>
            <p className="settings-form__hint">
              Disable this to use incremental randomized page coverage instead of a
              full wanted-page walk.
            </p>
            {testService === 'sonarr' && testNotice ? (
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
            <div className="settings-form__subsection">
              <h5>Release selection policy</h5>
              <label className="settings-form__checkbox">
                <input
                  type="checkbox"
                  name="sonarrReleaseSelectionEnabled"
                  defaultChecked={releaseSelectionOverrides.sonarr.enabled}
                />
                <span>Enable release-aware grabbing before blind search</span>
              </label>
              <label>
                <span>Strategy</span>
                <select
                  name="sonarrReleaseSelectionStrategy"
                  defaultValue={releaseSelectionOverrides.sonarr.strategy}
                >
                  <option value="best_only">Best only</option>
                  <option value="good_enough_now">Good enough now</option>
                  <option value="fallback_then_upgrade">Fallback then upgrade</option>
                </select>
              </label>
              <label>
                <span>Preferred minimum resolution</span>
                <select
                  name="sonarrPreferredMinResolution"
                  defaultValue={String(
                    releaseSelectionOverrides.sonarr.preferredMinResolution
                  )}
                >
                  {RESOLUTION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Fallback minimum resolution</span>
                <select
                  name="sonarrFallbackMinResolution"
                  defaultValue={String(
                    releaseSelectionOverrides.sonarr.fallbackMinResolution
                  )}
                >
                  {RESOLUTION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Minimum seeders</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  name="sonarrMinimumSeeders"
                  defaultValue={releaseSelectionOverrides.sonarr.minimumSeeders}
                />
              </label>
              <label>
                <span>Minimum custom format score</span>
                <input
                  type="number"
                  step="1"
                  name="sonarrMinimumCustomFormatScore"
                  defaultValue={
                    releaseSelectionOverrides.sonarr.minimumCustomFormatScore
                  }
                />
              </label>
              <label className="settings-form__checkbox">
                <input
                  type="checkbox"
                  name="sonarrRequireEnglish"
                  defaultChecked={releaseSelectionOverrides.sonarr.requireEnglish}
                />
                <span>Require English-language releases</span>
              </label>
              <label>
                <span>Upgrade retry after fallback (days)</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  name="sonarrUpgradeRetryAfterFallbackDays"
                  defaultValue={
                    Math.max(
                      1,
                      Math.ceil(
                        releaseSelectionOverrides.sonarr
                          .upgradeRetryAfterFallbackMs / 86_400_000
                      )
                    )
                  }
                />
              </label>
            </div>
          </section>

          <section className="settings-form__section">
            <div className="settings-form__heading">
              <h4>Radarr</h4>
              <button
                type="submit"
                formAction={testConnectionAction.bind(null, 'radarr')}
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
            <label className="settings-form__checkbox">
              <input
                type="checkbox"
                name="radarrFetchAllPages"
                defaultChecked={connectionSettings.radarr.fetchAllWantedPages}
              />
              <span>Fetch all wanted pages on each sync</span>
            </label>
            <p className="settings-form__hint">
              Disable this to use incremental randomized page coverage instead of a
              full wanted-page walk.
            </p>
            {testService === 'radarr' && testNotice ? (
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
            <div className="settings-form__subsection">
              <h5>Release selection policy</h5>
              <label className="settings-form__checkbox">
                <input
                  type="checkbox"
                  name="radarrReleaseSelectionEnabled"
                  defaultChecked={releaseSelectionOverrides.radarr.enabled}
                />
                <span>Enable release-aware grabbing before blind search</span>
              </label>
              <label>
                <span>Strategy</span>
                <select
                  name="radarrReleaseSelectionStrategy"
                  defaultValue={releaseSelectionOverrides.radarr.strategy}
                >
                  <option value="best_only">Best only</option>
                  <option value="good_enough_now">Good enough now</option>
                  <option value="fallback_then_upgrade">Fallback then upgrade</option>
                </select>
              </label>
              <label>
                <span>Preferred minimum resolution</span>
                <select
                  name="radarrPreferredMinResolution"
                  defaultValue={String(
                    releaseSelectionOverrides.radarr.preferredMinResolution
                  )}
                >
                  {RESOLUTION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Fallback minimum resolution</span>
                <select
                  name="radarrFallbackMinResolution"
                  defaultValue={String(
                    releaseSelectionOverrides.radarr.fallbackMinResolution
                  )}
                >
                  {RESOLUTION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Minimum seeders</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  name="radarrMinimumSeeders"
                  defaultValue={releaseSelectionOverrides.radarr.minimumSeeders}
                />
              </label>
              <label>
                <span>Minimum custom format score</span>
                <input
                  type="number"
                  step="1"
                  name="radarrMinimumCustomFormatScore"
                  defaultValue={
                    releaseSelectionOverrides.radarr.minimumCustomFormatScore
                  }
                />
              </label>
              <label className="settings-form__checkbox">
                <input
                  type="checkbox"
                  name="radarrRequireEnglish"
                  defaultChecked={releaseSelectionOverrides.radarr.requireEnglish}
                />
                <span>Require English-language releases</span>
              </label>
              <label>
                <span>Upgrade retry after fallback (days)</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  name="radarrUpgradeRetryAfterFallbackDays"
                  defaultValue={
                    Math.max(
                      1,
                      Math.ceil(
                        releaseSelectionOverrides.radarr
                          .upgradeRetryAfterFallbackMs / 86_400_000
                      )
                    )
                  }
                />
              </label>
            </div>
          </section>

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
        subtitle={`Loaded from ${redactedConfig.meta.configPath}. Session secret source: ${runtime.sessionSecretSource}.`}
      >
        <pre className="config-pre">{JSON.stringify(redactedConfig, null, 2)}</pre>
      </SectionCard>
    </ConsoleShell>
  );
}
