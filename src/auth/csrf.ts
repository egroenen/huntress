import { timingSafeEqual } from 'node:crypto';

import { createSignedValue, verifySignedValue } from './session';

export const createCsrfToken = (scope: string, secret: string): string => {
  return createSignedValue(scope, secret);
};

export const verifyCsrfToken = (
  token: string,
  scope: string,
  secret: string
): boolean => {
  const resolvedScope = verifySignedValue(token, secret);

  if (resolvedScope === null) {
    return false;
  }

  const resolvedBuffer = Buffer.from(resolvedScope);
  const expectedBuffer = Buffer.from(scope);

  if (resolvedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(resolvedBuffer, expectedBuffer);
};

const resolveExpectedOrigin = (request: Request): string | null => {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const host = forwardedHost ?? request.headers.get('host');

  if (!host) {
    return null;
  }

  const proto =
    request.headers.get('x-forwarded-proto') ??
    new URL(request.url).protocol.replace(':', '');

  return `${proto}://${host}`;
};

export const assertSameOrigin = (request: Request): void => {
  const originHeader = request.headers.get('origin');
  const refererHeader = request.headers.get('referer');
  const expectedOrigin = resolveExpectedOrigin(request);

  if (!expectedOrigin) {
    throw new Error('Missing expected origin information');
  }

  const actualOrigin = originHeader
    ? originHeader
    : refererHeader
      ? new URL(refererHeader).origin
      : null;

  if (!actualOrigin || actualOrigin !== expectedOrigin) {
    throw new Error('Cross-site form submission rejected');
  }
};
