import type { NextFunction, Request, Response } from 'express'
import { env } from '../config/env.js'
import { AppError } from '../utils/error.js'

const trustedOrigin = new URL(env.CLIENT_URL).origin

export function requireTrustedOrigin(req: Request, _res: Response, next: NextFunction): void {
  const origin = req.get('origin')

  // Requests from non-browser clients may omit Origin.
  if (!origin) {
    next()
    return
  }

  let requestOrigin: string

  try {
    requestOrigin = new URL(origin).origin
  } catch {
    next(new AppError('Untrusted request origin', 403, 'UNTRUSTED_ORIGIN'))
    return
  }

  if (requestOrigin !== trustedOrigin) {
    next(new AppError('Untrusted request origin', 403, 'UNTRUSTED_ORIGIN'))
    return
  }

  next()
}
