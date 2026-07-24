import type { FastifyServerOptions } from 'fastify';

type FastifyLoggerOptions = NonNullable<FastifyServerOptions['logger']>;

export function getFastifyLoggerOptions(): FastifyLoggerOptions {
  if (process.env.NODE_ENV === 'production') {
    return {
      level: 'info',
    };
  }

  return {
    level: 'debug',
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
      },
    },
  };
}
