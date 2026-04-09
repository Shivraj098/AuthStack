import 'dotenv/config'
import path from 'path'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: path.join(process.cwd(), 'prisma', 'schema.prisma'),

  datasource: {
    url: env('DATABASE_URL'),
  },
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
})
