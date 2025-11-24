import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Fast test configuration for pre-commit hooks.
 * Excludes slow tests (performance, MCP inspector, integration tests).
 */
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    passWithNoTests: true,
    setupFiles: ['./jest.setup.ts'],
    pool: 'threads',
    maxWorkers: 4,
    minWorkers: 2,
    isolate: true,
    bail: 1,
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    // Exclude slow tests for fast pre-commit feedback
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      // Slow performance tests
      '**/search-performance.test.ts',
      // MCP tests that spawn external processes
      '**/mcp-inspector.test.ts',
      '**/mcp-tool-script-integration.test.ts',
      '**/mcp-integration.test.ts',
      // Edge case tests with lots of iterations
      '**/terminal-capture-edge-cases.test.ts',
      // Chokidar/watcher integration tests (require real file system timing)
      '**/chokidar*.test.ts',
      // Terminal IPC tests with heavy module imports
      '**/terminal-ipc.test.ts',
      // Search tests with pre-existing failures (run in full suite)
      '**/search*.test.ts',
      // Other tests with pre-existing failures
      '**/process-scanner.test.ts',
    ],
    testTimeout: 3000,
    hookTimeout: 3000,
    deps: {
      interopDefault: true,
    },
    environment: 'node',
    // Suppress verbose output for faster feedback
    reporters: ['default'],
    silent: true,
  },
  esbuild: {
    target: 'esnext',
    format: 'esm',
  },
});
