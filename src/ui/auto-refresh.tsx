'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export const AutoRefresh = ({
  intervalMs,
  enabled = true,
}: {
  intervalMs: number;
  enabled?: boolean;
}) => {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handle = window.setInterval(() => {
      router.refresh();
    }, intervalMs);

    return () => {
      window.clearInterval(handle);
    };
  }, [enabled, intervalMs, router]);

  return null;
};
