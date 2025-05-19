import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    passWithNoTests: true,
    deps: {
      interopDefault: true,
      inline: [/.*/],
    },
    benchmark: {
      // You can add tinybench options here if needed
    },
  },
  esbuild: {
    target: 'esnext',
    format: 'esm',
  },
});
