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
  return {
    probeSystemStatus(): Promise<ArrSystemStatus> {
      return fetchArrSystemStatus(options);
    },
    getWantedMissing(): Promise<ArrWantedRecord[]> {
      return fetchRadarrWanted(options, 'missing');
    },
    getWantedCutoff(): Promise<ArrWantedRecord[]> {
      return fetchRadarrWanted(options, 'cutoff');
    },
    getQueueDetails(): Promise<ArrQueueRecord[]> {
      return fetchArrQueue(options);
    },
    searchMovie(movieId: number): Promise<ArrCommandResponse> {
      return dispatchArrCommand(options, {
        name: 'MoviesSearch',
        movieIds: [movieId],
      });
    },
  };
};

export type RadarrApiClient = ReturnType<typeof createRadarrClient>;
