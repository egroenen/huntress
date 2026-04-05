import type { SchedulerCoordinatorStatus } from '@/src/scheduler';
import {
  logoutAction,
  recoverRunAction,
  runDryAction,
  runLiveAction,
  runSyncAction,
} from '@/src/server/actions';
import { formatRunTypeLabel } from '@/src/ui/formatters';

import { StatusBadge } from './status-badge';

export interface ConsoleActionTokens {
  logout: string;
  runSync: string;
  runDry: string;
  runLive: string;
  recoverRun: string;
}

export const ConsoleHeaderActions = ({
  mode,
  schedulerStatus,
  actionTokens,
}: {
  mode: 'dry-run' | 'live';
  schedulerStatus: SchedulerCoordinatorStatus;
  actionTokens: ConsoleActionTokens;
}) => {
  return (
    <div className="console-header__meta">
      <div className="header-status-stack">
        <StatusBadge
          status={mode === 'live' ? 'success' : 'degraded'}
          title={
            mode === 'live'
              ? 'Live dispatch is enabled. Manual and scheduled live cycles can send real searches to Sonarr and Radarr, subject to safety rules.'
              : 'Dry-run mode is enabled. The system will evaluate and record decisions, but it will not send real searches.'
          }
          ariaLabel={mode === 'live' ? 'Live dispatch enabled' : 'Dry-run mode enabled'}
        >
          {mode === 'live' ? 'live dispatch' : 'dry-run mode'}
        </StatusBadge>
        {schedulerStatus.startupGraceActive ? (
          <StatusBadge
            status="info"
            title="Startup grace is active. Automatic live dispatch is temporarily paused while the service settles after startup."
            ariaLabel="Startup grace active"
          >
            startup grace active
          </StatusBadge>
        ) : null}
        {schedulerStatus.activeRun ? (
          <StatusBadge
            status="running"
            title={`A ${formatRunTypeLabel(schedulerStatus.activeRun.runType)} is currently active. Open Status to watch detailed progress or use Recover run if it is stuck.`}
            ariaLabel={`${formatRunTypeLabel(schedulerStatus.activeRun.runType)} run active`}
          >
            {formatRunTypeLabel(schedulerStatus.activeRun.runType)} running
          </StatusBadge>
        ) : null}
      </div>

      <div className="console-actions">
        {schedulerStatus.activeRun ? (
          <form action={recoverRunAction}>
            <input type="hidden" name="csrfToken" value={actionTokens.recoverRun} />
            <button
              type="submit"
              className="console-button console-button--ghost"
              title="Force clear the currently active run if it is stuck, release the scheduler lock, and mark it as failed."
              aria-label="Recover run: force clear the active run, release the scheduler lock, and mark it failed"
            >
              Recover run
            </button>
          </form>
        ) : null}
        <form action={runSyncAction}>
          <input type="hidden" name="csrfToken" value={actionTokens.runSync} />
          <button
            type="submit"
            className="console-button console-button--ghost"
            title="Refresh Sonarr, Radarr, and Transmission state without dispatching any searches."
            aria-label="Run sync: refresh Sonarr, Radarr, and Transmission state without dispatching searches"
          >
            Run sync
          </button>
        </form>
        <form action={runDryAction}>
          <input type="hidden" name="csrfToken" value={actionTokens.runDry} />
          <button
            type="submit"
            className="console-button console-button--ghost"
            title="Evaluate what would be searched right now and record the decisions, but do not send real searches to Sonarr or Radarr."
            aria-label="Dry cycle: preview and record search decisions without sending searches"
          >
            Dry cycle
          </button>
        </form>
        <form action={runLiveAction}>
          <input type="hidden" name="csrfToken" value={actionTokens.runLive} />
          <button
            type="submit"
            className="console-button"
            title="Run a full cycle and allow live search dispatches, subject to cooldowns, budgets, and safety checks."
            aria-label="Live cycle: run a full cycle and allow live search dispatches"
          >
            Live cycle
          </button>
        </form>
        <form action={logoutAction}>
          <input type="hidden" name="csrfToken" value={actionTokens.logout} />
          <button
            type="submit"
            className="console-button console-button--ghost"
            title="Sign out of the operator console."
            aria-label="Sign out of the operator console"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
};
