'use client';

import { useActionState, useEffect } from 'react';

type FetchState = 'idle' | 'loading' | 'queued' | 'error';
type ManualFetchActionState = {
  status: 'idle' | 'queued' | 'error';
  message: string | null;
  redirectTo: string | null;
};

export const ManualFetchButton = ({
  action,
  mediaKey,
  csrfToken,
  label,
  title,
  liveEnabled,
}: {
  action: (
    state: ManualFetchActionState,
    formData: FormData
  ) => Promise<ManualFetchActionState>;
  mediaKey: string;
  csrfToken: string;
  label: string;
  title: string;
  liveEnabled: boolean;
}) => {
  const [result, formAction, pending] = useActionState(action, {
    status: 'idle',
    message: null,
    redirectTo: null,
  });
  const state: FetchState = pending
    ? 'loading'
    : result.status === 'queued'
      ? 'queued'
      : result.status === 'error'
        ? 'error'
        : 'idle';

  const isBusy = state === 'loading' || state === 'queued';
  const buttonLabel =
    state === 'loading'
      ? 'Queuing...'
      : state === 'queued'
        ? 'Queued ✓'
        : state === 'error'
          ? 'Failed - retry'
          : label;

  const tooltip =
    !liveEnabled
      ? 'Manual fetch is blocked until Live dispatch mode is enabled.'
      : state === 'error' && result.message
        ? result.message
        : 'Manually trigger a scoped search for this item now. This overrides normal cooldown and rolling search limits.';

  useEffect(() => {
    if (!result.redirectTo) {
      return;
    }

    const timeout = window.setTimeout(() => {
      window.location.assign(result.redirectTo!);
    }, 700);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [result.redirectTo]);

  return (
    <form action={formAction}>
      <input type="hidden" name="csrfToken" value={csrfToken} />
      <input type="hidden" name="mediaKey" value={mediaKey} />
      <button
        type="submit"
        className="candidate-action-button"
        title={tooltip}
        aria-label={`Manual fetch ${title}`}
        disabled={!liveEnabled || isBusy}
      >
        {buttonLabel}
      </button>
    </form>
  );
};
