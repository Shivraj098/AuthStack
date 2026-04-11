import { z } from 'zod'

// Reusable field definitions
const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Email is required')
  .email('Invalid email address')

const passwordField = z
  .string()
  .min(1, 'Password is required')
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must not exceed 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character')

export const registerSchema = z.object({
  email: emailField,
  password: passwordField,
  firstName: z.string().trim().min(1, 'First name is required').max(50).optional(),
  lastName: z.string().trim().min(1, 'Last name is required').max(50).optional(),
})

export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Token is required'),
})

export const resendVerificationSchema = z.object({
  email: emailField,
})

// TypeScript types inferred directly from Zod schemas
// No duplication — schema IS the type definition
export type RegisterInput = z.infer<typeof registerSchema>
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>
