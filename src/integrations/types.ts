export type DependencyHealth = 'healthy' | 'degraded' | 'unavailable';

export interface ArrSystemStatus {
  appName: string;
  version: string;
  instanceName: string | null;
  isDebug: boolean | null;
  isProduction: boolean | null;
  startupPath: string | null;
  urlBase: string | null;
}

export interface ArrWantedRecord {
  itemType: 'episode' | 'movie';
  itemId: number;
  parentId: number | null;
  externalPath: string | null;
  title: string;
  monitored: boolean;
  hasFile: boolean | null;
  qualityCutoffNotMet: boolean | null;
  releaseDate: string | null;
  payload: unknown;
}

export interface ArrWantedPageResult {
  page: number;
  pageSize: number;
  totalPages: number;
  totalRecords: number;
  records: ArrWantedRecord[];
}

export interface ArrCommandResponse {
  id: number | null;
  name: string | null;
  status: string | null;
}

export interface ArrReleaseRecord {
  guid: string;
  indexerId: number;
  indexer: string | null;
  title: string;
  downloadAllowed: boolean;
  approved: boolean;
  rejected: boolean;
  rejections: string[];
  protocol: string | null;
  qualityName: string | null;
  qualityResolution: number | null;
  qualityWeight: number | null;
  customFormatScore: number;
  size: number | null;
  ageHours: number | null;
  seeders: number | null;
  leechers: number | null;
  languages: string[];
  infoUrl: string | null;
  guidUrl: string;
  infoHash: string | null;
  payload: unknown;
}

export interface ArrQueueRecord {
  id: number;
  title: string;
  status: string | null;
  trackedDownloadState: string | null;
  trackedDownloadStatus: string | null;
  protocol: string | null;
  downloadId: string | null;
  estimatedCompletionTime: string | null;
  payload: unknown;
}

export interface ArrQueueDeleteOptions {
  removeFromClient: boolean;
  blocklist: boolean;
  skipRedownload: boolean;
}

export interface SonarrSeriesRecord {
  id: number;
  title: string;
  titleSlug: string | null;
}

export interface SonarrEpisodeRecord {
  id: number;
  title: string;
  seasonNumber: number | null;
  episodeNumber: number | null;
  seriesId: number;
}

export interface RadarrMovieRecord {
  id: number;
  title: string;
  titleSlug: string | null;
}

export interface ProwlarrHealthRecord {
  source: string | null;
  type: string | null;
  level: string | null;
  message: string;
}

export interface ProwlarrIndexerStatusRecord {
  id: number;
  name: string;
  enabled: boolean;
  status: string | null;
  failureMessage: string | null;
  protocol: string | null;
}

export interface TransmissionSessionProbe {
  rpcVersion: number | null;
  rpcVersionMinimum: number | null;
  version: string | null;
}

export interface TransmissionTorrentRecord {
  id: number;
  hashString: string;
  name: string;
  status: number;
  percentDone: number;
  error: number;
  errorString: string | null;
  eta: number | null;
  rateDownload: number;
  rateUpload: number;
  addedDate: number;
  doneDate: number;
  activityDate: number;
}
