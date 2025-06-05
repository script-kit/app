import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    passWithNoTests: true,
    setupFiles: ['./jest.setup.ts'],
    // Performance optimizations
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false, // Enable parallel execution
        isolate: true, // Better isolation for file system tests
        maxThreads: 4, // Limit to prevent resource exhaustion
        minThreads: 2,
      },
    },
    // Fail fast - stop on first failure
    bail: 1,
    // Faster test discovery
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    // Timeout settings for faster feedback
    testTimeout: 5000, // Reduce from default 10s
    hookTimeout: 5000,
    deps: {
      interopDefault: true,
      inline: [/.*/],
    },
    environmentMatchGlobs: [
      // Use jsdom for renderer tests
      ['src/renderer/**/*.test.{ts,tsx}', 'jsdom'],
      // Use node for everything else
      ['**/*.test.ts', 'node'],
    ],
    benchmark: {
      // You can add tinybench options here if needed
    },
  },
  esbuild: {
    target: 'esnext',
    format: 'esm',
  },
});
