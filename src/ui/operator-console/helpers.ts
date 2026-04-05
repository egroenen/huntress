import type { ReactNode } from 'react';

export const navigationItems: Array<{
  href:
    | '/'
    | '/status'
    | '/runs'
    | '/candidates'
    | '/suppressions'
    | '/transmission'
    | '/settings';
  label: string;
  badge?: string;
}> = [
  { href: '/', label: 'Overview' },
  { href: '/status', label: 'Status' },
  { href: '/runs', label: 'Runs' },
  { href: '/candidates', label: 'Candidates' },
  { href: '/suppressions', label: 'Suppressions' },
  { href: '/transmission', label: 'Transmission' },
  { href: '/settings', label: 'Settings' },
];

export const formatConsoleTimestamp = (value: string | null): string => {
  if (!value) {
    return 'n/a';
  }

  return new Intl.DateTimeFormat('en-NZ', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
};

export const normalizeBadgeStatus = (status: string): string => {
  return [
    'healthy',
    'degraded',
    'unavailable',
    'running',
    'success',
    'info',
    'partial',
    'failed',
  ].includes(status)
    ? status
    : 'degraded';
};

export interface TableColumn {
  key: string;
  label: ReactNode;
  align?: 'left' | 'right';
}
