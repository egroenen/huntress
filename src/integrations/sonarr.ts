import type {
  ArrCommandResponse,
  ArrQueueDeleteOptions,
  ArrQueueRecord,
  ArrReleaseRecord,
  ArrSystemStatus,
  ArrWantedPageResult,
  ArrWantedRecord,
  SonarrEpisodeRecord,
  SonarrSeriesRecord,
} from './types';
import {
  deleteArrQueueItem,
  dispatchArrCommand,
  fetchArrQueue,
  fetchArrReleases,
  fetchSonarrEpisode,
  fetchSonarrSeries,
  fetchArrSystemStatus,
  fetchSonarrWantedPage,
  fetchSonarrWanted,
  grabArrRelease,
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
    getWantedMissingPage(page: number): Promise<ArrWantedPageResult> {
      return fetchSonarrWantedPage(clientOptions, 'missing', page);
    },
    getWantedCutoff(): Promise<ArrWantedRecord[]> {
      return fetchSonarrWanted(clientOptions, 'cutoff');
    },
    getWantedCutoffPage(page: number): Promise<ArrWantedPageResult> {
      return fetchSonarrWantedPage(clientOptions, 'cutoff', page);
    },
    getQueueDetails(): Promise<ArrQueueRecord[]> {
      return fetchArrQueue(clientOptions);
    },
    listEpisodeReleases(episodeId: number): Promise<ArrReleaseRecord[]> {
      return fetchArrReleases(clientOptions, { episodeId });
    },
    grabRelease(guid: string, indexerId: number): Promise<ArrCommandResponse> {
      return grabArrRelease(clientOptions, { guid, indexerId });
    },
    getSeries(seriesId: number): Promise<SonarrSeriesRecord> {
      return fetchSonarrSeries(clientOptions, seriesId);
    },
    getEpisode(episodeId: number): Promise<SonarrEpisodeRecord> {
      return fetchSonarrEpisode(clientOptions, episodeId);
    },
    removeQueueItem(
      queueId: number,
      deleteOptions: ArrQueueDeleteOptions
    ): Promise<void> {
      return deleteArrQueueItem(clientOptions, queueId, deleteOptions);
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
