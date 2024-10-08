import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setupRenderer.ts',
    include: ['src/renderer/**/*.test.tsx'],
    coverage: {
      reporter: ['text', 'json', 'html'],
    },
  },
});
