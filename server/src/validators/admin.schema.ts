import { z } from 'zod'

export const adminUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(100).optional(),
})

export const adminUserIdParamsSchema = z.object({
  id: z.string().uuid('Invalid user ID'),
})

export const adminRoleBodySchema = z.object({
  role: z.string().min(1, 'Role is required'),
})

export const adminAuditLogsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    userId: z.string().uuid('Invalid user ID').optional(),
    event: z.string().trim().min(1).max(100).optional(),
    startDate: z.iso.date().optional(),
    endDate: z.iso.date().optional(),
    ip: z.string().trim().min(1).max(45).optional(),
  })
  .refine(({ startDate, endDate }) => !startDate || !endDate || startDate <= endDate, {
    message: 'End date must be on or after start date',
    path: ['endDate'],
  })

export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>

export type AdminUserIdParams = z.infer<typeof adminUserIdParamsSchema>

export type AdminRoleBody = z.infer<typeof adminRoleBodySchema>

export type AdminAuditLogsQuery = z.infer<typeof adminAuditLogsQuerySchema>
