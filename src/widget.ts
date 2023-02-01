import path from 'path';
import os from 'os';
import { outputFile } from 'fs-extra';
import { app, BrowserWindowConstructorOptions } from 'electron';
import { kenvPath } from '@johnlindquist/kit/cjs/utils';
import { getAssetPath } from './assets';

export type WidgetOptions = BrowserWindowConstructorOptions & {
  state?: any;
  draggable?: boolean;
  unpkg?: string[];
  title?: string;
  ignoreMouse?: boolean;
  ttl?: number;
  containerClass?: string;
};

export const createWidget = async (
  command: string,
  html = '<h1>html undefined</h1>',
  options: WidgetOptions = {},
  theme = ''
) => {
  const filePath = kenvPath('.widgets', `${command}.html`);

  const stylePath = path.resolve(app.getAppPath(), 'dist', 'style.css');

  const petiteVuePath = getAssetPath('petite-vue.es.js');

  const isWin = os.platform() === 'win32';

  await outputFile(
    filePath,
    `
    <script>
    let u = new URL(window.location.href)
    window.widgetId = u.searchParams.get("widgetId")
    </script>
    ${(options?.unpkg || [])
      ?.map((lib: string) => `<script src="https://unpkg.com/${lib}"></script>`)
      .join('\n')}
    <link rel="stylesheet" href="${stylePath}">
    <style type="text/css">${theme}</style>
    <style>
    body {
      ${
        options?.transparent
          ? `
        background-color: rgba(0, 0, 0, 0) !important;`
          : ``
      }

      ${
        options?.draggable
          ? `
          -webkit-user-select: none;
          -webkit-app-region: drag;
      `
          : ``
      }

      pointer-events: none
    }

    * {pointer-events: all;}
    .draggable {
      ${
        options?.draggable
          ? `
          -webkit-app-region: drag;
      `
          : ``
      }

    }
  </style>
    <script>
      const { ipcRenderer } = require('electron');
      window.ipcRenderer = ipcRenderer;
      window.onSetState = (state) => {}
    </script>

    <script type="module">
    import { createApp } from '${petiteVuePath}?module'

    ipcRenderer.on('WIDGET_INIT', (event, state)=> {
      console.log({state})
      function Widget() {
        return {
          $template: '#widget-template',
          state,
          ...state,
          setState(state) {
            for (let [key, value] of Object.entries(state)) {
              this[key] = value;
            }
          },
          mounted() {
            ipcRenderer.on('WIDGET_SET_STATE', (event, state)=> {
              this.setState(state);
              onSetState(state);
            })
          }
        }
      }

      createApp({
        Widget
      }).mount()
    })
  </script>

  ${
    isWin
      ? `<div class="absolute top-0 left-0 h-8 w-screen draggable"></div>`
      : ``
  }

  <template id="widget-template">
    ${html}
  </template>

  <div id="__widget-container" v-scope="Widget()" @vue:mounted="mounted" class="${
    options.containerClass
  } ${isWin ? `` : `draggable`}"></div>

  <script>

    document.addEventListener("click", (event) => {
      let {id = ""} = event.target.closest("*[id]")
      ipcRenderer.send("WIDGET_CLICK", {
        dataset: {
          ...event.target.dataset
        },
        targetId: id,
        widgetId: window.widgetId,
      })
    })

    // add "mousedown" handler
    document.addEventListener("mousedown", (event) => {
      let {id = ""} = event.target.closest("*[id]")
      ipcRenderer.send("WIDGET_MOUSE_DOWN", {
        dataset: {
          ...event.target.dataset
        },
        targetId: id,
        widgetId: window.widgetId,
      })
    })

    // document.addEventListener("dragstart", event => {
    //   event.preventDefault()
    //   event.dataTransfer.effectAllowed = "all";
    //   event.dataTransfer.dropEffect = "move"
    // })
    document.addEventListener("dragenter", event => {
        event.preventDefault()
    })
    document.addEventListener("dragover", event => {
        event.dataTransfer.dropEffect = 'copy';
        event.preventDefault()
    })

    // add "drop" handler
    document.addEventListener("drop", (event) => {
      event.preventDefault();
      let {id = ""} = event.target.closest("*[id]")
      // get the files from the event
      let files = [];
      let eFiles = event.dataTransfer.files;

      Object.keys(eFiles).forEach((key) => {
        if (eFiles[key]?.path) {
          files.push(eFiles[key].path);
        }
      });
      ipcRenderer.send("WIDGET_DROP", {
        dataset: {
          ...event.target.dataset,
          files
        },
        targetId: id,
        widgetId: window.widgetId,
      })
    })


    document.addEventListener("input", (event) => {
      ipcRenderer.send("WIDGET_INPUT", {
        dataset: {
          ...event.target.dataset
        },
        targetId: event.target.id,
        value: event.target.value,
        widgetId: window.widgetId,
      })
    })


    </script>

    <script>
    let fitWidget = () => {
      let firstChild = document.getElementById("__widget-container").firstElementChild;
      let display = firstChild.style.display

      firstChild.style.display = "inline-block"

      let data = {
        windowId: window.id,
        width: firstChild.offsetWidth,
        height: firstChild.offsetHeight,
        widgetId: window.widgetId,
      }

      ipcRenderer.send("WIDGET_MEASURE", data)
      firstChild.style.display = display
    }
    setTimeout(fitWidget, 2000)

    ipcRenderer.on('WIDGET_FIT', (event, state)=> {
      fitWidget()
    })

    </script>
  `
  );

  return filePath;
};
