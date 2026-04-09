import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import bcrypt from 'bcrypt'

const pool = new pg.Pool({
  connectionString: process.env['DATABASE_URL'],
})

const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('Seeding database...')

  // Create the base roles
  // upsert = insert if not exists, update if exists
  // This makes the seed script safe to run multiple times
  const adminRole = await prisma.role.upsert({
    where: { name: 'admin' },
    update: {},
    create: {
      name: 'admin',
      description: 'Full system access',
    },
  })

  const userRole = await prisma.role.upsert({
    where: { name: 'user' },
    update: {},
    create: {
      name: 'user',
      description: 'Standard user access',
    },
  })

  const moderatorRole = await prisma.role.upsert({
    where: { name: 'moderator' },
    update: {},
    create: {
      name: 'moderator',
      description: 'Content moderation access',
    },
  })

  console.log('Roles created:', { adminRole, userRole, moderatorRole })

  // Create a test admin user
  const passwordHash = await bcrypt.hash('Admin@123456', 12)

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      passwordHash,
      firstName: 'Admin',
      lastName: 'User',
      isVerified: true,
      roles: {
        create: {
          roleId: adminRole.id,
          assignedBy: 'seed',
        },
      },
    },
  })

  console.log('Admin user created:', adminUser.email)

  // Create a test regular user
  const userPasswordHash = await bcrypt.hash('User@123456', 12)

  const regularUser = await prisma.user.upsert({
    where: { email: 'user@example.com' },
    update: {},
    create: {
      email: 'user@example.com',
      passwordHash: userPasswordHash,
      firstName: 'Regular',
      lastName: 'User',
      isVerified: true,
      roles: {
        create: {
          roleId: userRole.id,
          assignedBy: 'seed',
        },
      },
    },
  })

  console.log('Regular user created:', regularUser.email)
  console.log('Seeding complete.')
}

main()
  .catch((e) => {
    console.error('Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
