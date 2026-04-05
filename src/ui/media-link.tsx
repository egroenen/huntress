import type { ResolvedConfig } from '@/src/config';
import type { MediaItemStateRecord } from '@/src/db';

const buildAppUrl = (baseUrl: string, path: string): string => {
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\//, ''), normalizedBaseUrl).toString();
};

const getMediaItemHref = (
  config: ResolvedConfig,
  mediaItem: MediaItemStateRecord | null
): string | null => {
  if (!mediaItem) {
    return null;
  }

  if (mediaItem.mediaType === 'sonarr_episode') {
    const seriesId = mediaItem.parentArrId;

    if (seriesId === null) {
      return null;
    }

    return buildAppUrl(config.instances.sonarr.url, `series/${seriesId}`);
  }

  if (mediaItem.mediaType === 'radarr_movie') {
    return buildAppUrl(config.instances.radarr.url, `movie/${mediaItem.arrId}`);
  }

  return null;
};

export const MediaItemLink = ({
  config,
  mediaItem,
  fallbackTitle,
  className,
}: {
  config: ResolvedConfig;
  mediaItem: MediaItemStateRecord | null;
  fallbackTitle: string;
  className?: string;
}) => {
  const href = getMediaItemHref(config, mediaItem);
  const title = mediaItem?.title ?? fallbackTitle;

  if (!href) {
    return <>{title}</>;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={className}
      title={`Open in ${mediaItem?.mediaType === 'radarr_movie' ? 'Radarr' : 'Sonarr'}`}
    >
      {title}
    </a>
  );
};
