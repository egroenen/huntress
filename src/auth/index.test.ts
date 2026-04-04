import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { initializeDatabase } from '@/src/db';

import {
  bootstrapAdminUser,
  isBootstrapRequired,
  loginUser,
  logoutSession,
  resolveAuthenticatedSession,
} from './service';

const authConfig = {
  sessionSecret: 'test-secret',
  sessionAbsoluteTtlMs: 7 * 24 * 60 * 60 * 1_000,
  sessionIdleTtlMs: 24 * 60 * 60 * 1_000,
};

const createDatabasePath = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'edarr-auth-'));
  return join(directory, 'auth.sqlite');
};

test('bootstrap creates the first admin user and session', async () => {
  const database = await initializeDatabase(await createDatabasePath());

  try {
    assert.equal(isBootstrapRequired(database), true);

    const result = await bootstrapAdminUser(database, authConfig, {
      username: 'admin',
      password: 'admin',
      requestMetadata: {
        ipAddress: '127.0.0.1',
        userAgent: 'test-runner',
      },
    });

    assert.equal(result.user.username, 'admin');
    assert.equal(isBootstrapRequired(database), false);
    assert.equal(database.repositories.appUsers.count(), 1);
  } finally {
    database.close();
  }
});

test('login returns a valid authenticated session for correct credentials', async () => {
  const database = await initializeDatabase(await createDatabasePath());

  try {
    await bootstrapAdminUser(database, authConfig, {
      username: 'admin',
      password: 'admin',
      requestMetadata: {
        ipAddress: '127.0.0.1',
        userAgent: 'bootstrap',
      },
    });

    const loginResult = await loginUser(database, authConfig, {
      username: 'admin',
      password: 'admin',
      requestMetadata: {
        ipAddress: '127.0.0.1',
        userAgent: 'test-runner',
      },
    });

    const resolved = resolveAuthenticatedSession(
      database,
      authConfig,
      loginResult.cookieValue
    );

    assert.equal(resolved?.user.username, 'admin');
  } finally {
    database.close();
  }
});

test('login rejects invalid credentials and records a failed login attempt', async () => {
  const database = await initializeDatabase(await createDatabasePath());

  try {
    await bootstrapAdminUser(database, authConfig, {
      username: 'admin',
      password: 'admin',
      requestMetadata: {
        ipAddress: '127.0.0.1',
        userAgent: 'bootstrap',
      },
    });

    await assert.rejects(
      async () =>
        loginUser(database, authConfig, {
          username: 'admin',
          password: 'wrong-password',
          requestMetadata: {
            ipAddress: '127.0.0.1',
            userAgent: 'test-runner',
          },
        }),
      /Invalid username or password/
    );

    const recentFailures = database.repositories.loginAttempts.countFailuresSince(
      'admin',
      '2000-01-01T00:00:00.000Z'
    );

    assert.equal(recentFailures, 1);
  } finally {
    database.close();
  }
});

test('logout invalidates the session', async () => {
  const database = await initializeDatabase(await createDatabasePath());

  try {
    const bootstrap = await bootstrapAdminUser(database, authConfig, {
      username: 'admin',
      password: 'admin',
      requestMetadata: {
        ipAddress: '127.0.0.1',
        userAgent: 'bootstrap',
      },
    });

    logoutSession(database, authConfig, bootstrap.cookieValue);

    const resolved = resolveAuthenticatedSession(
      database,
      authConfig,
      bootstrap.cookieValue
    );

    assert.equal(resolved, null);
  } finally {
    database.close();
  }
});

test('bootstrap rejects an empty password', async () => {
  const database = await initializeDatabase(await createDatabasePath());

  try {
    await assert.rejects(
      async () =>
        bootstrapAdminUser(database, authConfig, {
          username: 'admin',
          password: '',
          requestMetadata: {
            ipAddress: '127.0.0.1',
            userAgent: 'test-runner',
          },
        }),
      /Password cannot be empty/
    );
  } finally {
    database.close();
  }
});
