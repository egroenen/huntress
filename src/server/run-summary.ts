import type { RunHistoryRecord } from '@/src/db';

export interface AppSyncSummary {
  app: 'sonarr' | 'radarr';
  status: 'synced' | 'not_configured';
  syncedAt: string;
  missingCount: number;
  missingPagesFetched: number;
  missingTotalPages: number;
  cutoffCount: number;
  cutoffPagesFetched: number;
  cutoffTotalPages: number;
  queueCount: number;
  upsertedCount: number;
  ignoredCount: number;
}

export interface ArrStateSyncSummary {
  syncedAt: string;
  sonarr: AppSyncSummary;
  radarr: AppSyncSummary;
}

export interface TransmissionSummary {
  observedCount: number;
  removedCount: number;
  suppressionCount: number;
  linkedCount: number;
}

export interface ReleaseSelectionRecord {
  mediaKey: string;
  title: string;
  app: string;
  mode: string;
  reason: string;
  selectedReleaseTitle: string | null;
  selectedReleaseQuality: string | null;
  selectedReleaseResolution: number | null;
  selectedReleaseIndexer: string | null;
  selectedReleaseGuid: string | null;
  upgradePriority: boolean;
}

export interface DispatchSummary {
  dryRun: boolean;
  dryRunDispatchPreviewCount: number;
  throttleReason: string | null;
  attemptsPersisted: number;
  releaseSelectionSummary?: {
    directGrabCount: number;
    blindSearchCount: number;
    fallbackUpgradeCount: number;
    goodEnoughCount: number;
    preferredReleaseCount: number;
    selections: ReleaseSelectionRecord[];
  };
}

export interface RunSummaryShape {
  syncSummary?: ArrStateSyncSummary;
  transmissionSummary?: TransmissionSummary;
  dispatchSummary?: DispatchSummary;
  requestedRunType?: string;
  liveDispatchAllowed?: boolean;
  manualFetch?: boolean;
  mediaKey?: string;
  title?: string;
  app?: string;
  manualOverride?: boolean;
  arrCommandId?: number | null;
  dispatchKind?: string;
  releaseSelection?: {
    mode?: string;
    selectedReleaseTitle?: string | null;
    selectedReleaseQuality?: string | null;
    upgradePriority?: boolean;
  };
  error?: {
    name?: string;
    message?: string;
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const toRunSummaryShape = (
  summary: RunHistoryRecord['summary'] | Record<string, unknown> | undefined
): RunSummaryShape => {
  return isRecord(summary) ? (summary as RunSummaryShape) : {};
};

export const getAppSyncRows = (summary: RunSummaryShape): AppSyncSummary[] => {
  if (!summary.syncSummary) {
    return [];
  }

  return [summary.syncSummary.sonarr, summary.syncSummary.radarr];
};

export const formatRunTimestamp = (value: string | null): string => {
  if (!value) {
    return 'n/a';
  }

  return new Intl.DateTimeFormat('en-NZ', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
};

export const formatRunDuration = (
  startedAt: string,
  finishedAt: string | null
): string => {
  const started = new Date(startedAt).getTime();
  const finished = finishedAt ? new Date(finishedAt).getTime() : null;

  if (!Number.isFinite(started)) {
    return 'n/a';
  }

  if (finished === null || !Number.isFinite(finished)) {
    return 'In progress';
  }

  const durationMs = Math.max(finished - started, 0);
  const totalSeconds = Math.round(durationMs / 1000);

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes < 60) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
};
