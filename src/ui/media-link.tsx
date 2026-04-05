import type { ResolvedConfig } from '@/src/config';
import type { MediaItemStateRecord } from '@/src/db';

const buildAppUrl = (baseUrl: string, path: string): string => {
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\//, ''), normalizedBaseUrl).toString();
};

const slugify = (value: string): string => {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
};

const deriveSonarrSeriesSlug = (title: string): string | null => {
  const fromDelimitedTitle = title.includes(' - ')
    ? title.split(' - ')[0] ?? title
    : title;
  const strippedEpisodeSuffix = fromDelimitedTitle
    .replace(/\sS\d{1,2}\s?E\d{1,2}.*$/i, '')
    .replace(/\s\d{1,2}x\d{1,2}.*$/i, '')
    .trim();
  const slug = slugify(strippedEpisodeSuffix);

  return slug.length > 0 ? slug : null;
};

const getMediaItemHref = (
  config: ResolvedConfig,
  mediaItem: MediaItemStateRecord | null
): string | null => {
  if (!mediaItem) {
    return null;
  }

  if (mediaItem.mediaType === 'sonarr_episode') {
    const derivedSlug = deriveSonarrSeriesSlug(mediaItem.title);

    if (derivedSlug) {
      return buildAppUrl(config.instances.sonarr.url, `series/${derivedSlug}`);
    }

    if (mediaItem.parentArrId !== null) {
      return buildAppUrl(config.instances.sonarr.url, `series/${mediaItem.parentArrId}`);
    }

    return null;
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
