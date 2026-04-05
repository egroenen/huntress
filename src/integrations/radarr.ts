import type {
  ArrCommandResponse,
  ArrQueueDeleteOptions,
  ArrQueueRecord,
  ArrSystemStatus,
  ArrWantedPageResult,
  ArrWantedRecord,
} from './types';
import {
  deleteArrQueueItem,
  dispatchArrCommand,
  fetchArrQueue,
  fetchArrSystemStatus,
  fetchRadarrWantedPage,
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
    getWantedMissingPage(page: number): Promise<ArrWantedPageResult> {
      return fetchRadarrWantedPage(clientOptions, 'missing', page);
    },
    getWantedCutoff(): Promise<ArrWantedRecord[]> {
      return fetchRadarrWanted(clientOptions, 'cutoff');
    },
    getWantedCutoffPage(page: number): Promise<ArrWantedPageResult> {
      return fetchRadarrWantedPage(clientOptions, 'cutoff', page);
    },
    getQueueDetails(): Promise<ArrQueueRecord[]> {
      return fetchArrQueue(clientOptions);
    },
    removeQueueItem(
      queueId: number,
      deleteOptions: ArrQueueDeleteOptions
    ): Promise<void> {
      return deleteArrQueueItem(clientOptions, queueId, deleteOptions);
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
