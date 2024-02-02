// electron.vite.config.ts
import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
var build = {
  rollupOptions: {
    output: {
      format: "es"
    }
  }
};
var config = defineConfig({
  main: {
    build,
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    build,
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    server: {
      port: 4444,
      fs: {
        allow: ["../../src", "../../node_modules/@fontsource"]
      }
    },
    build: {
      rollupOptions: {
        ...build.rollupOptions,
        input: {
          main: resolve("src/renderer/index.html"),
          widget: resolve("src/renderer/widget.html")
        }
      }
    },
    resolve: {
      alias: {
        "electron/main": "electron",
        "electron/common": "electron",
        "electron/renderer": "electron",
        "@renderer": resolve("src/renderer/src")
      }
    },
    plugins: [react()]
  }
});
var electron_vite_config_default = config;
export {
  electron_vite_config_default as default
};
