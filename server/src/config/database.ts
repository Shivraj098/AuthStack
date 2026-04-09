import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { env } from './env.js'

// Create a PostgreSQL connection pool
// Pool manages multiple connections — more efficient
// than opening a new connection per query
// Create a PostgreSQL connection pool
const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})

// Prisma 7 adapter

const adapter = new PrismaPg(pool)

// ✅ Strong global typing
declare global {
  var prisma: PrismaClient | undefined
}

// ✅ FIX: explicitly type the variable
const prismaClient: PrismaClient =
  globalThis.prisma ??
  new PrismaClient({
    adapter,
    log: env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

// ✅ assign safely
if (env.NODE_ENV !== 'production') {
  globalThis.prisma = prismaClient
}

export const prisma = prismaClient

process.on('beforeExit', () => {
  void (async () => {
    await prisma.$disconnect()
    await pool.end()
  })()
})
