export { IntegrationError } from './http';
export { createProwlarrClient, type ProwlarrApiClient } from './prowlarr';
export { createRadarrClient, type RadarrApiClient } from './radarr';
export { createSonarrClient, type SonarrApiClient } from './sonarr';
export { createTransmissionClient, type TransmissionApiClient } from './transmission';
export type {
  ArrCommandResponse,
  ArrQueueRecord,
  ArrSystemStatus,
  ArrWantedPageResult,
  ArrWantedRecord,
  DependencyHealth,
  ProwlarrHealthRecord,
  ProwlarrIndexerStatusRecord,
  SonarrEpisodeRecord,
  TransmissionSessionProbe,
  TransmissionTorrentRecord,
} from './types';
