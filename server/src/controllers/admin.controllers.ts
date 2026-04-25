import { Request, Response } from 'express'
import { adminService } from '../services/admin.service.js'
import { z } from 'zod'

const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
})
const roleSchema = z.object({
  role: z.string().min(1, 'Role is required'),
})

function getparams(param: string | string[] | undefined): string | undefined {
  return Array.isArray(param) ? param[0] : param
}

class AdminController {
  async listUsers(req: Request, res: Response): Promise<void> {
    const query = paginationSchema.parse(req.query)
    try {
      const result = await adminService.listUsers(query)
      res.json({ success: true, data: result })
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
      })
    }
  }

  async getUser(req: Request, res: Response): Promise<void> {
    const id = getparams(req.params['id'])

    try {
      if (!id) {
        res.status(400).json({ success: false, message: 'User ID is required' })
        return
      }
    } catch (err) {
      res
        .status(401)
        .json({ success: false, message: err instanceof Error ? err.message : 'Unauthorized' })
      return
    }

    const user = await adminService.getUserById(id)
    res.json({ success: true, data: user })
  }

  async assignRole(req: Request, res: Response): Promise<void> {
    const id = getparams(req.params['id'])
    const { role } = roleSchema.parse(req.body)
    try {
      const result = await adminService.assignRole(id!, role, req.user!.sub)
      res.json({ success: true, data: result })
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
      })
    }
  }

  async removeRole(req: Request, res: Response): Promise<void> {
    const id = getparams(req.params['id'])

    if (!id) {
      res.status(400).json({
        success: false,
        message: 'User ID is required',
      })
      return
    }

    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized',
      })
      return
    }

    const { role } = roleSchema.parse(req.body)

    try {
      const result = await adminService.removeRole(id, role, req.user.sub)
      res.json({ success: true, data: result })
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
      })
    }
  }
  async toggleActive(req: Request, res: Response): Promise<void> {
    const id = getparams(req.params['id'])
    try {
      const result = await adminService.toggleUserActive(id!, req.user!.sub)
      res.json({ success: true, data: result })
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
      })
    }
  }

  async getAuditLogs(req: Request, res: Response): Promise<void> {
    const {
      page = '1',
      limit = '25',
      userId,
      event,
      startDate,
      endDate,
      ip,
    } = req.query as Record<string, string | undefined>

    const result = await adminService.getAuditLogs({
      page: Number(page),
      limit: Math.min(Number(limit), 100),
      ...(userId !== undefined && { userId }),
      ...(event !== undefined && { event }),
      ...(startDate !== undefined && { startDate }),
      ...(endDate !== undefined && { endDate }),
      ...(ip !== undefined && { ip }),
    })

    res.json({ success: true, data: result })
  }

  async listRoles(req: Request, res: Response): Promise<void> {
    const roles = await adminService.listRoles()
    res.json({ success: true, data: roles })
  }
}

export const adminController = new AdminController()
