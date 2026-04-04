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
  fetchRadarrWanted,
  type ArrClientOptions,
} from './arr-shared';

export type RadarrClient = ArrClientOptions;

export const createRadarrClient = (options: RadarrClient) => {
  const clientOptions: RadarrClient = {
    ...options,
    serviceName: 'radarr',
  };

  return {
    probeSystemStatus(): Promise<ArrSystemStatus> {
      return fetchArrSystemStatus(clientOptions);
    },
    getWantedMissing(): Promise<ArrWantedRecord[]> {
      return fetchRadarrWanted(clientOptions, 'missing');
    },
    getWantedCutoff(): Promise<ArrWantedRecord[]> {
      return fetchRadarrWanted(clientOptions, 'cutoff');
    },
    getQueueDetails(): Promise<ArrQueueRecord[]> {
      return fetchArrQueue(clientOptions);
    },
    searchMovie(movieId: number): Promise<ArrCommandResponse> {
      return dispatchArrCommand(clientOptions, {
        name: 'MoviesSearch',
        movieIds: [movieId],
      });
    },
  };
};

export type RadarrApiClient = ReturnType<typeof createRadarrClient>;
