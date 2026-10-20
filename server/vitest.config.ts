import { assertLocalTestEnvironment } from './src/tests/setup/testEnvironment.js'
import { defineConfig } from 'vitest/config'
import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
// Mark the Vitest process as a test process before application
// configuration modules are imported by the test suite.
dotenv.config({
  path: fileURLToPath(new URL('../.env.test', import.meta.url)),
  override: false,
})
process.env.NODE_ENV = 'test'

// Fail before global setup, migrations, or test cleanup can run.
assertLocalTestEnvironment()
export default defineConfig({
  test: {
    // Force single worker (no parallel workers)
    pool: 'forks',

    fileParallelism: false,

    // Disable parallel execution inside files
    sequence: {
      concurrent: false,
    },

    // Isolation per test file
    isolate: true,

    // Setup
    globalSetup: ['./src/tests/setup/globalSetup.ts'],
    setupFiles: ['./src/tests/setup/testSetup.ts'],

    // Environment
    environment: 'node',

    // Coverage
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['node_modules/**', 'src/generated/**', 'src/tests/**', 'prisma/**'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 65,
      },
    },

    // Timeouts
    testTimeout: 15000,
    hookTimeout: 30000,
  },
})
