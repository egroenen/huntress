export const formatDisplayMode = (mode: 'dry-run' | 'live'): string =>
  mode === 'live' ? 'Live dispatch' : 'Dry-run';

export const formatServiceName = (value: string): string => {
  const normalized = value.trim().toLowerCase();

  switch (normalized) {
    case 'sonarr':
      return 'Sonarr';
    case 'radarr':
      return 'Radarr';
    case 'prowlarr':
      return 'Prowlarr';
    case 'transmission':
      return 'Transmission';
    case 'scheduler':
      return 'Scheduler';
    default:
      return normalized
        .split(/[\s_-]+/)
        .filter(Boolean)
        .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
        .join(' ');
  }
};

export const formatRunTypeLabel = (value: string): string =>
  value
    .replaceAll('_', ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ');

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
