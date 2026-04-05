import type { Route } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { SESSION_COOKIE_NAME } from '@/src/auth';
import {
  authenticateConsoleFormAction,
  type ActionName,
} from '@/src/server/require-action';

export const buildPath = (
  pathname: string,
  params: Record<string, string | number | null | undefined>
): Route => {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') {
      continue;
    }

    searchParams.set(key, String(value));
  }

  const query = searchParams.toString();
  return (query ? `${pathname}?${query}` : pathname) as Route;
};

export const normalizeErrorMessage = (error: unknown, fallback: string): string => {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : fallback;
};

export const isAuthenticationError = (error: unknown): boolean => {
  return (
    error instanceof Error &&
    (
      error.message === 'Authentication required' ||
      error.message === 'Missing CSRF token' ||
      error.message === 'Invalid CSRF token'
    )
  );
};

export const redirectToLogin = (notice = 'Please sign in again.') => {
  redirect(
    buildPath('/login', {
      status: 'error',
      notice,
    })
  );
};

export const normalizeReturnTo = (
  value: FormDataEntryValue | null,
  fallback: string
): string => {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();

  if (!trimmed.startsWith('/')) {
    return fallback;
  }

  return trimmed;
};

export const clearSessionCookie = async () => {
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(0),
  });
};

export const authenticateConsoleSubmission = async (
  formData: FormData,
  actionName: ActionName,
  options?: {
    csrfFieldName?: string;
  }
) => {
  return authenticateConsoleFormAction(formData, actionName, options);
};
