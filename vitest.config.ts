import { defineConfig, configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    passWithNoTests: true,
    setupFiles: ['./jest.setup.ts'],
    // Performance optimizations - Vitest v4 uses top-level settings
    pool: 'threads',
    maxWorkers: 4, // Limit to prevent resource exhaustion
    minWorkers: 2,
    isolate: true, // Better isolation for file system tests
    // Fail fast - stop on first failure
    bail: 1,
    // Faster test discovery
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    // Timeout settings for faster feedback
    testTimeout: 5000, // Reduce from default 10s
    hookTimeout: 5000,
    deps: {
      interopDefault: true,
    },
    // Vitest v4: Use environment option with fileParallelism for different environments
    environment: 'node',
    benchmark: {
      // You can add tinybench options here if needed
    },
  },
  esbuild: {
    target: 'esnext',
    format: 'esm',
  },
});
