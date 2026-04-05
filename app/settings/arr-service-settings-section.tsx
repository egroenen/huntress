import { testConnectionAction } from '@/src/server/actions';
import type {
  PersistedConnectionSettings,
  PersistedReleaseSelectionOverride,
} from '@/src/server/runtime-config';

type ArrServiceName = 'sonarr' | 'radarr';

const RESOLUTION_OPTIONS = [
  { value: '0', label: 'Any resolution' },
  { value: '480', label: '480p' },
  { value: '576', label: '576p' },
  { value: '720', label: '720p' },
  { value: '1080', label: '1080p' },
  { value: '1440', label: '1440p' },
  { value: '2160', label: '2160p / 4K' },
] as const;

const formatServiceHeading = (service: ArrServiceName): string =>
  service.charAt(0).toUpperCase() + service.slice(1);

const buildFieldName = (service: ArrServiceName, suffix: string): string =>
  `${service}${suffix}`;

interface ArrServiceSettingsSectionProps {
  service: ArrServiceName;
  connection: PersistedConnectionSettings['sonarr'];
  releaseSelection: PersistedReleaseSelectionOverride;
  showTestNotice: boolean;
  testStatus: string | undefined;
  testNotice: string | undefined;
  testDetail: string | undefined;
}

export const ArrServiceSettingsSection = ({
  service,
  connection,
  releaseSelection,
  showTestNotice,
  testStatus,
  testNotice,
  testDetail,
}: ArrServiceSettingsSectionProps) => {
  const label = formatServiceHeading(service);

  return (
    <section className="settings-form__section">
      <div className="settings-form__heading">
        <h4>{label}</h4>
        <button
          type="submit"
          formAction={testConnectionAction.bind(null, service)}
          className="console-button console-button--ghost"
        >
          Test connection
        </button>
      </div>
      <label>
        <span>URL</span>
        <input
          type="url"
          name={buildFieldName(service, 'Url')}
          defaultValue={connection.url ?? ''}
        />
      </label>
      <label>
        <span>API key</span>
        <input
          type="password"
          name={buildFieldName(service, 'ApiKey')}
          defaultValue={connection.apiKey ?? ''}
        />
      </label>
      <label className="settings-form__checkbox">
        <input
          type="checkbox"
          name={buildFieldName(service, 'FetchAllPages')}
          defaultChecked={connection.fetchAllWantedPages}
        />
        <span>Fetch all wanted pages on each sync</span>
      </label>
      <p className="settings-form__hint">
        Disable this to use incremental randomized page coverage instead of a
        full wanted-page walk.
      </p>
      {showTestNotice && testNotice ? (
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
            name={buildFieldName(service, 'ReleaseSelectionEnabled')}
            defaultChecked={releaseSelection.enabled}
          />
          <span>Enable release-aware grabbing before blind search</span>
        </label>
        <label>
          <span>Strategy</span>
          <select
            name={buildFieldName(service, 'ReleaseSelectionStrategy')}
            defaultValue={releaseSelection.strategy}
          >
            <option value="best_only">Best only</option>
            <option value="good_enough_now">Good enough now</option>
            <option value="fallback_then_upgrade">Fallback then upgrade</option>
          </select>
        </label>
        <label>
          <span>Preferred minimum resolution</span>
          <select
            name={buildFieldName(service, 'PreferredMinResolution')}
            defaultValue={String(releaseSelection.preferredMinResolution)}
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
            name={buildFieldName(service, 'FallbackMinResolution')}
            defaultValue={String(releaseSelection.fallbackMinResolution)}
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
            name={buildFieldName(service, 'MinimumSeeders')}
            defaultValue={releaseSelection.minimumSeeders}
          />
        </label>
        <label>
          <span>Minimum custom format score</span>
          <input
            type="number"
            step="1"
            name={buildFieldName(service, 'MinimumCustomFormatScore')}
            defaultValue={releaseSelection.minimumCustomFormatScore}
          />
        </label>
        <label className="settings-form__checkbox">
          <input
            type="checkbox"
            name={buildFieldName(service, 'RequireEnglish')}
            defaultChecked={releaseSelection.requireEnglish}
          />
          <span>Require English-language releases</span>
        </label>
        <label>
          <span>Upgrade retry after fallback (days)</span>
          <input
            type="number"
            min="1"
            step="1"
            name={buildFieldName(service, 'UpgradeRetryAfterFallbackDays')}
            defaultValue={Math.max(
              1,
              Math.ceil(releaseSelection.upgradeRetryAfterFallbackMs / 86_400_000)
            )}
          />
        </label>
      </div>
    </section>
  );
};
