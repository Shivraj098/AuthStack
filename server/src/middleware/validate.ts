import { Request, Response, NextFunction } from 'express'
import { ZodTypeAny } from 'zod'

type ValidateTarget = 'body' | 'query' | 'params'

export function validate<T extends ZodTypeAny>(schema: T, target: ValidateTarget = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target])

    if (!result.success) {
      next(result.error)
      return
    }

    // Safe assignment with narrowing
    switch (target) {
      case 'body':
        req.body = result.data
        break
      case 'query':
        req.query = result.data as Request['query']
        break
      case 'params':
        req.params = result.data as Request['params']
        break
    }

    next()
  }
}
