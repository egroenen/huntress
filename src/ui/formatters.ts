export const formatDisplayMode = (mode: 'dry-run' | 'live'): string =>
  mode === 'live' ? 'Live dispatch' : 'Dry-run';

export const formatServiceName = (value: string): string => {
  if (value.length === 0) {
    return value;
  }

  return `${value[0]?.toUpperCase() ?? ''}${value.slice(1)}`;
};

export const formatRunTypeLabel = (value: string): string => value.replaceAll('_', ' ');

export const formatShortRunId = (value: string | null): string => {
  if (!value) {
    return 'n/a';
  }

  const parts = value.split('_');
  const lastPart = parts.at(-1) ?? value;

  if (lastPart.length <= 8) {
    return value;
  }

  const prefix = parts.length > 1 ? `${parts.slice(0, -1).join(' ')} · ` : '';

  return `${prefix}${lastPart.slice(-8)}`;
};
