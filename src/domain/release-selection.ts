import type { ResolvedConfig } from '@/src/config';
import type { DatabaseContext, MediaItemStateRecord } from '@/src/db';
import type {
  ArrReleaseRecord,
  RadarrApiClient,
  SonarrApiClient,
} from '@/src/integrations';

type ReleaseSelectionConfig = NonNullable<
  ResolvedConfig['policies']['sonarr']['releaseSelection']
>;

export type ReleaseSelectionApp = 'sonarr' | 'radarr';
export type ReleaseSelectionMode =
  | 'blind_search'
  | 'preferred_release'
  | 'good_enough_release'
  | 'fallback_then_upgrade';

export interface PlannedReleaseSelection {
  mode: ReleaseSelectionMode;
  reason: string;
  selectedRelease: ArrReleaseRecord | null;
  availableReleaseCount: number;
  eligibleReleaseCount: number;
  filteredSuppressedCount: number;
  filteredUnsafeCount: number;
  filteredFloorCount: number;
  upgradePriority: boolean;
}

export interface ReleaseSelectionClients {
  sonarr: SonarrApiClient | null;
  radarr: RadarrApiClient | null;
}

const normalizeFingerprint = (value: string): string => {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const hasDangerousExecutableExtension = (title: string): boolean => {
  return /\.(exe|scr|bat|cmd|com|msi)(\b|$)/i.test(title);
};

const hasEnglishLanguage = (release: ArrReleaseRecord): boolean => {
  if (release.languages.length === 0) {
    return false;
  }

  return release.languages.some((language: string) => language.toLowerCase() === 'english');
};

const BLOCKING_ARR_REJECTION_PATTERNS: RegExp[] = [
  /blocklist/i,
  /not wanted in profile/i,
  /quality profile does not allow upgrades/i,
  /existing file meets cutoff/i,
  /not an upgrade/i,
  /wasn't requested/i,
  /wrong episode/i,
  /wrong movie/i,
];

const getBlockingArrRejections = (release: ArrReleaseRecord): string[] => {
  if (!release.rejected || release.rejections.length === 0) {
    return [];
  }

  return release.rejections.filter((rejection) =>
    BLOCKING_ARR_REJECTION_PATTERNS.some((pattern) => pattern.test(rejection))
  );
};

const meetsBaseEligibility = (
  release: ArrReleaseRecord,
  policy: ReleaseSelectionConfig
): boolean => {
  if (!release.downloadAllowed) {
    return false;
  }

  if (hasDangerousExecutableExtension(release.title)) {
    return false;
  }

  if ((release.seeders ?? 0) < policy.minimumSeeders) {
    return false;
  }

  if ((release.customFormatScore ?? 0) < policy.minimumCustomFormatScore) {
    return false;
  }

  if (policy.requireEnglish && !hasEnglishLanguage(release)) {
    return false;
  }

  return true;
};

const meetsResolutionFloor = (
  release: ArrReleaseRecord,
  minimumResolution: number
): boolean => {
  if (minimumResolution <= 0) {
    return true;
  }

  return (release.qualityResolution ?? 0) >= minimumResolution;
};

const compareReleaseCandidates = (left: ArrReleaseRecord, right: ArrReleaseRecord): number => {
  const leftCustomScore = left.customFormatScore ?? 0;
  const rightCustomScore = right.customFormatScore ?? 0;

  if (leftCustomScore !== rightCustomScore) {
    return rightCustomScore - leftCustomScore;
  }

  const leftResolution = left.qualityResolution ?? 0;
  const rightResolution = right.qualityResolution ?? 0;

  if (leftResolution !== rightResolution) {
    return rightResolution - leftResolution;
  }

  const leftQualityWeight = left.qualityWeight ?? 0;
  const rightQualityWeight = right.qualityWeight ?? 0;

  if (leftQualityWeight !== rightQualityWeight) {
    return rightQualityWeight - leftQualityWeight;
  }

  const leftSeeders = left.seeders ?? 0;
  const rightSeeders = right.seeders ?? 0;

  if (leftSeeders !== rightSeeders) {
    return rightSeeders - leftSeeders;
  }

  const leftAgeHours = left.ageHours ?? Number.MAX_SAFE_INTEGER;
  const rightAgeHours = right.ageHours ?? Number.MAX_SAFE_INTEGER;

  if (leftAgeHours !== rightAgeHours) {
    return leftAgeHours - rightAgeHours;
  }

  return left.title.localeCompare(right.title);
};

const selectBestRelease = (releases: ArrReleaseRecord[]): ArrReleaseRecord | null => {
  if (releases.length === 0) {
    return null;
  }

  return [...releases].sort(compareReleaseCandidates)[0] ?? null;
};

const getActiveSuppressedFingerprints = (
  database: DatabaseContext,
  mediaKey: string,
  nowIso: string
) => {
  const suppressions = database.repositories.releaseSuppressions
    .listActive(nowIso)
    .filter((suppression) => suppression.mediaKey === mediaKey);

  return {
    title: new Set(
      suppressions
        .filter((suppression) => suppression.fingerprintType === 'release_title')
        .map((suppression) => normalizeFingerprint(suppression.fingerprintValue))
    ),
    hash: new Set(
      suppressions
        .filter((suppression) => suppression.fingerprintType === 'torrent_hash')
        .map((suppression) => suppression.fingerprintValue.trim().toLowerCase())
    ),
    guid: new Set(
      suppressions
        .filter((suppression) => suppression.fingerprintType === 'guid')
        .map((suppression) => suppression.fingerprintValue.trim())
    ),
  };
};

const isSuppressedRelease = (
  release: ArrReleaseRecord,
  suppressedFingerprints: ReturnType<typeof getActiveSuppressedFingerprints>
): boolean => {
  const normalizedTitle = normalizeFingerprint(release.title);
  const normalizedHash = release.infoHash?.trim().toLowerCase() ?? null;

  return (
    suppressedFingerprints.title.has(normalizedTitle) ||
    (normalizedHash ? suppressedFingerprints.hash.has(normalizedHash) : false) ||
    suppressedFingerprints.guid.has(release.guidUrl)
  );
};

const listAppReleases = async (
  clients: ReleaseSelectionClients,
  app: ReleaseSelectionApp,
  arrId: number
): Promise<ArrReleaseRecord[]> => {
  if (app === 'sonarr') {
    if (!clients.sonarr) {
      return [];
    }

    return clients.sonarr.listEpisodeReleases(arrId);
  }

  if (!clients.radarr) {
    return [];
  }

  return clients.radarr.listMovieReleases(arrId);
};

const getReleaseSelectionPolicy = (
  config: ResolvedConfig,
  app: ReleaseSelectionApp
): ReleaseSelectionConfig | null => {
  return config.policies[app].releaseSelection ?? null;
};

export const planReleaseSelection = async (input: {
  database: DatabaseContext;
  config: ResolvedConfig;
  clients: ReleaseSelectionClients;
  item: MediaItemStateRecord;
  app: ReleaseSelectionApp;
  now: Date;
}): Promise<PlannedReleaseSelection> => {
  const policy = getReleaseSelectionPolicy(input.config, input.app);

  if (!policy?.enabled) {
    return {
      mode: 'blind_search',
      reason: 'Release selection is disabled for this app.',
      selectedRelease: null,
      availableReleaseCount: 0,
      eligibleReleaseCount: 0,
      filteredSuppressedCount: 0,
      filteredUnsafeCount: 0,
      filteredFloorCount: 0,
      upgradePriority: false,
    };
  }

  const releases = await listAppReleases(input.clients, input.app, input.item.arrId);
  const suppressedFingerprints = getActiveSuppressedFingerprints(
    input.database,
    input.item.mediaKey,
    input.now.toISOString()
  );

  let filteredSuppressedCount = 0;
  let filteredUnsafeCount = 0;
  let filteredByArrCount = 0;
  const eligibleReleases = releases.filter((release) => {
    if (isSuppressedRelease(release, suppressedFingerprints)) {
      filteredSuppressedCount += 1;
      return false;
    }

    if (hasDangerousExecutableExtension(release.title)) {
      filteredUnsafeCount += 1;
      return false;
    }

    if (getBlockingArrRejections(release).length > 0) {
      filteredByArrCount += 1;
      return false;
    }

    return meetsBaseEligibility(release, policy);
  });

  const preferredReleases = eligibleReleases.filter((release) =>
    meetsResolutionFloor(release, policy.preferredMinResolution)
  );
  const fallbackReleases = eligibleReleases.filter((release) =>
    meetsResolutionFloor(release, policy.fallbackMinResolution)
  );
  const filteredFloorCount = eligibleReleases.length - fallbackReleases.length;

  const preferredRelease = selectBestRelease(preferredReleases);
  if (preferredRelease) {
    return {
      mode: 'preferred_release',
      reason: `Selected preferred release at ${preferredRelease.qualityResolution ?? 0}p after Arr profile checks.`,
      selectedRelease: preferredRelease,
      availableReleaseCount: releases.length,
      eligibleReleaseCount: eligibleReleases.length,
      filteredSuppressedCount,
      filteredUnsafeCount,
      filteredFloorCount,
      upgradePriority: false,
    };
  }

  const fallbackRelease = selectBestRelease(fallbackReleases);

  if (!fallbackRelease) {
    return {
      mode: 'blind_search',
      reason:
        filteredByArrCount > 0
          ? `No release candidate survived Arr rejection filters (${filteredByArrCount} blocked).`
          : 'No release candidate met the configured fallback floor.',
      selectedRelease: null,
      availableReleaseCount: releases.length,
      eligibleReleaseCount: eligibleReleases.length,
      filteredSuppressedCount,
      filteredUnsafeCount,
      filteredFloorCount,
      upgradePriority: false,
    };
  }

  if (policy.strategy === 'best_only') {
    return {
      mode: 'blind_search',
      reason:
        filteredByArrCount > 0
          ? 'No preferred release passed both policy and Arr profile filters, so the dispatcher fell back to Arr search.'
          : 'No preferred release met the policy, so the dispatcher fell back to Arr search.',
      selectedRelease: null,
      availableReleaseCount: releases.length,
      eligibleReleaseCount: eligibleReleases.length,
      filteredSuppressedCount,
      filteredUnsafeCount,
      filteredFloorCount,
      upgradePriority: false,
    };
  }

  if (policy.strategy === 'good_enough_now') {
    return {
      mode: 'good_enough_release',
      reason: `Selected a good-enough release at ${fallbackRelease.qualityResolution ?? 0}p after Arr profile checks.`,
      selectedRelease: fallbackRelease,
      availableReleaseCount: releases.length,
      eligibleReleaseCount: eligibleReleases.length,
      filteredSuppressedCount,
      filteredUnsafeCount,
      filteredFloorCount,
      upgradePriority: false,
    };
  }

  return {
    mode: 'fallback_then_upgrade',
    reason: `Selected a fallback release at ${fallbackRelease.qualityResolution ?? 0}p after Arr profile checks and marked it for aggressive upgrade retry.`,
    selectedRelease: fallbackRelease,
    availableReleaseCount: releases.length,
    eligibleReleaseCount: eligibleReleases.length,
    filteredSuppressedCount,
    filteredUnsafeCount,
    filteredFloorCount,
    upgradePriority: true,
  };
};
