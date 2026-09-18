import path from 'path'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',

  migrations: {
    path: path.join(process.cwd(), 'prisma/migrations'),
    seed: 'tsx prisma/seed.ts',
  },

  datasource: {
    url: process.env['DATABASE_URL'] ?? '',
  },
})
