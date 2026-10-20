import { Router } from 'express'
import { adminController } from '../controllers/admin.controllers.js'
import { requireAuth, requireRole } from '../middleware/requireAuth.js'
import { validate } from '../middleware/validate.js'
import {
  adminAuditLogsQuerySchema,
  adminRoleBodySchema,
  adminUserIdParamsSchema,
  adminUsersQuerySchema,
} from '../validators/admin.schema.js'
const router = Router()

// Every admin route requires authentication AND the admin role
// Middleware runs left to right — auth check before role check
router.use(requireAuth)
router.use(requireRole('admin'))

router.get(
  '/users',
  validate(adminUsersQuerySchema, 'query'),
  adminController.listUsers.bind(adminController)
)

router.get(
  '/users/:id',
  validate(adminUserIdParamsSchema, 'params'),
  adminController.getUser.bind(adminController)
)

router.post(
  '/users/:id/roles',
  validate(adminUserIdParamsSchema, 'params'),
  validate(adminRoleBodySchema),
  adminController.assignRole.bind(adminController)
)

router.delete(
  '/users/:id/roles',
  validate(adminUserIdParamsSchema, 'params'),
  validate(adminRoleBodySchema),
  adminController.removeRole.bind(adminController)
)

router.patch(
  '/users/:id/toggle-active',
  validate(adminUserIdParamsSchema, 'params'),
  adminController.toggleActive.bind(adminController)
)

router.get(
  '/audit-logs',
  validate(adminAuditLogsQuerySchema, 'query'),
  adminController.getAuditLogs.bind(adminController)
)

router.get('/roles', adminController.listRoles.bind(adminController))

export default router
