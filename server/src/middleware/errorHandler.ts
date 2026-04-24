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
    stack?: string
  }
}

/**
 * Type guard for the plain validation error thrown by your validate middleware.
 * This is the reliable, instanceof-free way to catch it (avoids the original ZodError problem).
 */
const isPlainValidationError = (
  err: unknown
): err is { code: 'VALIDATION_ERROR'; fields?: Record<string, string[]> } => {
  return err != null && typeof err === 'object' && 'code' in err && err.code === 'VALIDATION_ERROR'
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = req.id ?? 'unknown'

  // 1. Raw ZodError (kept for any other places that might still throw it)
  if (err instanceof ZodError) {
    const fields: Record<string, string[]> = {}

    err.issues.forEach((e) => {
      const path = e.path.join('.') || 'general'
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

  // 2. Plain validation error from validate.ts middleware ← THIS WAS MISSING
  if (isPlainValidationError(err)) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        fields: err.fields ?? {},
        requestId,
      },
    } satisfies ErrorResponse)

    return
  }

  // 3. AppError / ValidationError (your custom error classes)
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

  // 4. Unknown / unhandled error
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
