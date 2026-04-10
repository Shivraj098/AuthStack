import { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'
import { AppError, ValidationError } from '../utils/error.js'
import { env } from '../config/env.js'

interface ErrorResponse {
  success: false
  error: {
    code: string
    message: string
    fields?: Record<string, string[]>
    requestId: string
    stack?: string // ✅ moved here (optional always)
  }
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = req.id ?? 'unknown' // ✅ safety fallback

  // Zod validation errors
  if (err instanceof ZodError) {
    const fields: Record<string, string[]> = {}

    err.issues.forEach((e) => {
      // ✅ use .issues (Zod v4 safe)
      const path = e.path.join('.')
      if (!fields[path]) fields[path] = []
      fields[path].push(e.message)
    })

    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        fields,
        requestId,
      },
    } satisfies ErrorResponse)

    return
  }

  // AppError handling
  if (err instanceof AppError) {
    const response: ErrorResponse = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        requestId,
        ...(err instanceof ValidationError && err.fields ? { fields: err.fields } : {}),
      },
    }

    if (env.NODE_ENV === 'development' && err instanceof Error && err.stack) {
      response.error.stack = err.stack
    }

    if (!err.isOperational && err instanceof Error) {
      console.error('NON-OPERATIONAL ERROR:', err)
    }

    res.status(err.statusCode).json(response)
    return
  }

  // Unknown error
  console.error('UNHANDLED ERROR:', err)

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      requestId,
    },
  } satisfies ErrorResponse)
}
