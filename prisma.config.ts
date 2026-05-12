import 'dotenv/config'
import path from 'path'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: path.join(process.cwd(), 'server/prisma/schema.prisma'),

  migrations: {
    path: path.join(process.cwd(), 'server/prisma/migrations'),
    seed: 'tsx server/prisma/seed.ts',
  },

  datasource: {
    url: env('DATABASE_URL'),
  },
})
