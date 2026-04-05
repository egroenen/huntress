import 'server-only';

import { cookies, headers } from 'next/headers';

import {
  assertSameOrigin,
  resolveAuthenticatedSession,
  verifyCsrfToken,
  SESSION_COOKIE_NAME,
} from '@/src/auth';
import { getRuntimeContext } from '@/src/server/runtime';

export type ActionName =
  | 'run-sync'
  | 'run-dry'
  | 'run-live'
  | 'recover-run'
  | 'reset-transmission-cache'
  | 'manual-fetch'
  | 'save-settings'
  | 'clear-suppressions'
  | `clear-suppression:${number}`
  | `test-connection:${'sonarr' | 'radarr' | 'prowlarr' | 'transmission'}`;

const buildActionPurpose = (actionName: ActionName, sessionId: string): string => {
  if (actionName.startsWith('clear-suppression:')) {
    const suppressionId = actionName.slice('clear-suppression:'.length);
    return `action:clear-suppression:${suppressionId}:${sessionId}`;
  }

  if (actionName.startsWith('test-connection:')) {
    const service = actionName.slice('test-connection:'.length);
    return `action:test-connection:${service}:${sessionId}`;
  }

  return `action:${actionName}:${sessionId}`;
};

const getRequestMetadata = async () => {
  const requestHeaders = await headers();

  return {
    ipAddress: requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: requestHeaders.get('user-agent'),
  };
};

export const authenticateConsoleAction = async (
  request: Request,
  actionName: ActionName
) => {
  assertSameOrigin(request);

  const runtime = await getRuntimeContext();
  const cookieStore = await cookies();
  const formData = await request.formData();
  const csrfToken = formData.get('csrfToken');

  if (typeof csrfToken !== 'string') {
    throw new Error('Missing CSRF token');
  }

  const authenticated = resolveAuthenticatedSession(
    runtime.database,
    {
      sessionSecret: runtime.config.auth.sessionSecret,
      sessionAbsoluteTtlMs: runtime.config.auth.sessionAbsoluteTtlMs,
      sessionIdleTtlMs: runtime.config.auth.sessionIdleTtlMs,
    },
    cookieStore.get(SESSION_COOKIE_NAME)?.value
  );

  if (!authenticated) {
    throw new Error('Authentication required');
  }

  if (
    !verifyCsrfToken(
      csrfToken,
      buildActionPurpose(actionName, authenticated.sessionId),
      runtime.config.auth.sessionSecret
    )
  ) {
    throw new Error('Invalid CSRF token');
  }

  return {
    runtime,
    authenticated,
    formData,
    requestMetadata: await getRequestMetadata(),
  };
};

export const authenticateConsoleFormAction = async (
  formData: FormData,
  actionName: ActionName
) => {
  const runtime = await getRuntimeContext();
  const cookieStore = await cookies();
  const csrfToken = formData.get('csrfToken');

  if (typeof csrfToken !== 'string') {
    throw new Error('Missing CSRF token');
  }

  const authenticated = resolveAuthenticatedSession(
    runtime.database,
    {
      sessionSecret: runtime.config.auth.sessionSecret,
      sessionAbsoluteTtlMs: runtime.config.auth.sessionAbsoluteTtlMs,
      sessionIdleTtlMs: runtime.config.auth.sessionIdleTtlMs,
    },
    cookieStore.get(SESSION_COOKIE_NAME)?.value
  );

  if (!authenticated) {
    throw new Error('Authentication required');
  }

  if (
    !verifyCsrfToken(
      csrfToken,
      buildActionPurpose(actionName, authenticated.sessionId),
      runtime.config.auth.sessionSecret
    )
  ) {
    throw new Error('Invalid CSRF token');
  }

  return {
    runtime,
    authenticated,
    formData,
    requestMetadata: await getRequestMetadata(),
  };
};
