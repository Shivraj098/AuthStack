import pino from 'pino'
import { env } from './env.js'

export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',

  // In development: pretty-print for readability
  // In production: raw JSON for log aggregators (Datadog, CloudWatch, etc.)
  ...(env.NODE_ENV === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),

  // Redact sensitive fields — they NEVER appear in logs even accidentally
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'body.password',
      'body.currentPassword',
      'body.newPassword',
      'body.token',
      '*.passwordHash',
      '*.secret',
    ],
    censor: '[REDACTED]',
  },

  base: {
    service: 'auth-app',
    env: env.NODE_ENV,
  },
})
