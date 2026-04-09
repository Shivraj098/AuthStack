import { z } from 'zod'
import dotenv from 'dotenv'

dotenv.config({ path: '../../.env' })

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().transform(Number).pipe(z.number().min(1).max(65535)).default(3000),

  DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),

  REDIS_URL: z.string().url('REDIS_URL must be a valid URL'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.string().transform(Number).pipe(z.number()).default(587),
  SMTP_USER: z.string(),
  SMTP_PASS: z.string(),

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
