import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: './jest.setup.ts',
    include: ['src/main/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'json', 'html'],
    },
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        isolate: true,
      },
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
});
