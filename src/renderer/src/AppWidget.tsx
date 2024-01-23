import log from 'electron-log';
import { Channel } from '@johnlindquist/kit/core/enum';
import { WidgetOptions } from '@johnlindquist/kit/types/pro';
import React, { ErrorInfo, Suspense, useEffect, useState } from 'react';
import { createApp } from 'petite-vue';
import { AppChannel } from '../../shared/enums';

const { ipcRenderer } = window.electron;

class ErrorBoundary extends React.Component {
  // eslint-disable-next-line react/state-in-constructor
  public state: { hasError: boolean; info: ErrorInfo } = {
    hasError: false,
    info: { componentStack: '' },
  };

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Display fallback UI
    this.setState({ hasError: true, info });
    // You can also log the error to an error reporting service
    ipcRenderer.send(Channel.WIDGET_ERROR, { error });
  }

  render() {
    const { hasError, info } = this.state;
    const { children } = this.props;
    if (hasError) {
      return (
        <div className="p-2 font-mono">
          {/* Add a button to reload the window */}
          <button
            type="button"
            className="rounded bg-red-500 p-2 text-white"
            onClick={() => {
              ipcRenderer.send(AppChannel.RELOAD);
            }}
          >
            Reload Prompt
          </button>

          <div className="text-base text-red-500">
            Rendering Error. Opening logs.
          </div>
          <div className="text-xs">{info.componentStack}</div>
        </div>
      );
    }

    return children;
  }
}

// Experimental dynamic component loading
// const { pathToFileURL } = window.api.url;
// const componentPath = pathToFileURL(
//   window.api.utils.kenvPath('components', 'Clock.jsx')
// ).href;
// log.info({ componentPath });
// const DynamicComponent = React.lazy(() => {
//   /* @vite-ignore */
//   return import(/* @vite-ignore */ componentPath)
//     .then((module) => module)
//     .catch((error) => {
//       log.error(`Error loading dynamic component at ${componentPath}: `, error);
//       throw error;
//     });
// });
/*
      <Suspense fallback={<div>Loading...</div>}>
        {componentPath}
        <DynamicComponent />
      </Suspense>
*/

export default function AppWidget() {
  const [options, setOptions] = useState<WidgetOptions>({});

  const [contentWidth, setContentWidth] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    const handleWidgetInit = (event, options: WidgetOptions) => {
      console.log({ options });
      setOptions(options);
    };

    ipcRenderer.on(Channel.WIDGET_INIT, handleWidgetInit);

    // Add other event listeners here

    return () => {
      ipcRenderer.off(Channel.WIDGET_INIT, handleWidgetInit);
      // Remove other event listeners here
    };
  }, []);

  useEffect(() => {
    const resize = () => {
      if (!document.body.firstElementChild) {
        return;
      }

      const width = Math.ceil(
        (document.body.firstElementChild as HTMLElement)?.offsetWidth ||
          window.innerWidth
      );
      const height = Math.ceil(
        (document.body.firstElementChild as HTMLElement)?.offsetHeight ||
          window.innerHeight
      );

      if (width !== contentWidth || height !== contentHeight) {
        setContentWidth(width);
        setContentHeight(height);

        ipcRenderer.send('WIDGET_RESIZE', { width, height });
      }
    };

    const resizeTimeout = setTimeout(resize, 500);

    return () => {
      clearTimeout(resizeTimeout);
    };
  }, [contentWidth, contentHeight]);

  // Add useEffect hooks for other event listeners like "click", "mousedown", "input"

  const bodyStyle = {
    backgroundColor: options?.transparent
      ? 'rgba(0, 0, 0, 0) !important'
      : undefined,
    pointerEvents: 'none',
    WebkitUserSelect: options?.draggable ? 'none' : undefined,
    WebkitAppRegion: options?.draggable ? 'drag' : undefined,
  };

  useEffect(() => {
    let __widgetContainer = document.getElementById(
      '__widget-container'
    ) as HTMLElement;

    const handleClick = (event) => {
      const closestIdElement = event.target.closest('*[id]');
      if (!closestIdElement) return;
      const targetId = closestIdElement.id;
      const message = {
        targetId: targetId,
        ...options,
      };

      console.log(`handleClick`, JSON.stringify(message));
      ipcRenderer.send(Channel.WIDGET_CLICK, message);
    };

    const handleMouseDown = (event) => {
      const closestIdElement = event.target.closest('*[id]');
      if (!closestIdElement) return;
      const targetId = closestIdElement.id;
      const message = {
        targetId: targetId,
        ...options,
      };
      console.log(`handleMouseDown`, JSON.stringify(message));
      ipcRenderer.send(Channel.WIDGET_MOUSE_DOWN, message);
    };

    const handleInput = (event) => {
      ipcRenderer.send(Channel.WIDGET_INPUT, {
        targetId: event.target.id,
        value: event.target.value,
        ...options,
      });
    };

    const handleDragEnter = (event) => {
      console.log('dragenter');
      __widgetContainer.classList.add('drag-shadow');
      event.preventDefault();
    };

    const handleDragEnd = (event) => {
      console.log('dragend');
      __widgetContainer.classList.remove('drag-shadow');
    };

    const handleDragLeave = (event) => {
      console.log('dragleave');
      __widgetContainer.classList.remove('drag-shadow');
    };

    const handleDragOver = (event) => {
      event.dataTransfer.dropEffect = 'copy';
      event.preventDefault();
    };

    const handleDrop = (event) => {
      event.preventDefault();
      let { id = '' } = event.target.closest('*[id]');
      let files = [];
      let eFiles = event.dataTransfer.files;

      for (let key in eFiles) {
        if (eFiles[key]?.path) {
          files.push(eFiles[key].path);
        }
      }

      ipcRenderer.send('WIDGET_DROP', {
        dataset: {
          ...event.target.dataset,
          files,
        },
        targetId: id,
        ...options,
      });
    };

    document.addEventListener('click', handleClick);
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('input', handleInput);
    document.addEventListener('dragenter', handleDragEnter);
    document.addEventListener('dragend', handleDragEnd);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('drop', handleDrop);

    function Widget() {
      window.onSetState = (state) => {};
      return {
        $template: '#widget-template',
        state: options?.state || {},
        ...(options?.state || {}),
        setState(state) {
          for (let [key, value] of Object.entries(state)) {
            this[key] = value;
          }
        },
        mounted() {
          ipcRenderer.on(Channel.WIDGET_SET_STATE, (event, state) => {
            this.setState(state);
            window.onSetState(state);
          });

          ipcRenderer.send(Channel.WIDGET_INIT, {
            ...options,
          });
        },
      };
    }

    createApp({
      Widget,
    }).mount();

    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('input', handleInput);
      document.removeEventListener('dragenter', handleDragEnter);
      document.removeEventListener('dragend', handleDragEnd);
      document.removeEventListener('dragleave', handleDragLeave);
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('drop', handleDrop);
    };
  }, [options]);

  const __html = `<template id="widget-template">
  ${options?.body || `<div>Missing body</div>`}
</template>

<div id="__widget-container" v-scope="Widget()" @vue:mounted="mounted" class="${
    options.containerClass
  }"></div>`;

  return (
    <ErrorBoundary>
      <div
        dangerouslySetInnerHTML={{
          __html,
        }}
      />
    </ErrorBoundary>
  );
}
