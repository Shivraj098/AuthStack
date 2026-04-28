import { z } from 'zod'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const envPath = path.resolve(__dirname, '../../../.env')

dotenv.config({ path: envPath })

const expiresInSchema = z.union([
  z.number(),
  z.string().regex(/^\d+(s|m|h|d)$/), // "15m", "7d", "1h"
])

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().transform(Number).pipe(z.number().min(1).max(65535)).default(3000),

  DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),

  REDIS_URL: z.string().url('REDIS_URL must be a valid URL'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),

  JWT_ACCESS_EXPIRES_IN: expiresInSchema.default('15m'),
  JWT_REFRESH_EXPIRES_IN: expiresInSchema.default('7d'),

  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.string().transform(Number).pipe(z.number()).default(587),
  SMTP_USER: z.string(),
  SMTP_PASS: z.string(),

  SERVER_URL: z
    .string()
    .trim()
    .url('SERVER_URL must be a valid URL')
    .transform((val) => val.replace(/\/+$/, ''))
    .default('http://localhost:3000'), // auto-remove trailing slash

  GOOGLE_CLIENT_ID: z
    .string()
    .optional()
    .transform((v) => v?.trim()),
  GOOGLE_CLIENT_SECRET: z
    .string()
    .optional()
    .transform((v) => v?.trim()),
  GITHUB_CLIENT_ID: z
    .string()
    .optional()
    .transform((v) => v?.trim()),
  GITHUB_CLIENT_SECRET: z
    .string()
    .optional()
    .transform((v) => v?.trim()),

  CLIENT_URL: z.string().url(),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Invalid environment variables:\n')
  parsed.error.issues.forEach((issue) => {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`)
  })
  process.exit(1)
}

export const env = parsed.data
