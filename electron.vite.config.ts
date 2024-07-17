import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import million from 'million/compiler';
import type { BuildOptions } from 'vite';

import { external, include } from './src/main/shims';

const build: BuildOptions = {
  rollupOptions: {
    output: {
      format: 'es',
    },
    external: external(),
  },
};

export default defineConfig({
  main: {
    build,
    plugins: [
      externalizeDepsPlugin({
        include: include(),
      }),
    ],
  },
  preload: {
    build,
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    build: {
      rollupOptions: {
        input: {
          browser: path.resolve(__dirname, 'src/renderer/index.html'),
          webview: path.resolve(__dirname, 'src/renderer/widget.html'),
        },
      },
    },
    resolve: {
      alias: {
        '@renderer': path.resolve('src/renderer/src'),
      },
    },
    plugins: [million.vite({ auto: true }), react()],
    server: {
      watch: {
        ignored: ['**/*.txt'],
      },
    },
  },
});
