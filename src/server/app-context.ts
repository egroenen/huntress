import 'server-only';

import { cookies, headers } from 'next/headers';

import { getRuntimeContext } from '@/src/server/runtime';

export const getAppContext = async () => {
  const runtime = await getRuntimeContext();

  return {
    config: runtime.config,
    redactedConfig: runtime.redactedConfig,
    database: runtime.database,
    requestMetadata: {
      ipAddress: (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      userAgent: (await headers()).get('user-agent'),
    },
    cookieStore: await cookies(),
  };
};
