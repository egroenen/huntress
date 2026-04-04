import type {
  ArrCommandResponse,
  ArrQueueRecord,
  ArrSystemStatus,
  ArrWantedRecord,
} from './types';
import {
  dispatchArrCommand,
  fetchArrQueue,
  fetchArrSystemStatus,
  fetchSonarrWanted,
  type ArrClientOptions,
} from './arr-shared';

export type SonarrClient = ArrClientOptions;

export const createSonarrClient = (options: SonarrClient) => {
  const clientOptions: SonarrClient = {
    ...options,
    serviceName: 'sonarr',
  };

  return {
    probeSystemStatus(): Promise<ArrSystemStatus> {
      return fetchArrSystemStatus(clientOptions);
    },
    getWantedMissing(): Promise<ArrWantedRecord[]> {
      return fetchSonarrWanted(clientOptions, 'missing');
    },
    getWantedCutoff(): Promise<ArrWantedRecord[]> {
      return fetchSonarrWanted(clientOptions, 'cutoff');
    },
    getQueueDetails(): Promise<ArrQueueRecord[]> {
      return fetchArrQueue(clientOptions);
    },
    searchEpisode(episodeId: number): Promise<ArrCommandResponse> {
      return dispatchArrCommand(clientOptions, {
        name: 'EpisodeSearch',
        episodeIds: [episodeId],
      });
    },
  };
};

export type SonarrApiClient = ReturnType<typeof createSonarrClient>;
