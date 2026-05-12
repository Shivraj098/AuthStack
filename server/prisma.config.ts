import 'dotenv/config'
import path from 'path'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',

  migrations: {
    path: path.join(process.cwd(), 'prisma/migrations'),
    seed: 'tsx prisma/seed.ts',
  },

  datasource: {
    url: env('DATABASE_URL'),
  },
})
