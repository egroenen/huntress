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
  return {
    probeSystemStatus(): Promise<ArrSystemStatus> {
      return fetchArrSystemStatus(options);
    },
    getWantedMissing(): Promise<ArrWantedRecord[]> {
      return fetchSonarrWanted(options, 'missing');
    },
    getWantedCutoff(): Promise<ArrWantedRecord[]> {
      return fetchSonarrWanted(options, 'cutoff');
    },
    getQueueDetails(): Promise<ArrQueueRecord[]> {
      return fetchArrQueue(options);
    },
    searchEpisode(episodeId: number): Promise<ArrCommandResponse> {
      return dispatchArrCommand(options, {
        name: 'EpisodeSearch',
        episodeIds: [episodeId],
      });
    },
  };
};

export type SonarrApiClient = ReturnType<typeof createSonarrClient>;
