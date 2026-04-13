import { redirect } from 'next/navigation';

import { createCsrfToken, isBootstrapRequired } from '@/src/auth';
import { setupAction } from '@/src/server/actions';
import { getAppContext } from '@/src/server/app-context';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const parseStringParam = (value: string | string[] | undefined): string | undefined => {
  return typeof value === 'string' ? value : Array.isArray(value) ? value[0] : undefined;
};

export default async function SetupPage(props: { searchParams: SearchParams }) {
  const searchParams = await props.searchParams;
  const { config, database } = await getAppContext();
  const notice = parseStringParam(searchParams.notice);
  const noticeStatus = parseStringParam(searchParams.status);

  if (!isBootstrapRequired(database)) {
    redirect('/login');
  }

  const csrfToken = createCsrfToken('setup', config.auth.sessionSecret);

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <p className="eyebrow">Initial Setup</p>
        <h1>Create the first Huntress admin account.</h1>
        <p className="lede">
          This bootstrap flow is only available until the first local admin user is
          created.
        </p>

        {notice ? (
          <p
            className={
              noticeStatus === 'success'
                ? 'settings-notice is-success'
                : 'settings-notice is-error'
            }
          >
            {notice}
          </p>
        ) : null}

        <form action={setupAction} className="auth-form">
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
              required
            />
          </label>

          <label>
            <span>Confirm password</span>
            <input
              type="password"
              name="confirmPassword"
              autoComplete="new-password"
              required
            />
          </label>

          <button type="submit">Create admin</button>
        </form>
      </section>
    </main>
  );
}
