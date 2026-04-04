import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import BetterSqlite3, { type Database as SqliteDatabase } from 'better-sqlite3';

import { migrations } from './migrations';
import { createRepositories, type DatabaseRepositories } from './repositories';

export interface AppliedMigration {
  version: string;
  description: string;
  appliedAt: string;
}

export interface DatabaseContext {
  connection: SqliteDatabase;
  repositories: DatabaseRepositories;
  appliedMigrations: AppliedMigration[];
  close(): void;
}

const configureDatabase = (database: SqliteDatabase): void => {
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  database.pragma('busy_timeout = 5000');
};

const ensureMigrationTable = (database: SqliteDatabase): void => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
};

const getAppliedMigrationVersions = (database: SqliteDatabase): Set<string> => {
  const rows = database
    .prepare<
      [],
      { version: string }
    >('SELECT version FROM schema_migrations ORDER BY version ASC')
    .all();

  return new Set(rows.map((row) => row.version));
};

const applyMigrations = (database: SqliteDatabase): AppliedMigration[] => {
  ensureMigrationTable(database);

  const appliedVersions = getAppliedMigrationVersions(database);
  const appliedMigrations: AppliedMigration[] = [];

  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) {
      continue;
    }

    const appliedAt = new Date().toISOString();

    const transaction = database.transaction(() => {
      database.exec(migration.sql);
      database
        .prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
        .run(migration.version, appliedAt);
    });

    transaction();

    appliedMigrations.push({
      version: migration.version,
      description: migration.description,
      appliedAt,
    });
  }

  return appliedMigrations;
};

export const initializeDatabase = async (
  databasePath: string
): Promise<DatabaseContext> => {
  const resolvedPath = resolve(databasePath);

  let writablePath = resolvedPath;

  try {
    await mkdir(dirname(resolvedPath), { recursive: true });
  } catch (error) {
    const shouldUseLocalFallback =
      error instanceof Error &&
      'code' in error &&
      error.code === 'EACCES' &&
      resolvedPath.startsWith('/data/');

    if (!shouldUseLocalFallback) {
      throw error;
    }

    writablePath = resolve(
      process.cwd(),
      join('data', databasePath.slice('/data/'.length))
    );
    await mkdir(dirname(writablePath), { recursive: true });
  }

  const connection = new BetterSqlite3(writablePath);
  configureDatabase(connection);

  const appliedMigrations = applyMigrations(connection);
  const repositories = createRepositories(connection);

  return {
    connection,
    repositories,
    appliedMigrations,
    close(): void {
      connection.close();
    },
  };
};
