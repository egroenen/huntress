import type { ResolvedConfig } from '@/src/config';
import type { MediaItemStateRecord } from '@/src/db';

const buildAppUrl = (baseUrl: string, path: string): string => {
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\//, ''), normalizedBaseUrl).toString();
};

const splitSonarrEpisodeTitle = (
  title: string
): { seriesTitle: string; episodeTitle: string } | null => {
  const delimitedParts = title.split(' - ');

  if (delimitedParts.length >= 2) {
    const [seriesTitle, ...episodeParts] = delimitedParts;
    const episodeTitle = episodeParts.join(' - ').trim();

    if (seriesTitle && episodeTitle) {
      return {
        seriesTitle: seriesTitle.trim(),
        episodeTitle,
      };
    }
  }

  const seasonEpisodeMatch = title.match(/^(.*?)(\sS\d{1,2}\s?E\d{1,2}.*)$/i);

  if (seasonEpisodeMatch?.[1] && seasonEpisodeMatch[2]) {
    return {
      seriesTitle: seasonEpisodeMatch[1].trim(),
      episodeTitle: seasonEpisodeMatch[2].trim(),
    };
  }

  const sceneStyleMatch = title.match(/^(.*?)(\s\d{1,2}x\d{1,2}.*)$/i);

  if (sceneStyleMatch?.[1] && sceneStyleMatch[2]) {
    return {
      seriesTitle: sceneStyleMatch[1].trim(),
      episodeTitle: sceneStyleMatch[2].trim(),
    };
  }

  return null;
};

const getMediaItemHref = (
  config: ResolvedConfig,
  mediaItem: MediaItemStateRecord | null
): string | null => {
  if (!mediaItem) {
    return null;
  }

  if (mediaItem.mediaType === 'sonarr_episode' && mediaItem.externalPath) {
    return buildAppUrl(config.instances.sonarr.url, mediaItem.externalPath);
  }

  if (mediaItem.mediaType === 'radarr_movie' && mediaItem.externalPath) {
    return buildAppUrl(config.instances.radarr.url, mediaItem.externalPath);
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
  const sonarrDisplayTitle =
    mediaItem?.mediaType === 'sonarr_episode' ? splitSonarrEpisodeTitle(title) : null;
  const content = sonarrDisplayTitle ? (
    <span className="external-item-link__content">
      <span className="external-item-link__primary">{sonarrDisplayTitle.seriesTitle}</span>
      <span className="secondary-value">{sonarrDisplayTitle.episodeTitle}</span>
    </span>
  ) : (
    title
  );

  if (!href) {
    return <>{content}</>;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={className}
      title={`Open in ${mediaItem?.mediaType === 'radarr_movie' ? 'Radarr' : 'Sonarr'}`}
    >
      {content}
    </a>
  );
};
