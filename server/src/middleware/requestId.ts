import { Request, Response, NextFunction } from 'express'
import { randomUUID } from 'crypto'

declare global {
  /* eslint-disable @typescript-eslint/no-namespace */
  namespace Express {
    interface Request {
      id: string
    }
  }
}

export function requestIdMiddleware(req: Request, _res: Response, next: NextFunction): void {
  req.id = randomUUID()
  next()
}
