import { prisma } from '../config/database.js'
import { NotFoundError, ConflictError, AppError } from '../utils/error.js'

interface PaginationParams {
  page: number
  limit: number
  search?: string | undefined
}

class AdminService {
  // ─── List users ────────────────────────────────────────────────
  async listUsers({ page, limit, search }: PaginationParams) {
    const skip = (page - 1) * limit

    const where = search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' as const } },
            { firstName: { contains: search, mode: 'insensitive' as const } },
            { lastName: { contains: search, mode: 'insensitive' as const } },
          ],
          deletedAt: null,
        }
      : { deletedAt: null }

    // Run count and data fetch in parallel — faster than sequential
    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          isVerified: true,
          isActive: true,
          createdAt: true,
          // Never select passwordHash in any admin query
          roles: {
            select: { role: { select: { name: true } } },
          },
          _count: {
            select: { refreshTokens: true },
          },
        },
      }),
    ])

    return {
      users: users.map((u) => ({
        ...u,
        roles: u.roles.map((ur) => ur.role.name),
        activeSessions: u._count.refreshTokens,
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    }
  }

  // ─── Get single user ───────────────────────────────────────────
  async getUserById(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        isVerified: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        roles: {
          select: {
            role: { select: { id: true, name: true } },
            assignedAt: true,
          },
        },
        oauthAccounts: {
          select: { provider: true, createdAt: true },
        },
        _count: {
          select: {
            refreshTokens: true,
            auditLogs: true,
          },
        },
      },
    })

    if (!user) throw new NotFoundError('User')

    return {
      ...user,
      roles: user.roles.map((ur) => ({
        name: ur.role.name,
        assignedAt: ur.assignedAt,
      })),
    }
  }

  // ─── Assign role ───────────────────────────────────────────────
  async assignRole(targetUserId: string, roleName: string, assignedByUserId: string) {
    const [user, role] = await Promise.all([
      prisma.user.findUnique({
        where: { id: targetUserId, deletedAt: null },
        select: { id: true, email: true },
      }),
      prisma.role.findUnique({
        where: { name: roleName },
        select: { id: true, name: true },
      }),
    ])

    if (!user) throw new NotFoundError('User')
    if (!role) throw new NotFoundError('Role')

    // Check if user already has this role
    const existing = await prisma.userRole.findUnique({
      where: {
        userId_roleId: {
          userId: targetUserId,
          roleId: role.id,
        },
      },
    })

    if (existing) {
      throw new ConflictError(`User already has the '${roleName}' role`)
    }

    await prisma.userRole.create({
      data: {
        userId: targetUserId,
        roleId: role.id,
        assignedBy: assignedByUserId,
      },
    })

    await prisma.auditLog.create({
      data: {
        userId: assignedByUserId,
        event: 'ROLE_ASSIGNED',
        metadata: {
          targetUserId,
          targetEmail: user.email,
          role: roleName,
        },
      },
    })

    return { message: `Role '${roleName}' assigned to ${user.email}` }
  }

  // ─── Remove role ───────────────────────────────────────────────
  async removeRole(targetUserId: string, roleName: string, removedByUserId: string) {
    const role = await prisma.role.findUnique({
      where: { name: roleName },
      select: { id: true },
    })

    if (!role) throw new NotFoundError('Role')

    // Prevent removing the last role — user must always have at least one
    const userRoles = await prisma.userRole.findMany({
      where: { userId: targetUserId },
    })

    if (userRoles.length <= 1) {
      throw new AppError('Cannot remove the last role from a user', 400, 'LAST_ROLE')
    }

    await prisma.userRole.delete({
      where: {
        userId_roleId: {
          userId: targetUserId,
          roleId: role.id,
        },
      },
    })

    await prisma.auditLog.create({
      data: {
        userId: removedByUserId,
        event: 'ROLE_REMOVED',
        metadata: { targetUserId, role: roleName },
      },
    })

    return { message: `Role '${roleName}' removed` }
  }

  // ─── Toggle user active status ─────────────────────────────────
  async toggleUserActive(targetUserId: string, adminUserId: string) {
    // Prevent admin from deactivating themselves
    if (targetUserId === adminUserId) {
      throw new AppError('You cannot deactivate your own account', 400, 'SELF_DEACTIVATION')
    }

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, isActive: true, email: true },
    })

    if (!user) throw new NotFoundError('User')

    const updated = await prisma.user.update({
      where: { id: targetUserId },
      data: { isActive: !user.isActive },
      select: { isActive: true },
    })

    // If deactivating — revoke all their sessions immediately
    if (!updated.isActive) {
      await prisma.refreshToken.updateMany({
        where: { userId: targetUserId, revokedAt: null },
        data: { revokedAt: new Date() },
      })
    }

    await prisma.auditLog.create({
      data: {
        userId: adminUserId,
        event: updated.isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
        metadata: { targetUserId, email: user.email },
      },
    })

    return {
      isActive: updated.isActive,
      message: `User ${updated.isActive ? 'activated' : 'deactivated'}`,
    }
  }

  // ─── Get audit logs ────────────────────────────────────────────
  async getAuditLogs({ page, limit, userId }: { page: number; limit: number; userId?: string }) {
    const skip = (page - 1) * limit

    const where = userId ? { userId } : {}

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          event: true,
          ipAddress: true,
          userAgent: true,
          metadata: true,
          createdAt: true,
          user: {
            select: { email: true, firstName: true },
          },
        },
      }),
    ])

    return {
      logs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    }
  }

  // ─── List all roles ────────────────────────────────────────────
  async listRoles() {
    return prisma.role.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        _count: { select: { users: true } },
      },
      orderBy: { name: 'asc' },
    })
  }
}

export const adminService = new AdminService()
