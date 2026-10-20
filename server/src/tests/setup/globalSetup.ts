import { execSync } from 'node:child_process'
import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const setupDirectory = fileURLToPath(new URL('.', import.meta.url))
const projectRoot = path.resolve(setupDirectory, '../../../../')
const localHosts = new Set(['localhost', '127.0.0.1'])

function getLocalTestDatabaseUrl(): string {
  dotenv.config({
    path: path.join(projectRoot, '.env.test'),
    override: false,
  })

  const databaseUrl = process.env['DATABASE_URL']

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for test setup')
  }

  let parsedUrl: URL

  try {
    parsedUrl = new URL(databaseUrl)
  } catch {
    throw new Error('DATABASE_URL is invalid for test setup')
  }

  const databaseName = parsedUrl.pathname.replace(/^\/+/, '')

  if (!localHosts.has(parsedUrl.hostname) || databaseName !== 'authdb_test') {
    throw new Error('Refusing to run test migrations outside local authdb_test')
  }

  return databaseUrl
}

export function setup(): void {
  const databaseUrl = getLocalTestDatabaseUrl()

  execSync('npx prisma migrate deploy', {
    cwd: path.join(projectRoot, 'server'),
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
