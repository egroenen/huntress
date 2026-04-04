import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: {
    service: 'edarr',
  },
  redact: {
    paths: [
      'auth.sessionSecret',
      '*.sessionSecret',
      '*.apiKey',
      '*.password',
      '*.username',
      'headers.authorization',
      'headers.Authorization',
      'headers.x-api-key',
      'headers.X-Api-Key',
      'cookie',
      'cookies',
      'config.auth.sessionSecret',
      'config.instances.sonarr.apiKey',
      'config.instances.radarr.apiKey',
      'config.instances.prowlarr.apiKey',
      'config.instances.transmission.username',
      'config.instances.transmission.password',
    ],
    censor: '[redacted]',
  },
});

export const configureLogger = (level: string): void => {
  logger.level = level;
};
