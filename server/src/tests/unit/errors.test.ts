import { describe, it, expect } from 'vitest'
import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
} from '../../utils/error.js'

describe('Custom error classes', () => {
  it('AppError has correct properties', () => {
    const err = new AppError('test message', 400, 'TEST_CODE')

    expect(err.message).toBe('test message')
    expect(err.statusCode).toBe(400)
    expect(err.code).toBe('TEST_CODE')
    expect(err.isOperational).toBe(true)
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(AppError)
  })

  it('ValidationError defaults to 400 with VALIDATION_ERROR code', () => {
    const err = new ValidationError('Validation failed', {
      email: ['Invalid email'],
    })

    expect(err.statusCode).toBe(400)
    expect(err.code).toBe('VALIDATION_ERROR')
    expect(err.fields?.email).toContain('Invalid email')
  })

  it('AuthenticationError defaults to 401', () => {
    const err = new AuthenticationError()
    expect(err.statusCode).toBe(401)
    expect(err.code).toBe('AUTHENTICATION_ERROR')
    expect(err.message).toBe('Authentication required')
  })

  it('AuthorizationError defaults to 403', () => {
    const err = new AuthorizationError()
    expect(err.statusCode).toBe(403)
    expect(err.code).toBe('AUTHORIZATION_ERROR')
  })

  it('NotFoundError defaults to 404', () => {
    const err = new NotFoundError('User')
    expect(err.statusCode).toBe(404)
    expect(err.message).toBe('User not found')
  })

  it('ConflictError defaults to 409', () => {
    const err = new ConflictError('Email already exists')
    expect(err.statusCode).toBe(409)
  })

  it('RateLimitError defaults to 429', () => {
    const err = new RateLimitError()
    expect(err.statusCode).toBe(429)
    expect(err.code).toBe('RATE_LIMIT_EXCEEDED')
  })

  it('non-operational error has isOperational false', () => {
    const err = new AppError('db crashed', 500, 'DB_ERROR', false)
    expect(err.isOperational).toBe(false)
  })
})
