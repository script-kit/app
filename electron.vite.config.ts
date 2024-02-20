import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { BuildOptions } from 'vite';

const build: BuildOptions = {
  rollupOptions: {
    output: {
      format: 'es',
    },
  },
};

export default defineConfig({
  main: {
    build,
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    build,
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
      },
    },
    plugins: [react()],
  },
});
