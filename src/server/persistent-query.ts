import 'server-only';

import { cookies } from 'next/headers';

type SearchParams = Record<string, string | string[] | undefined>;

const decodePersistedState = (value: string | undefined): Record<string, string> => {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(value));

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).flatMap(([key, entryValue]) =>
        typeof entryValue === 'string' ? [[key, entryValue]] : []
      )
    );
  } catch {
    return {};
  }
};

export const readPersistedQueryState = async (
  cookieName: string,
  keys: readonly string[]
): Promise<Record<string, string>> => {
  const cookieStore = await cookies();
  const parsed = decodePersistedState(cookieStore.get(cookieName)?.value);

  return Object.fromEntries(keys.map((key) => [key, parsed[key] ?? '']));
};

export const withPersistedQueryState = (
  searchParams: SearchParams,
  persistedState: Record<string, string>
): SearchParams => {
  return {
    ...searchParams,
    ...Object.fromEntries(
      Object.entries(persistedState).flatMap(([key, value]) =>
        searchParams[key] === undefined && value ? [[key, value]] : []
      )
    ),
  };
};
