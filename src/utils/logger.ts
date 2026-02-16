import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: isDev ? 'debug' : 'info',
  redact: {
    paths: [
      '*.token',
      '*.key',
      '*.secret',
      '*.refreshToken',
      '*.access_token',
    ],
    censor: '[REDACTED]',
  },
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
  }),
});
