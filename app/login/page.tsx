import { redirect } from 'next/navigation';

import {
  createCsrfToken,
  isBootstrapRequired,
  resolveAuthenticatedSession,
  SESSION_COOKIE_NAME,
} from '@/src/auth';
import { getAppContext } from '@/src/server/app-context';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
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

  if (authenticated) {
    redirect('/');
  }

  const csrfToken = createCsrfToken('login', config.auth.sessionSecret);

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <p className="eyebrow">Login</p>
        <h1>Sign in to edarr.</h1>
        <p className="lede">
          Use the built-in local admin account created during first-run setup.
        </p>

        <form action="/auth/login" method="post" className="auth-form">
          <input type="hidden" name="csrfToken" value={csrfToken} />

          <label>
            <span>Username</span>
            <input type="text" name="username" autoComplete="username" required />
          </label>

          <label>
            <span>Password</span>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
            />
          </label>

          <button type="submit">Sign in</button>
        </form>
      </section>
    </main>
  );
}
