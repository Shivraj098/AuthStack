import type { Request, Response, NextFunction } from 'express'
import { adminService } from '../services/admin.service.js'
import type {
  AdminAuditLogsQuery,
  AdminRoleBody,
  AdminUsersQuery,
} from '../validators/admin.schema.js'
import { AuthenticationError, ValidationError } from '../utils/error.js'

function getRequiredParam(req: Request, name: string): string {
  const param = req.params[name]
  const value = Array.isArray(param) ? param[0] : param

  if (!value) {
    throw new ValidationError('Validation failed', {
      [name]: [`${name} is required`],
    })
  }

  return value
}

class AdminController {
  async listUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = req.query as unknown as AdminUsersQuery
      const result = await adminService.listUsers(query)

      res.json({ success: true, data: result })
    } catch (error) {
      next(error)
    }
  }

  async getUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = getRequiredParam(req, 'id')
      const user = await adminService.getUserById(id)

      res.json({ success: true, data: user })
    } catch (error) {
      next(error)
    }
  }

  async assignRole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = getRequiredParam(req, 'id')
      const adminId = req.user?.sub

      if (!adminId) {
        throw new AuthenticationError()
      }

      const { role } = req.body as AdminRoleBody
      const result = await adminService.assignRole(id, role, adminId)

      res.json({ success: true, data: result })
    } catch (error) {
      next(error)
    }
  }

  async removeRole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = getRequiredParam(req, 'id')
      const adminId = req.user?.sub

      if (!adminId) {
        throw new AuthenticationError()
      }

      const { role } = req.body as AdminRoleBody
      const result = await adminService.removeRole(id, role, adminId)

      res.json({ success: true, data: result })
    } catch (error) {
      next(error)
    }
  }

  async toggleActive(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = getRequiredParam(req, 'id')
      const adminId = req.user?.sub

      if (!adminId) {
        throw new AuthenticationError()
      }

      const result = await adminService.toggleUserActive(id, adminId)

      res.json({ success: true, data: result })
    } catch (error) {
      next(error)
    }
  }

  async getAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page, limit, userId, event, startDate, endDate, ip } =
        req.query as unknown as AdminAuditLogsQuery

      const result = await adminService.getAuditLogs({
        page,
        limit,
        ...(userId !== undefined && { userId }),
        ...(event !== undefined && { event }),
        ...(startDate !== undefined && { startDate }),
        ...(endDate !== undefined && { endDate }),
        ...(ip !== undefined && { ip }),
      })

      res.json({ success: true, data: result })
    } catch (error) {
      next(error)
    }
  }

  async listRoles(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const roles = await adminService.listRoles()

      res.json({ success: true, data: roles })
    } catch (error) {
      next(error)
    }
  }
}

export const adminController = new AdminController()
