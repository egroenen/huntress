import { redirect } from 'next/navigation';

import {
  createCsrfToken,
  getSessionCookieOptions,
  isBootstrapRequired,
  resolveAuthenticatedSession,
  SESSION_COOKIE_NAME,
} from '@/src/auth';
import { getAppContext } from '@/src/server/app-context';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const { config, cookieStore, database } = await getAppContext();

  if (isBootstrapRequired(database)) {
    redirect('/setup');
  }

  const authenticated = resolveAuthenticatedSession(
    database,
    {
      sessionSecret: config.auth.sessionSecret,
      sessionAbsoluteTtlMs: config.auth.sessionAbsoluteTtlMs,
      sessionIdleTtlMs: config.auth.sessionIdleTtlMs,
    },
    cookieStore.get(SESSION_COOKIE_NAME)?.value
  );

  if (!authenticated) {
    redirect('/login');
  }

  cookieStore.set(
    SESSION_COOKIE_NAME,
    authenticated.cookieValue,
    getSessionCookieOptions({
      sessionSecret: config.auth.sessionSecret,
      sessionAbsoluteTtlMs: config.auth.sessionAbsoluteTtlMs,
      sessionIdleTtlMs: config.auth.sessionIdleTtlMs,
    })
  );

  const csrfToken = createCsrfToken(
    `logout:${authenticated.sessionId}`,
    config.auth.sessionSecret
  );

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">edarr</p>
        <h1>Arr orchestration with a visible control plane.</h1>
        <p className="lede">
          The Next.js shell is live. The scheduler, integrations, and operator flows will
          be layered in behind this UI.
        </p>
      </section>

      <section className="panel">
        <h2>Current Session</h2>
        <dl>
          <div>
            <dt>Signed in as</dt>
            <dd>{authenticated.user.username}</dd>
          </div>
          <div>
            <dt>Mode</dt>
            <dd>{config.mode}</dd>
          </div>
          <div>
            <dt>Persistence</dt>
            <dd>{config.storage.sqlitePath}</dd>
          </div>
        </dl>

        <form action="/auth/logout" method="post" className="auth-inline-form">
          <input type="hidden" name="csrfToken" value={csrfToken} />
          <button type="submit" className="secondary-button">
            Sign out
          </button>
        </form>
      </section>
    </main>
  );
}
