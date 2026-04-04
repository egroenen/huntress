import { redirect } from 'next/navigation';

import { createCsrfToken, isBootstrapRequired } from '@/src/auth';
import { getAppContext } from '@/src/server/app-context';

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  const { config, database } = await getAppContext();

  if (!isBootstrapRequired(database)) {
    redirect('/login');
  }

  const csrfToken = createCsrfToken('setup', config.auth.sessionSecret);

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <p className="eyebrow">Initial Setup</p>
        <h1>Create the first edarr admin account.</h1>
        <p className="lede">
          This bootstrap flow is only available until the first local admin
          user is created.
        </p>

        <form action="/auth/setup" method="post" className="auth-form">
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
              autoComplete="new-password"
              minLength={12}
              required
            />
          </label>

          <label>
            <span>Confirm password</span>
            <input
              type="password"
              name="confirmPassword"
              autoComplete="new-password"
              minLength={12}
              required
            />
          </label>

          <button type="submit">Create admin</button>
        </form>
      </section>
    </main>
  );
}
