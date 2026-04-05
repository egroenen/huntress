'use client';

import { useEffect, useMemo, useState } from 'react';

const formatRelativeTime = (targetIso: string, nowMs: number): string => {
  const targetTime = new Date(targetIso).getTime();

  if (!Number.isFinite(targetTime)) {
    return 'n/a';
  }

  const diffMs = targetTime - nowMs;
  const diffMinutes = Math.round(Math.abs(diffMs) / 60_000);

  if (diffMinutes < 1) {
    return diffMs >= 0 ? 'in under a minute' : 'under a minute ago';
  }

  if (diffMinutes < 60) {
    return diffMs >= 0 ? `in ${diffMinutes} min` : `${diffMinutes} min ago`;
  }

  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  const suffix = minutes > 0 ? ` ${minutes} min` : '';

  return diffMs >= 0 ? `in ${hours} hr${suffix}` : `${hours} hr${suffix} ago`;
};

const formatAbsoluteTime = (isoTimestamp: string): string => {
  const date = new Date(isoTimestamp);

  if (!Number.isFinite(date.getTime())) {
    return isoTimestamp;
  }

  return new Intl.DateTimeFormat('en-NZ', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

export const RelativeTimeLabel = ({
  isoTimestamp,
  className,
}: {
  isoTimestamp: string | null;
  className?: string;
}) => {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 30_000);

    return () => window.clearInterval(interval);
  }, []);

  const label = useMemo(() => {
    if (!isoTimestamp) {
      return 'n/a';
    }

    return formatRelativeTime(isoTimestamp, nowMs);
  }, [isoTimestamp, nowMs]);

  return (
    <span
      className={className}
      title={isoTimestamp ? formatAbsoluteTime(isoTimestamp) : undefined}
    >
      {label}
    </span>
  );
};
