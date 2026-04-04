import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import type { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies';

import type { AppSessionRecord } from '@/src/db';

export const SESSION_COOKIE_NAME = 'edarr_session';

const signValue = (value: string, secret: string): string => {
  return createHmac('sha256', secret).update(value).digest('base64url');
};

export const createSignedValue = (value: string, secret: string): string => {
  return `${value}.${signValue(value, secret)}`;
};

export const verifySignedValue = (
  signedValue: string,
  secret: string
): string | null => {
  const separatorIndex = signedValue.lastIndexOf('.');

  if (separatorIndex <= 0) {
    return null;
  }

  const value = signedValue.slice(0, separatorIndex);
  const signature = signedValue.slice(separatorIndex + 1);
  const expectedSignature = signValue(value, secret);

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  return value;
};

export const createSessionRecord = (
  userId: string,
  now: Date,
  absoluteTtlMs: number,
  idleTtlMs: number,
  ipAddress: string | null,
  userAgent: string | null
): AppSessionRecord => {
  const createdAt = now.toISOString();

  return {
    id: randomBytes(32).toString('hex'),
    userId,
    createdAt,
    lastSeenAt: createdAt,
    expiresAt: new Date(now.getTime() + absoluteTtlMs).toISOString(),
    idleExpiresAt: new Date(now.getTime() + idleTtlMs).toISOString(),
    ipAddress,
    userAgent
  };
};

export const createSessionCookieOptions = (
  maxAgeSeconds: number
): Partial<ResponseCookie> => {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeSeconds
  };
};
