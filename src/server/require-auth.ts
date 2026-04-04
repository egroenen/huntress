import 'server-only';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import {
  createCsrfToken,
  isBootstrapRequired,
  resolveAuthenticatedSession,
  SESSION_COOKIE_NAME,
} from '@/src/auth';
import { getRuntimeContext } from '@/src/server/runtime';

export const requireAuthenticatedConsoleContext = async () => {
  const runtime = await getRuntimeContext();
  const cookieStore = await cookies();

  if (isBootstrapRequired(runtime.database)) {
    redirect('/setup');
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
    redirect('/login');
  }

  return {
    ...runtime,
    authenticated,
    csrfTokens: {
      logout: createCsrfToken(
        `logout:${authenticated.sessionId}`,
        runtime.config.auth.sessionSecret
      ),
      runSync: createCsrfToken(
        `action:run-sync:${authenticated.sessionId}`,
        runtime.config.auth.sessionSecret
      ),
      runDry: createCsrfToken(
        `action:run-dry:${authenticated.sessionId}`,
        runtime.config.auth.sessionSecret
      ),
      runLive: createCsrfToken(
        `action:run-live:${authenticated.sessionId}`,
        runtime.config.auth.sessionSecret
      ),
      recoverRun: createCsrfToken(
        `action:recover-run:${authenticated.sessionId}`,
        runtime.config.auth.sessionSecret
      ),
      saveSettings: createCsrfToken(
        `action:save-settings:${authenticated.sessionId}`,
        runtime.config.auth.sessionSecret
      ),
      testSonarr: createCsrfToken(
        `action:test-connection:sonarr:${authenticated.sessionId}`,
        runtime.config.auth.sessionSecret
      ),
      testRadarr: createCsrfToken(
        `action:test-connection:radarr:${authenticated.sessionId}`,
        runtime.config.auth.sessionSecret
      ),
      testProwlarr: createCsrfToken(
        `action:test-connection:prowlarr:${authenticated.sessionId}`,
        runtime.config.auth.sessionSecret
      ),
      testTransmission: createCsrfToken(
        `action:test-connection:transmission:${authenticated.sessionId}`,
        runtime.config.auth.sessionSecret
      ),
    },
  };
};
