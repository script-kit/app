import { rmSync } from 'fs';
import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-electron-plugin';
import {
  customStart,
  loadViteEnv,
  alias,
  esmodule,
  copy,
} from 'vite-electron-plugin/plugin';
import renderer from 'vite-plugin-electron-renderer';
import jotaiDebugLabel from 'jotai/babel/plugin-debug-label';
import jotaiReactRefresh from 'jotai/babel/plugin-react-refresh';

import pkg from './package.json';

rmSync(path.join(__dirname, 'dist-electron'), { recursive: true, force: true });

const prefix = `monaco-editor/esm/vs`;

export default defineConfig({
  // build: {
  //   rollupOptions: {
  //     output: {
  //       manualChunks: {
  //         editorWorker: [`${prefix}/editor/editor.worker?worker`],
  //         jsonWorker: [`${prefix}/language/json/json.worker?worker`],
  //         cssWorker: [`${prefix}/language/css/css.worker?worker`],
  //         htmlWorker: [`${prefix}/language/html/html.worker?worker`],
  //         tsWorker: [`${prefix}/language/typescript/ts.worker?worker`],
  //       },
  //     },
  //   },
  // },
  resolve: {
    alias: {
      '@': path.join(__dirname, 'src'),
      styles: path.join(__dirname, 'src/assets/styles'),
      // '/monaco-editor/': path.resolve(
      //   __dirname,
      //   'node_modules/monaco-editor/esm/'
      // ),
    },
  },

  plugins: [
    react(),
    // monacoEditorPlugin({
    //   publicPath: 'workers',
    //   customDistPath: (root: string, buildOutDir: string, base: string) =>
    //     `${root}/${buildOutDir}/workers`,
    // }),

    electron({
      include: ['app'],
      transformOptions: {
        sourcemap: true,
      },
      plugins: [
        // copy([
        //   {
        //     from: 'node_modules/monaco-editor/**/*',
        //     to: 'assets/monaco-editor',
        //   },
        // ]),
        esmodule({
          include: ['execa', 'nanoid', 'download'],
        }),
      ],
    }),
    renderer({
      nodeIntegration: true,
      // optimizeDeps: {
      //   buildOptions: {
      //     external: [
      //       `monaco-editor/esm/vs/language/json/json.worker`,
      //       `monaco-editor/esm/vs/language/css/css.worker`,
      //       `monaco-editor/esm/vs/language/html/html.worker`,
      //       `monaco-editor/esm/vs/language/typescript/ts.worker`,
      //       `monaco-editor/esm/vs/editor/editor.worker`,
      //     ],
      //   },
      // },
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
