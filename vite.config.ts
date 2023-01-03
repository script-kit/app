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
import monacoEditorPlugin from 'vite-plugin-monaco-editor';
import renderer from 'vite-plugin-electron-renderer';
import jotaiDebugLabel from 'jotai/babel/plugin-debug-label';
import jotaiReactRefresh from 'jotai/babel/plugin-react-refresh';

import pkg from './package.json';

rmSync(path.join(__dirname, 'dist-electron'), { recursive: true, force: true });

const prefix = `monaco-editor/esm/vs`;

export default defineConfig({
  resolve: {
    alias: {
      '@': path.join(__dirname, 'src'),
      styles: path.join(__dirname, 'src/assets/styles'),
    },
  },

  plugins: [
    react(),
    monacoEditorPlugin({}),
    electron({
      include: ['app'],
      transformOptions: {
        sourcemap: true,
      },
      plugins: [
        // copy([
        // {
        //   from: 'node_modules/monaco-editor/min/vs/**/*',
        //   to: 'dist/vs',
        // },
        // ]),
        esmodule({
          include: ['execa', 'nanoid', 'download'],
        }),
      ],
    }),
    renderer({
      nodeIntegration: true,
      optimizeDeps: {
        // include: ['monaco-editor', '@monaco-editor/react'],
        buildOptions: {
          sourcemap: true,
          minify: false,
          target: 'esnext',
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
