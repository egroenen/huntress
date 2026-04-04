'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export const AutoRefresh = ({ intervalMs }: { intervalMs: number }) => {
  const router = useRouter();

  useEffect(() => {
    const handle = window.setInterval(() => {
      router.refresh();
    }, intervalMs);

    return () => {
      window.clearInterval(handle);
    };
  }, [intervalMs, router]);

  return null;
};
