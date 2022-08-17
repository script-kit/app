import path from 'path';
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
};

export const createWidget = async (
  command: string,
  html = '<h1>html undefined</h1>',
  options: WidgetOptions = {}
) => {
  const filePath = kenvPath('.widgets', `${command}.html`);

  const stylePath = path.resolve(app.getAppPath(), 'dist', 'style.css');

  const petiteVuePath = getAssetPath('petite-vue.es.js');

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
    .draggable {-webkit-app-region: drag;}
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

  <template id="widget-template">
    ${html}
  </template>

  <div id="__widget-container" v-scope="Widget()" @vue:mounted="mounted" class="flex justify-center items-center v-screen h-screen draggable"></div>

  <script>

    document.addEventListener("click", (event) => {
      let {id = ""} = event.target.closest("*[id]")
      ipcRenderer.send("WIDGET_CLICK", {
        targetId: id,
        widgetId: window.widgetId,
      })
    })


    document.addEventListener("input", (event) => {
      ipcRenderer.send("WIDGET_INPUT", {
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
