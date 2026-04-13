import 'server-only';

import { loadConfig } from '@/src/config';
import { createRepositories } from '@/src/db/repositories';
import { logger } from '@/src/observability';

import { initializeDatabase, type DatabaseContext } from './index';

const AUTH_RESET_STATE_KEY = 'auth_reset_state';

declare global {
  var __huntressDatabaseContext: Promise<DatabaseContext> | undefined;
}

const maybeApplyAuthReset = async (database: DatabaseContext): Promise<void> => {
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
      completedAt: now,
    },
    updatedAt: now,
  });
  logger.warn({
    event: 'auth_reset_performed',
    completedAt: now,
  });
};

const createDatabaseContext = async (): Promise<DatabaseContext> => {
  const { config } = await loadConfig();
  const database = await initializeDatabase(config.storage.sqlitePath);

  await maybeApplyAuthReset(database);

  return database;
};

const refreshDatabaseRepositories = (database: DatabaseContext): DatabaseContext => {
  database.repositories = createRepositories(database.connection);
  return database;
};

export const getDatabaseContext = async (): Promise<DatabaseContext> => {
  if (!globalThis.__huntressDatabaseContext) {
    globalThis.__huntressDatabaseContext = createDatabaseContext();
  }

  return refreshDatabaseRepositories(await globalThis.__huntressDatabaseContext);
};
