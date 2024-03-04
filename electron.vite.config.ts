import path from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import million from 'million/compiler';
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
  },
});
