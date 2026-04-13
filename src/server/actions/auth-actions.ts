import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import {
  bootstrapAdminUser,
  getSessionCookieOptions,
  isBootstrapRequired,
  loginUser,
  logoutSession,
  resolveSecureCookieSetting,
  SESSION_COOKIE_NAME,
  verifyCsrfToken,
} from '@/src/auth';
import { logger } from '@/src/observability';
import { getAppContext } from '@/src/server/app-context';

import { buildPath, clearSessionCookie, normalizeErrorMessage } from './shared';

export async function runLoginAction(formData: FormData) {
  const { config, database, requestMetadata } = await getAppContext();
  const secureCookies = resolveSecureCookieSetting(await headers());

  if (isBootstrapRequired(database)) {
    redirect('/setup');
  }

  const csrfToken = formData.get('csrfToken');
  const username = formData.get('username');
  const password = formData.get('password');

  if (
    typeof csrfToken !== 'string' ||
    !verifyCsrfToken(csrfToken, 'login', config.auth.sessionSecret)
  ) {
    redirect(
      buildPath('/login', {
        status: 'error',
        notice: 'Your sign-in form expired. Please try again.',
      })
    );
  }

  if (typeof username !== 'string' || typeof password !== 'string') {
    redirect(
      buildPath('/login', {
        status: 'error',
        notice: 'Username and password are required.',
      })
    );
  }

  try {
    const authenticated = await loginUser(
      database,
      {
        sessionSecret: config.auth.sessionSecret,
        sessionAbsoluteTtlMs: config.auth.sessionAbsoluteTtlMs,
        sessionIdleTtlMs: config.auth.sessionIdleTtlMs,
      },
      {
        username,
        password,
        requestMetadata,
      }
    );

    const cookieStore = await cookies();
    cookieStore.set(
      SESSION_COOKIE_NAME,
      authenticated.cookieValue,
      getSessionCookieOptions({
        sessionSecret: config.auth.sessionSecret,
        sessionAbsoluteTtlMs: config.auth.sessionAbsoluteTtlMs,
        sessionIdleTtlMs: config.auth.sessionIdleTtlMs,
      })(secureCookies)
    );
  } catch (error) {
    redirect(
      buildPath('/login', {
        status: 'error',
        notice: normalizeErrorMessage(error, 'Unable to sign in.'),
      })
    );
  }

  redirect('/');
}

export async function runSetupAction(formData: FormData) {
  const { config, database, requestMetadata } = await getAppContext();
  const secureCookies = resolveSecureCookieSetting(await headers());

  if (!isBootstrapRequired(database)) {
    redirect('/login');
  }

  const csrfToken = formData.get('csrfToken');
  const username = formData.get('username');
  const password = formData.get('password');
  const confirmPassword = formData.get('confirmPassword');

  if (
    typeof csrfToken !== 'string' ||
    !verifyCsrfToken(csrfToken, 'setup', config.auth.sessionSecret)
  ) {
    redirect(
      buildPath('/setup', {
        status: 'error',
        notice: 'Your setup form expired. Please try again.',
      })
    );
  }

  if (
    typeof username !== 'string' ||
    typeof password !== 'string' ||
    typeof confirmPassword !== 'string'
  ) {
    redirect(
      buildPath('/setup', {
        status: 'error',
        notice: 'All setup fields are required.',
      })
    );
  }

  if (password !== confirmPassword) {
    redirect(
      buildPath('/setup', {
        status: 'error',
        notice: 'Passwords do not match.',
      })
    );
  }

  try {
    const authenticated = await bootstrapAdminUser(
      database,
      {
        sessionSecret: config.auth.sessionSecret,
        sessionAbsoluteTtlMs: config.auth.sessionAbsoluteTtlMs,
        sessionIdleTtlMs: config.auth.sessionIdleTtlMs,
      },
      {
        username,
        password,
        requestMetadata,
      }
    );

    const cookieStore = await cookies();
    cookieStore.set(
      SESSION_COOKIE_NAME,
      authenticated.cookieValue,
      getSessionCookieOptions({
        sessionSecret: config.auth.sessionSecret,
        sessionAbsoluteTtlMs: config.auth.sessionAbsoluteTtlMs,
        sessionIdleTtlMs: config.auth.sessionIdleTtlMs,
      })(secureCookies)
    );
  } catch (error) {
    redirect(
      buildPath('/setup', {
        status: 'error',
        notice: normalizeErrorMessage(error, 'Unable to create the admin account.'),
      })
    );
  }

  redirect('/');
}

export async function runLogoutAction(formData: FormData) {
  const { config, database, cookieStore } = await getAppContext();
  const signedSessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const sessionId = signedSessionCookie
    ? signedSessionCookie.slice(0, signedSessionCookie.lastIndexOf('.'))
    : null;
  const csrfToken = formData.get('csrfToken');

  if (
    !sessionId ||
    typeof csrfToken !== 'string' ||
    !verifyCsrfToken(csrfToken, `logout:${sessionId}`, config.auth.sessionSecret)
  ) {
    await clearSessionCookie();
    redirect(
      buildPath('/login', {
        status: 'error',
        notice: 'Your session expired. Please sign in again.',
      })
    );
  }

  try {
    logoutSession(
      database,
      {
        sessionSecret: config.auth.sessionSecret,
        sessionAbsoluteTtlMs: config.auth.sessionAbsoluteTtlMs,
        sessionIdleTtlMs: config.auth.sessionIdleTtlMs,
      },
      signedSessionCookie
    );
  } catch (error) {
    logger.error(
      {
        error,
        event: 'logout_failed',
      },
      'Failed to log out cleanly'
    );
  }

  await clearSessionCookie();
  redirect('/login');
}
