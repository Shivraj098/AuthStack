import { defineConfig } from 'vitest/config'

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
