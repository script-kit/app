import { rmSync } from 'fs';
import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-electron-plugin';
import { customStart, loadViteEnv, alias } from 'vite-electron-plugin/plugin';
import renderer from 'vite-plugin-electron-renderer';
import pkg from './package.json';

rmSync(path.join(__dirname, 'dist-electron'), { recursive: true, force: true });

// https://vitejs.dev/config/
export default defineConfig({
  // optimizeDeps: {
  //   exclude: [
  //     'chokidar', // C++
  //     'frontmost-app', // C++
  //     'glasstron-clarity', // C++
  //     'node-pty', // C++
  //     'node-mac-permissions', // C++
  //     'native-keymap', // C++
  //     'uiohook', // C++
  //     '@nut-tree/nut-js', // C++
  //     'express',
  //     'express-ws',
  //     'get-port',
  //     'fs-extra',
  //     'image-size',
  //     'node-stream-zip',
  //     'tar',
  //     'tail',
  //     'download', // esm
  //     'nanoid', // esm
  //   ],
  // },
  resolve: {
    alias: {
      '@': path.join(__dirname, 'src'),
      styles: path.join(__dirname, 'src/assets/styles'),
    },
  },
  // build: {
  //   minify: false,
  //   rollupOptions: {
  //     external: [
  //       'chokidar', // C++
  //       'frontmost-app', // C++
  //       'glasstron-clarity', // C++
  //       'node-pty', // C++
  //       'node-mac-permissions', // C++
  //       'native-keymap', // C++
  //       'uiohook', // C++
  //       '@nut-tree/nut-js', // C++
  //       'express',
  //       'express-ws',
  //       'get-port',
  //       'fs-extra',
  //       'image-size',
  //       'node-stream-zip',
  //       'tar',
  //       'tail',

  //       'download', // esm
  //       'nanoid', // esm
  //     ],
  //   },
  // },
  plugins: [
    react(),
    electron({
      include: ['app'],

      // api: {
      //   vite: {
      //     config: {
      //       esbuild: {
      //         exclude: [
      //           'chokidar', // C++
      //           'frontmost-app', // C++
      //           'glasstron-clarity', // C++
      //           'node-pty', // C++
      //           'node-mac-permissions', // C++
      //           'native-keymap', // C++
      //           'uiohook', // C++
      //           '@nut-tree/nut-js', // C++
      //           'express',
      //           'express-ws',
      //           'get-port',
      //           'fs-extra',
      //           'image-size',
      //           'node-stream-zip',
      //           'tar',
      //           'tail',

      //           'download', // esm
      //           'nanoid', // esm
      //         ],
      //       },
      //     },
      //   },
      // },

      transformOptions: {
        sourcemap: !!process.env.VSCODE_DEBUG,
      },
      plugins: [
        ...(process.env.VSCODE_DEBUG
          ? [
              // Will start Electron via VSCode Debug
              customStart(
                debounce(() =>
                  console.log(
                    /* For `.vscode/.debug.script.mjs` */ '[startup] Electron App'
                  )
                )
              ),
            ]
          : []),
        // Allow use `import.meta.env.VITE_SOME_KEY` in Electron-Main
        loadViteEnv(),
      ],
    }),
    // Use Node.js API in the Renderer-process
    renderer({
      nodeIntegration: true,
      optimizeDeps: {
        buildOptions: {
          external: ['express'],
        },
      },
    }),
  ],
  server: process.env.VSCODE_DEBUG
    ? (() => {
        const url = new URL(pkg.debug.env.VITE_DEV_SERVER_URL);
        return {
          host: url.hostname,
          port: +url.port,
        };
      })()
    : undefined,
  clearScreen: false,
});

function debounce<Fn extends (...args: any[]) => void>(fn: Fn, delay = 299) {
  let t: NodeJS.Timeout;
  return ((...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  }) as Fn;
}
