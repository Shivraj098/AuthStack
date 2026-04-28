import { execSync } from 'child_process'

export function setup(): void {
  console.log('\n🔧 Running test database migrations...')

  // Apply all migrations to the test database
  execSync('npx prisma migrate deploy', {
    env: {
      ...process.env,
      DATABASE_URL: 'postgresql://authuser:authpassword@localhost:5432/authdb_test',
    },
    stdio: 'inherit',
  })

  console.log('✓ Test database ready\n')
}

export async function teardown(): Promise<void> {
  // Nothing to tear down globally — each test file handles its own cleanup
}
