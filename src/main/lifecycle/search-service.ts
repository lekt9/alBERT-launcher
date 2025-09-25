import { app } from 'electron';
import path from 'node:path';
import type SearchDB from '../db';
import log from '../logger';

export interface IndexingProgressPayload {
  progress: number;
  status: string;
}

export type IndexingProgressHandler = (payload: IndexingProgressPayload) => void;

let searchDbInstance: SearchDB | null = null;
let searchDbPromise: Promise<SearchDB> | null = null;

const resolveSearchDb = async (): Promise<SearchDB> => {
  if (searchDbInstance) {
    return searchDbInstance;
  }

  if (!searchDbPromise) {
    const userDataPath = app.getPath('userData');
    searchDbPromise = import('../db').then(async ({ default: SearchDBModule }) => {
      const instance = await SearchDBModule.getInstance(userDataPath);
      searchDbInstance = instance;
      return instance;
    });
  }

  return searchDbPromise;
};

export const startSearchIndexing = async (
  onProgress?: IndexingProgressHandler,
): Promise<void> => {
  try {
    const searchDb = await resolveSearchDb();
    const albertDirectory = path.join(app.getPath('home'), 'alBERT');

    await searchDb.startIndexing(albertDirectory, (progress, status) => {
      onProgress?.({ progress, status });
    });
  } catch (error) {
    log.error('Error indexing directory', error);
  }
};

const getCurrentInstance = (): SearchDB | null => searchDbInstance;

export const persistSearchDb = async (): Promise<void> => {
  try {
    const instance = getCurrentInstance();
    if (!instance) {
      return;
    }
    await instance.persist();
  } catch (error) {
    log.error('Error while persisting search database', error);
  }
};

export const shutdownSearchDb = async (): Promise<void> => {
  try {
    const instance = getCurrentInstance();
    if (!instance) {
      return;
    }
    await instance.shutdown();
  } catch (error) {
    log.error('Error during search database shutdown', error);
  } finally {
    searchDbInstance = null;
    searchDbPromise = null;
  }
};
