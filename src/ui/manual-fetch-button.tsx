'use client';

import { useState } from 'react';

type FetchState = 'idle' | 'loading' | 'queued' | 'error';

export const ManualFetchButton = ({
  mediaKey,
  csrfToken,
  label,
  title,
  liveEnabled,
}: {
  mediaKey: string;
  csrfToken: string;
  label: string;
  title: string;
  liveEnabled: boolean;
}) => {
  const [state, setState] = useState<FetchState>('idle');

  const isBusy = state === 'loading' || state === 'queued';
  const buttonLabel =
    state === 'loading'
      ? 'Queuing...'
      : state === 'queued'
        ? 'Queued ✓'
        : state === 'error'
          ? 'Failed - retry'
          : label;

  const tooltip = liveEnabled
    ? 'Manually trigger a scoped search for this item now. This overrides normal cooldown and rolling search limits.'
    : 'Manual fetch is blocked until Live dispatch mode is enabled.';

  const handleClick = async () => {
    if (!liveEnabled || isBusy) {
      return;
    }

    setState('loading');

    const formData = new FormData();
    formData.set('csrfToken', csrfToken);
    formData.set('mediaKey', mediaKey);

    try {
      const response = await fetch('/api/actions/manual-fetch', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
        },
        body: formData,
      });

      const payload = (await response.json()) as {
        accepted?: boolean;
        redirectTo?: string;
      };

      if (!response.ok || !payload.accepted || !payload.redirectTo) {
        throw new Error('Manual fetch failed');
      }

      setState('queued');
      window.setTimeout(() => {
        window.location.assign(payload.redirectTo!);
      }, 700);
    } catch {
      setState('error');
      window.setTimeout(() => {
        setState('idle');
      }, 4000);
    }
  };

  return (
    <button
      type="button"
      className="candidate-action-button"
      title={tooltip}
      aria-label={`Manual fetch ${title}`}
      onClick={handleClick}
      disabled={!liveEnabled || isBusy}
    >
      {buttonLabel}
    </button>
  );
};
