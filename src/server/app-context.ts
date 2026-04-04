import 'server-only';

import { cookies, headers } from 'next/headers';

import { loadConfig } from '@/src/config';
import { getDatabaseContext } from '@/src/db/runtime.js';

export const getAppContext = async () => {
  const [{ config }, database] = await Promise.all([loadConfig(), getDatabaseContext()]);

  return {
    config,
    database,
    requestMetadata: {
      ipAddress: (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      userAgent: (await headers()).get('user-agent'),
    },
    cookieStore: await cookies(),
  };
};
