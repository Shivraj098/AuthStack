import { Request, Response, NextFunction } from 'express'
import { logger } from '../config/logger.js'

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now()

  // Log when response finishes — not when request arrives
  // This way we can log the status code and duration together
  res.on('finish', () => {
    const ms = Date.now() - start
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'

    logger[level](
      {
        requestId: req.id,
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        ms,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        // Only log userId if the request was authenticated
        userId: req.user?.sub ?? undefined,
      },
      `${req.method} ${req.url} ${res.statusCode} ${ms}ms`
    )
  })

  next()
}
