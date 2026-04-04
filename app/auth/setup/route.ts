import { NextResponse } from 'next/server';

import {
  assertSameOrigin,
  bootstrapAdminUser,
  getSessionCookieOptions,
  isBootstrapRequired,
  SESSION_COOKIE_NAME,
  verifyCsrfToken
} from '@/src/auth';
import { getAppContext } from '@/src/server/app-context';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);

    const formData = await request.formData();
    const { config, database, requestMetadata } = await getAppContext();

    if (!isBootstrapRequired(database)) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    const csrfToken = formData.get('csrfToken');
    const username = formData.get('username');
    const password = formData.get('password');
    const confirmPassword = formData.get('confirmPassword');

    if (
      typeof csrfToken !== 'string' ||
      !verifyCsrfToken(csrfToken, 'setup', config.auth.sessionSecret)
    ) {
      return NextResponse.redirect(new URL('/setup', request.url));
    }

    if (
      typeof username !== 'string' ||
      typeof password !== 'string' ||
      typeof confirmPassword !== 'string' ||
      password !== confirmPassword
    ) {
      return NextResponse.redirect(new URL('/setup', request.url));
    }

    const authenticated = await bootstrapAdminUser(
      database,
      {
        sessionSecret: config.auth.sessionSecret,
        sessionAbsoluteTtlMs: config.auth.sessionAbsoluteTtlMs,
        sessionIdleTtlMs: config.auth.sessionIdleTtlMs
      },
      {
        username,
        password,
        requestMetadata
      }
    );

    const response = NextResponse.redirect(new URL('/', request.url));
    response.cookies.set(
      SESSION_COOKIE_NAME,
      authenticated.cookieValue,
      getSessionCookieOptions({
        sessionSecret: config.auth.sessionSecret,
        sessionAbsoluteTtlMs: config.auth.sessionAbsoluteTtlMs,
        sessionIdleTtlMs: config.auth.sessionIdleTtlMs
      })
    );

    return response;
  } catch {
    return NextResponse.redirect(new URL('/setup', request.url));
  }
}
