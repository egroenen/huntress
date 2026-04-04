import type { ArrQueueRecord, ArrSystemStatus, ArrWantedRecord } from './types.js';
import {
  fetchArrQueue,
  fetchArrSystemStatus,
  fetchRadarrWanted,
  type ArrClientOptions,
} from './arr-shared.js';

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
  };
};

export type RadarrApiClient = ReturnType<typeof createRadarrClient>;
