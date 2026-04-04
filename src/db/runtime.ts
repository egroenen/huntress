import 'server-only';

import { loadConfig } from '@/src/config';

import { initializeDatabase, type DatabaseContext } from './index.js';

const AUTH_RESET_STATE_KEY = 'auth_reset_state';

declare global {
  var __edarrDatabaseContext: Promise<DatabaseContext> | undefined;
}

const maybeApplyAuthReset = async (
  database: DatabaseContext
): Promise<void> => {
  if (process.env.RESET_AUTH !== 'true') {
    return;
  }

  const existingResetState = database.repositories.serviceState.get<{
    completedAt: string;
  }>(AUTH_RESET_STATE_KEY);

  if (existingResetState) {
    return;
  }

  const now = new Date().toISOString();

  database.repositories.appSessions.deleteAll();
  database.repositories.appUsers.deleteAll();
  database.repositories.serviceState.set({
    key: AUTH_RESET_STATE_KEY,
    value: {
      completedAt: now
    },
    updatedAt: now
  });
};

const createDatabaseContext = async (): Promise<DatabaseContext> => {
  const { config } = await loadConfig();
  const database = await initializeDatabase(config.storage.sqlitePath);

  await maybeApplyAuthReset(database);

  return database;
};

export const getDatabaseContext = async (): Promise<DatabaseContext> => {
  if (!globalThis.__edarrDatabaseContext) {
    globalThis.__edarrDatabaseContext = createDatabaseContext();
  }

  return globalThis.__edarrDatabaseContext;
};
