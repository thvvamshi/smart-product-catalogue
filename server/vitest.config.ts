import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['dist/**', 'node_modules/**'],
    fileParallelism: false,
    maxWorkers: 1,
    globalSetup: './tests/global-setup.ts',
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL || 'postgresql://catalogue_test:catalogue_test_local_only@localhost:5433/catalogue_test',
      CLIENT_URL: 'http://localhost:5173',
    },
  },
});
