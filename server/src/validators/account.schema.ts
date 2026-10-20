import { z } from 'zod'

export const accountActivityQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const sessionIdParamsSchema = z.object({
  id: z.string().uuid('Invalid session ID'),
})

export type AccountActivityQuery = z.infer<typeof accountActivityQuerySchema>

export type SessionIdParams = z.infer<typeof sessionIdParamsSchema>
