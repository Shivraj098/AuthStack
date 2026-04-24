import { Request, Response, NextFunction } from 'express'
import { ZodTypeAny } from 'zod'

type ValidateTarget = 'body' | 'query' | 'params'

/**
 * Lightweight error shape that matches what your global error handler expects.
 * This avoids `any`, `as any`, and any "multiple constructor" problems.
 */
interface ValidationError extends Error {
  code: 'VALIDATION_ERROR'
  fields: Record<string, string[]>
}

export function validate<T extends ZodTypeAny = ZodTypeAny>(
  schema: T,
  target: ValidateTarget = 'body'
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target])

    if (!result.success) {
      // Build fields exactly as your test expects
      const fields: Record<string, string[]> = {}

      result.error.issues.forEach((issue) => {
        const path = issue.path.join('.') || 'general'
        if (!fields[path]) fields[path] = []
        fields[path].push(issue.message)
      })

      // Industry-standard way to create a typed custom error (no `any`, no unused imports)
      const err = new Error('Validation failed') as ValidationError
      err.code = 'VALIDATION_ERROR'
      err.fields = fields
      err.name = 'ValidationError' // helps with logging / debugging

      next(err)
      return
    }

    // Success path – safe assignment with proper TypeScript narrowing
    switch (target) {
      case 'body':
        req.body = result.data
        break
      case 'query':
        Object.assign(req.query, result.data)
        break
      case 'params':
        req.params = result.data as Request['params']
        break
    }

    next()
  }
}
