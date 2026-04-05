import type {
  ArrCommandResponse,
  ArrQueueDeleteOptions,
  ArrQueueRecord,
  ArrReleaseRecord,
  ArrSystemStatus,
  ArrWantedPageResult,
  ArrWantedRecord,
  RadarrMovieRecord,
} from './types';
import {
  deleteArrQueueItem,
  dispatchArrCommand,
  fetchArrQueue,
  fetchArrReleases,
  fetchArrSystemStatus,
  fetchRadarrMovie,
  fetchRadarrWantedPage,
  fetchRadarrWanted,
  grabArrRelease,
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
    listMovieReleases(movieId: number): Promise<ArrReleaseRecord[]> {
      return fetchArrReleases(clientOptions, { movieId });
    },
    grabRelease(guid: string, indexerId: number): Promise<ArrCommandResponse> {
      return grabArrRelease(clientOptions, { guid, indexerId });
    },
    getMovie(movieId: number): Promise<RadarrMovieRecord> {
      return fetchRadarrMovie(clientOptions, movieId);
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
