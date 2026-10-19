import { execSync } from 'node:child_process'
import { assertSafeTestTargets } from './testEnvironment.js'

export function setup(): void {
  // Validate the destination before running any migrations.
  assertSafeTestTargets()

  console.log('\nRunning test database migrations...')

  // Use the validated DATABASE_URL from the test environment.
  // Do not hardcode a second database URL here.
  execSync('npx prisma migrate deploy', {
    env: { ...process.env },
    stdio: 'inherit',
  })

  console.log('Test database ready.\n')
}

export async function teardown(): Promise<void> {
  // Test connections are closed by the test setup teardown hook.
}
