import { execSync } from 'node:child_process'
import { assertLocalTestEnvironment } from './testEnvironment.js'

export function setup(): void {
  const { databaseUrl } = assertLocalTestEnvironment()

  execSync('npx prisma migrate deploy', {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: databaseUrl,
    },
    stdio: 'inherit',
  })
}

export async function teardown(): Promise<void> {
  // No global teardown required.
}
