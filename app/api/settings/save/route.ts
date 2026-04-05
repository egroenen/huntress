import { NextResponse } from 'next/server';

import {
  savePersistedConnectionSettings,
  savePersistedReleaseSelectionOverrides,
  savePersistedSearchSafetyOverrides,
} from '@/src/server/runtime-config';
import {
  parseConnectionSettingsForm,
  parseReleaseSelectionOverridesForm,
  parseSearchSafetyOverridesForm,
} from '@/src/server/settings-form';
import { authenticateConsoleAction } from '@/src/server/require-action';

export const dynamic = 'force-dynamic';

const buildRedirect = (
  request: Request,
  params: Record<string, string>
): NextResponse => {
  const url = new URL('/settings', request.url);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return NextResponse.redirect(url);
};

export async function POST(request: Request) {
  try {
    const { runtime, formData } = await authenticateConsoleAction(
      request,
      'save-settings'
    );
    const nextSettings = parseConnectionSettingsForm(formData);
    const nextOverrides = parseSearchSafetyOverridesForm(formData);
    const nextReleaseSelectionOverrides =
      parseReleaseSelectionOverridesForm(formData);

    savePersistedConnectionSettings(runtime.database, nextSettings);
    savePersistedSearchSafetyOverrides(runtime.database, nextOverrides);
    savePersistedReleaseSelectionOverrides(
      runtime.database,
      runtime.config,
      nextReleaseSelectionOverrides
    );

    return buildRedirect(request, {
      notice: 'saved',
      status: 'success',
    });
  } catch (error) {
    return buildRedirect(request, {
      notice: error instanceof Error ? error.message : 'Unable to save settings',
      status: 'error',
    });
  }
}
