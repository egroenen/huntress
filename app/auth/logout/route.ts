import { NextResponse } from 'next/server';

import {
  assertSameOrigin,
  logoutSession,
  SESSION_COOKIE_NAME,
  verifyCsrfToken,
} from '@/src/auth';
import { getAppContext } from '@/src/server/app-context';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);

    const formData = await request.formData();
    const { config, cookieStore, database } = await getAppContext();
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
      return NextResponse.redirect(new URL('/login', request.url));
    }

    logoutSession(
      database,
      {
        sessionSecret: config.auth.sessionSecret,
        sessionAbsoluteTtlMs: config.auth.sessionAbsoluteTtlMs,
        sessionIdleTtlMs: config.auth.sessionIdleTtlMs,
      },
      signedSessionCookie
    );

    const response = NextResponse.redirect(new URL('/login', request.url));
    response.cookies.set(SESSION_COOKIE_NAME, '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      expires: new Date(0),
    });

    return response;
  } catch {
    return NextResponse.redirect(new URL('/login', request.url));
  }
}
