import { resolve } from 'path';
import {
  defineConfig,
  externalizeDepsPlugin,
  bytecodePlugin,
} from 'electron-vite';
import react from '@vitejs/plugin-react';
import { BuildOptions, Plugin } from 'vite';
import million from 'million/compiler';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import { terser } from 'rollup-plugin-terser';
import compressPlugin from 'vite-plugin-compression';

// const exclude = ['electron-log', 'node-mac-permissions'];
const exclude = [];

const build: BuildOptions = {
  rollupOptions: {
    output: {
      format: 'es',
    },
  },
};

const plugins: Plugin[] = [
  externalizeDepsPlugin(),
  bytecodePlugin(),
  nodeResolve(),
  terser(),
  compressPlugin(),

] as Plugin[];

const config = defineConfig({
  main: {
    build,
    plugins,
    // resolve: {
    //   alias: {
    //     'electron-log': 'electron-log/main.js',
    //   },
    // },
  },
  preload: {
    build,
    plugins,
  },
  renderer: {
    server: {
      port: 4444,
      fs: {
        allow: ['../../src', '../../node_modules/@fontsource', '../../node_modules/@vscode'],
      },
    },
    build: {
      rollupOptions: {
        ...build.rollupOptions,
        input: {
          main: resolve('src/renderer/index.html'),
          widget: resolve('src/renderer/widget.html'),
        },
      },
    },
    resolve: {
      alias: {
        // 'electron/main': 'electron',
        // 'electron/common': 'electron',
        // 'electron/renderer': 'electron',
        '@renderer': resolve('src/renderer/src'),
        // 'electron-log': 'electron-log/renderer.js',
      },
    },
    plugins: [
      ...plugins,
      million.vite({ auto: true }), react()
    ],
  },
});

// console.log({ config: JSON.stringify(config, null, 2) });

export default config;
