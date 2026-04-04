import type { AppUserRecord, DatabaseContext } from '@/src/db';

import { hashPassword, verifyPassword } from './password.js';
import {
  createSessionCookieOptions,
  createSessionRecord,
  createSignedValue,
  verifySignedValue,
} from './session.js';

export interface AuthConfiguration {
  sessionSecret: string;
  sessionAbsoluteTtlMs: number;
  sessionIdleTtlMs: number;
}

export interface AuthenticatedSession {
  user: AppUserRecord;
  sessionId: string;
  cookieValue: string;
}

export interface RequestMetadata {
  ipAddress: string | null;
  userAgent: string | null;
}

const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1_000;
const MAX_LOGIN_FAILURES = 5;

const validatePasswordStrength = (password: string): void => {
  if (password.length < 12) {
    throw new Error('Password must be at least 12 characters long');
  }
};

const createSessionResponse = (
  user: AppUserRecord,
  sessionId: string,
  authConfig: AuthConfiguration
): AuthenticatedSession => {
  return {
    user,
    sessionId,
    cookieValue: createSignedValue(sessionId, authConfig.sessionSecret),
  };
};

export const isBootstrapRequired = (database: DatabaseContext): boolean => {
  return database.repositories.appUsers.count() === 0;
};

export const bootstrapAdminUser = async (
  database: DatabaseContext,
  authConfig: AuthConfiguration,
  input: {
    username: string;
    password: string;
    requestMetadata: RequestMetadata;
  }
): Promise<AuthenticatedSession> => {
  if (!isBootstrapRequired(database)) {
    throw new Error('Bootstrap is no longer available');
  }

  validatePasswordStrength(input.password);

  const now = new Date();
  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(input.password);

  const user: AppUserRecord = {
    id: userId,
    username: input.username.trim(),
    passwordHash,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    disabled: false,
  };

  database.repositories.appUsers.create(user);

  const session = createSessionRecord(
    userId,
    now,
    authConfig.sessionAbsoluteTtlMs,
    authConfig.sessionIdleTtlMs,
    input.requestMetadata.ipAddress,
    input.requestMetadata.userAgent
  );

  database.repositories.appSessions.create(session);

  return createSessionResponse(user, session.id, authConfig);
};

export const loginUser = async (
  database: DatabaseContext,
  authConfig: AuthConfiguration,
  input: {
    username: string;
    password: string;
    requestMetadata: RequestMetadata;
  }
): Promise<AuthenticatedSession> => {
  const username = input.username.trim();
  const now = new Date();
  const nowIso = now.toISOString();
  const failureWindowStartIso = new Date(
    now.getTime() - LOGIN_FAILURE_WINDOW_MS
  ).toISOString();

  const recentFailures = database.repositories.loginAttempts.countFailuresSince(
    username,
    failureWindowStartIso
  );

  if (recentFailures >= MAX_LOGIN_FAILURES) {
    throw new Error('Too many failed login attempts, please wait and try again');
  }

  const user = database.repositories.appUsers.findByUsername(username);
  const passwordValid =
    user !== null &&
    !user.disabled &&
    (await verifyPassword(user.passwordHash, input.password));

  database.repositories.loginAttempts.record({
    username,
    ipAddress: input.requestMetadata.ipAddress,
    attemptedAt: nowIso,
    success: passwordValid,
  });

  if (!user || user.disabled || !passwordValid) {
    throw new Error('Invalid username or password');
  }

  const session = createSessionRecord(
    user.id,
    now,
    authConfig.sessionAbsoluteTtlMs,
    authConfig.sessionIdleTtlMs,
    input.requestMetadata.ipAddress,
    input.requestMetadata.userAgent
  );

  database.repositories.appSessions.create(session);

  return createSessionResponse(user, session.id, authConfig);
};

export const resolveAuthenticatedSession = (
  database: DatabaseContext,
  authConfig: AuthConfiguration,
  signedSessionCookie: string | undefined
): AuthenticatedSession | null => {
  if (!signedSessionCookie) {
    return null;
  }

  const sessionId = verifySignedValue(signedSessionCookie, authConfig.sessionSecret);

  if (!sessionId) {
    return null;
  }

  const session = database.repositories.appSessions.findById(sessionId);

  if (!session) {
    return null;
  }

  const now = new Date();
  const nowIso = now.toISOString();

  if (session.expiresAt <= nowIso || session.idleExpiresAt <= nowIso) {
    database.repositories.appSessions.deleteById(sessionId);
    return null;
  }

  const user = database.repositories.appUsers.findById(session.userId);

  if (!user || user.disabled) {
    database.repositories.appSessions.deleteById(sessionId);
    return null;
  }

  database.repositories.appSessions.touch(
    sessionId,
    nowIso,
    new Date(now.getTime() + authConfig.sessionIdleTtlMs).toISOString()
  );

  return createSessionResponse(user, sessionId, authConfig);
};

export const logoutSession = (
  database: DatabaseContext,
  authConfig: AuthConfiguration,
  signedSessionCookie: string | undefined
): void => {
  if (!signedSessionCookie) {
    return;
  }

  const sessionId = verifySignedValue(signedSessionCookie, authConfig.sessionSecret);

  if (!sessionId) {
    return;
  }

  database.repositories.appSessions.deleteById(sessionId);
};

export const getSessionCookieOptions = (authConfig: AuthConfiguration) => {
  return createSessionCookieOptions(Math.floor(authConfig.sessionAbsoluteTtlMs / 1_000));
};
