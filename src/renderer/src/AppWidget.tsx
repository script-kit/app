import { Channel } from '@johnlindquist/kit/core/enum';
import type { WidgetOptions } from '@johnlindquist/kit/types/pro';
import log from 'electron-log';
import { createApp } from 'petite-vue';
import React, { type ErrorInfo, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppChannel } from '../../shared/enums';

// ============================================================================
// Debug Overlay Component
// ============================================================================

interface DebugEvent {
  channel: string;
  targetId?: string;
  timestamp: number;
  data?: any;
}

interface DebugOverlayProps {
  widgetId?: string;
  state: any;
  events: DebugEvent[];
  bounds: { x: number; y: number; width: number; height: number };
  visible: boolean;
  onToggle: () => void;
}

function DebugOverlay({ widgetId, state, events, bounds, visible, onToggle }: DebugOverlayProps) {
  if (!visible) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="fixed bottom-2 right-2 w-6 h-6 bg-gray-800/80 text-white text-xs rounded-full flex items-center justify-center hover:bg-gray-700 z-50 font-mono"
        title="Show Debug Panel (Ctrl+Shift+D)"
      >
        D
      </button>
    );
  }

  return (
    <div className="fixed bottom-2 right-2 bg-gray-900/95 text-white text-xs p-3 rounded-lg max-w-[320px] max-h-[300px] overflow-auto font-mono z-50 shadow-xl border border-gray-700">
      <div className="flex justify-between items-center mb-2 pb-2 border-b border-gray-700">
        <span className="text-green-400 font-bold">Widget Debug</span>
        <button
          type="button"
          onClick={onToggle}
          className="text-gray-400 hover:text-white"
        >
          ×
        </button>
      </div>

      {/* Widget Info */}
      <div className="mb-3">
        <div className="text-yellow-400 text-[10px] uppercase tracking-wider mb-1">Widget</div>
        <div className="text-gray-300 text-[11px]">
          ID: {widgetId || 'N/A'}
        </div>
        <div className="text-gray-400 text-[10px]">
          {bounds.width}×{bounds.height} @ ({bounds.x}, {bounds.y})
        </div>
      </div>

      {/* State */}
      <div className="mb-3">
        <div className="text-yellow-400 text-[10px] uppercase tracking-wider mb-1">State</div>
        <pre className="text-gray-300 whitespace-pre-wrap text-[10px] bg-gray-800 rounded p-1.5 max-h-[80px] overflow-auto">
          {JSON.stringify(state, null, 2) || '{}'}
        </pre>
      </div>

      {/* Recent Events */}
      <div>
        <div className="text-yellow-400 text-[10px] uppercase tracking-wider mb-1">
          Events ({events.length})
        </div>
        <div className="space-y-1 max-h-[80px] overflow-auto">
          {events.slice(-8).reverse().map((e, i) => (
            <div
              key={`${e.timestamp}-${i}`}
              className="text-[10px] bg-gray-800 rounded px-1.5 py-0.5 flex justify-between items-center"
            >
              <span className="text-blue-400">{e.channel.replace('WIDGET_', '')}</span>
              {e.targetId && <span className="text-gray-500">#{e.targetId}</span>}
              <span className="text-gray-600 text-[9px]">
                {new Date(e.timestamp).toLocaleTimeString().split(' ')[0]}
              </span>
            </div>
          ))}
          {events.length === 0 && (
            <div className="text-gray-500 text-[10px] italic">No events yet</div>
          )}
        </div>
      </div>

      <div className="mt-2 pt-2 border-t border-gray-700 text-[9px] text-gray-500">
        Ctrl+Shift+D to toggle
      </div>
    </div>
  );
}

// Extend Window interface for electron and widget properties
declare global {
  interface Window {
    electron: {
      ipcRenderer: any;
    };
    ipcRenderer: any;
    options: any;
    widgetId?: string;
    onSetState?: (state: any) => void;
  }
}

const { ipcRenderer } = window.electron;
window.ipcRenderer = ipcRenderer;

log.info(` AppWidget module loaded`);

class ErrorBoundary extends React.Component {
  public state: { hasError: boolean; info: ErrorInfo } = {
    hasError: false,
    info: { componentStack: '' },
  };

  componentDidCatch(error: Error, info: ErrorInfo) {
    log.error(` ErrorBoundary caught error`, {
      error: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });
    this.setState({ hasError: true, info });
    ipcRenderer.send(Channel.WIDGET_ERROR, { error });
  }

  render() {
    const { hasError, info } = this.state;
    const { children } = this.props;
    if (hasError) {
      log.info(` Rendering error boundary UI`);
      return (
        <div className="p-2 font-mono">
          <button
            type="button"
            className="rounded bg-red-500 p-2 text-white"
            onClick={() => {
              log.info(` User clicked reload button in error boundary`);
              ipcRenderer.send(AppChannel.RELOAD);
            }}
          >
            Reload Prompt
          </button>

          <div className="text-base text-red-500">Rendering Error. Opening logs.</div>
          <div className="text-xs">{info.componentStack}</div>
        </div>
      );
    }

    return children;
  }
}

export default function AppWidget() {
  log.info(` AppWidget component rendering`);
  const [options, setOptions] = useState<WidgetOptions>({});
  const [contentWidth, setContentWidth] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const previousDimensionsRef = useRef({ width: 0, height: 0 });

  // Theme state - CSS string from main process
  const [theme, setTheme] = useState<string>('');

  // Ref to track if widget HTML has been inserted (prevents React from overwriting Vue's DOM)
  const widgetContainerRef = useRef<HTMLDivElement>(null);
  const htmlInsertedRef = useRef(false);

  // Debug state
  const [debugEvents, setDebugEvents] = useState<DebugEvent[]>([]);
  const [debugVisible, setDebugVisible] = useState(false);
  const [widgetState, setWidgetState] = useState<any>({});
  const [bounds, setBounds] = useState({ x: 0, y: 0, width: 0, height: 0 });

  // Track debug events
  const addDebugEvent = useCallback((channel: string, targetId?: string, data?: any) => {
    setDebugEvents(prev => {
      const newEvents = [...prev, { channel, targetId, timestamp: Date.now(), data }];
      // Keep last 50 events
      return newEvents.slice(-50);
    });
  }, []);

  // Toggle debug overlay
  const toggleDebug = useCallback(() => {
    setDebugVisible(prev => !prev);
  }, []);

  // Keyboard shortcut for debug toggle (Ctrl+Shift+D)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        toggleDebug();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [toggleDebug]);

  // Track window bounds
  useEffect(() => {
    const updateBounds = () => {
      setBounds({
        x: window.screenX,
        y: window.screenY,
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    updateBounds();
    window.addEventListener('resize', updateBounds);
    return () => window.removeEventListener('resize', updateBounds);
  }, []);

  useEffect(() => {
    log.info(` Setting up widget initialization effect`);

    const handleWidgetInit = (_event, options: WidgetOptions) => {
      log.info(` Widget init received`, {
        widgetId: options.widgetId,
        options: JSON.stringify(options),
      });

      // Reset HTML insertion flag for recycled windows
      // This ensures new widget content gets inserted even if window was reused from pool
      htmlInsertedRef.current = false;

      // Clear any existing content from recycled window
      if (widgetContainerRef.current) {
        widgetContainerRef.current.innerHTML = '';
      }

      setOptions(options);
      window.widgetId = options.widgetId;
      // Initialize widget state for debug
      if (options.state) {
        setWidgetState(options.state);
      }
      addDebugEvent('WIDGET_INIT', undefined, { widgetId: options.widgetId });
    };

    const handleWidgetTheme = (_event, themeCSS: string) => {
      log.info(` Widget theme received`, {
        themeLength: themeCSS?.length,
      });
      setTheme(themeCSS || '');
      addDebugEvent('WIDGET_THEME', undefined, { themeLength: themeCSS?.length });
    };

    log.info(` Adding listener for ${Channel.WIDGET_INIT}`);
    ipcRenderer.on(Channel.WIDGET_INIT, handleWidgetInit);

    log.info(` Adding listener for ${Channel.WIDGET_THEME}`);
    ipcRenderer.on(Channel.WIDGET_THEME, handleWidgetTheme);

    log.info(` Sending ${Channel.WIDGET_GET} to main process`);
    ipcRenderer.send(Channel.WIDGET_GET);

    return () => {
      log.info(` Cleanup: Removing ${Channel.WIDGET_INIT} listener`);
      ipcRenderer.off(Channel.WIDGET_INIT, handleWidgetInit);
      log.info(` Cleanup: Removing ${Channel.WIDGET_THEME} listener`);
      ipcRenderer.off(Channel.WIDGET_THEME, handleWidgetTheme);
    };
  }, []);

  // ResizeObserver for stable auto-sizing (replaces polling)
  useEffect(() => {
    log.info(` Setting up resize observer`);

    // Debounce timeout ref for cleanup
    let debounceTimeout: ReturnType<typeof setTimeout> | null = null;

    const resize = () => {
      if (!document.body.firstElementChild) {
        log.warn(` No first element child found for resize calculation`);
        return;
      }

      const element = document.body.firstElementChild as HTMLElement;
      const width = Math.ceil(element.offsetWidth || window.innerWidth);
      const height = Math.ceil(element.offsetHeight || window.innerHeight);

      const prevDimensions = previousDimensionsRef.current;

      if (width !== prevDimensions.width || height !== prevDimensions.height) {
        log.info(` Resizing widget`, { newWidth: width, newHeight: height });
        previousDimensionsRef.current = { width, height };

        // FIX: Send WIDGET_MEASURE with widgetId (process.ts listens for this)
        ipcRenderer.send(Channel.WIDGET_MEASURE, {
          widgetId: window.widgetId,
          width,
          height,
        });
      }
    };

    // Debounce resize to prevent rapid fire during animations/transitions
    const debouncedResize = () => {
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }
      debounceTimeout = setTimeout(resize, 50);
    };

    const observer = new ResizeObserver(() => debouncedResize());

    // Observe the widget container once it exists
    const target = document.body.firstElementChild || document.body;
    observer.observe(target);

    // Initial check
    resize();

    return () => {
      log.info(` Cleanup: Disconnecting resize observer`);
      observer.disconnect();
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }
    };
  }, [options?.body]);

  // Script processing moved to the HTML insertion effect below
  // to ensure #__widget-container exists before processing scripts

  useEffect(() => {
    log.info(` Setting up widget event handlers`);
    const __widgetContainer = document.getElementById('__widget-container') as HTMLElement;
    if (!__widgetContainer) {
      log.error(` Widget container not found for event handlers`);
      return;
    }

    const handleClick = (event) => {
      const closestIdElement = event.target.closest('*[id]');
      if (!closestIdElement) return;
      const targetId = closestIdElement.id;
      const message = { targetId, ...options };
      log.info(` Click event`, { targetId, options: JSON.stringify(options) });
      addDebugEvent('WIDGET_CLICK', targetId);
      ipcRenderer.send(Channel.WIDGET_CLICK, message);
    };

    const handleMouseDown = (event) => {
      const closestIdElement = event.target.closest('*[id]');
      if (!closestIdElement) return;
      const targetId = closestIdElement.id;
      const message = { targetId, ...options };
      log.info(` MouseDown event`, { targetId, options: JSON.stringify(options) });
      addDebugEvent('WIDGET_MOUSE_DOWN', targetId);
      ipcRenderer.send(Channel.WIDGET_MOUSE_DOWN, message);
    };

    const handleInput = (event) => {
      log.info(` Input event`, {
        targetId: event.target.id,
        value: event.target.value,
      });
      addDebugEvent('WIDGET_INPUT', event.target.id, { value: event.target.value });
      ipcRenderer.send(Channel.WIDGET_INPUT, {
        targetId: event.target.id,
        value: event.target.value,
        ...options,
      });
    };

    const handleDragEnter = (event) => {
      log.info(` DragEnter event`);
      __widgetContainer.classList.add('drag-shadow');
      event.preventDefault();
    };

    const handleDragEnd = (_event) => {
      log.info(` DragEnd event`);
      __widgetContainer.classList.remove('drag-shadow');
    };

    const handleDragLeave = (_event) => {
      log.info(` DragLeave event`);
      __widgetContainer.classList.remove('drag-shadow');
    };

    const handleDragOver = (event) => {
      log.info(` DragOver event`);
      event.dataTransfer.dropEffect = 'copy';
      event.preventDefault();
    };

    const handleDrop = (event) => {
      event.preventDefault();
      const { id = '' } = event.target.closest('*[id]') || {};
      const files = [];
      const eFiles = event.dataTransfer.files;

      for (const key in eFiles) {
        if (eFiles[key]?.path) {
          files.push(eFiles[key].path);
        }
      }

      log.info(` Drop event`, {
        targetId: id,
        fileCount: files.length,
        files,
      });

      addDebugEvent('WIDGET_DROP', id, { fileCount: files.length });
      ipcRenderer.send('WIDGET_DROP', {
        dataset: {
          ...event.target.dataset,
          files,
        },
        targetId: id,
        ...options,
      });
    };

    log.info(` Attaching event listeners`);
    document.addEventListener('click', handleClick);
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('input', handleInput);
    document.addEventListener('dragenter', handleDragEnter);
    document.addEventListener('dragend', handleDragEnd);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('drop', handleDrop);

    function Widget() {
      log.info(` Creating Widget instance`);
      window.onSetState = (state) => {
        log.info(` onSetState called`, { state: JSON.stringify(state) });
      };

      const fitWidget = () => {
        const firstChild = document.getElementById('__widget-container')?.firstElementChild;
        if (!(firstChild?.offsetWidth && firstChild.offsetHeight)) {
          log.warn(` Cannot fit widget: invalid dimensions`);
          return;
        }

        const display = firstChild.style.display;
        firstChild.style.display = 'inline-block';

        const data = {
          width: firstChild.offsetWidth,
          height: firstChild.offsetHeight,
          ...options,
        };

        log.info(` Fitting widget`, {
          width: data.width,
          height: data.height,
        });

        ipcRenderer.send('WIDGET_MEASURE', data);
        firstChild.style.display = display;
      };

      return {
        $template: '#widget-template',
        state: options?.state || {},
        ...(options?.state || {}),
        setState(state) {
          log.info(` Widget setState`, { newState: JSON.stringify(state) });
          for (const [key, value] of Object.entries(state)) {
            this[key] = value;
          }
        },
        mounted() {
          log.info(` Widget mounted`);

          ipcRenderer.on('WIDGET_FIT', (_event, _state) => {
            log.info(` WIDGET_FIT event received`);
            fitWidget();
          });

          ipcRenderer.on(Channel.WIDGET_SET_STATE, (_event, state) => {
            log.info(` WIDGET_SET_STATE event`, { state: JSON.stringify(state) });
            this.setState(state);
            window.onSetState(state);
            // Update debug state tracking
            setWidgetState(prev => ({ ...prev, ...state }));
            addDebugEvent('WIDGET_SET_STATE', undefined, state);
          });

          log.info(` Sending WIDGET_INIT`);
          ipcRenderer.send(Channel.WIDGET_INIT, {
            ...options,
          });
        },
      };
    }

    // Only create Vue app when we have valid options with a body
    // This prevents multiple Vue app instances from conflicting
    let vueApp: ReturnType<typeof createApp> | null = null;
    if (options?.body) {
      log.info(` Creating Vue app`);
      vueApp = createApp({
        Widget,
      });
      vueApp.mount();
    } else {
      log.info(` Skipping Vue app creation - no body yet`);
    }

    return () => {
      log.info(` Cleanup: Removing event listeners`);
      document.removeEventListener('click', handleClick);
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('input', handleInput);
      document.removeEventListener('dragenter', handleDragEnter);
      document.removeEventListener('dragend', handleDragEnd);
      document.removeEventListener('dragleave', handleDragLeave);
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('drop', handleDrop);
      // Cleanup Vue app to prevent multiple instances
      if (vueApp) {
        log.info(` Cleanup: Unmounting Vue app`);
        vueApp.unmount();
      }
    };
  }, [options]);

  // Track added scripts for cleanup
  const addedScriptsRef = useRef<HTMLScriptElement[]>([]);

  // Insert widget HTML into container ONCE to prevent React from overwriting Vue's DOM
  // Also process any <script> tags in the body (innerHTML doesn't execute scripts)
  useLayoutEffect(() => {
    if (options?.body && widgetContainerRef.current && !htmlInsertedRef.current) {
      const __html = `<template id="widget-template">
  ${options.body}
</template>
<div id="__widget-container" v-scope="Widget()" @vue:mounted="mounted" class="${options.containerClass || ''}"></div>`;

      log.info(` Inserting widget HTML into container (once only)`);
      widgetContainerRef.current.innerHTML = __html;
      htmlInsertedRef.current = true;

      // Process scripts AFTER HTML is inserted (innerHTML doesn't execute scripts)
      try {
        const container = document.getElementById('__widget-container');
        if (container) {
          const range = document.createRange();
          range.selectNode(container);
          const fragment = range.createContextualFragment(options.body);

          const scripts = fragment.querySelectorAll('script');
          log.info(` Processing ${scripts.length} scripts from widget body`);

          for (const script of scripts) {
            log.info(` Processing script`, {
              type: script.type,
              src: script.src,
              hasInlineContent: !!script.textContent,
            });
            const newScript = document.createElement('script');
            for (const attr of script.attributes) {
              newScript.setAttribute(attr.name, attr.value);
            }
            newScript.textContent = script.textContent;
            document.body.appendChild(newScript);
            addedScriptsRef.current.push(newScript);
          }
        }
      } catch (error) {
        log.error(` Error processing scripts`, {
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    // Cleanup scripts when component unmounts
    return () => {
      if (addedScriptsRef.current.length > 0) {
        log.info(` Cleanup: Removing ${addedScriptsRef.current.length} added scripts`);
        addedScriptsRef.current.forEach(script => script.remove());
        addedScriptsRef.current = [];
      }
    };
  }, [options?.body, options?.containerClass]);

  log.info(` Rendering AppWidget`, {
    hasBody: !!options?.body,
    containerClass: options.containerClass,
  });

  // Show debug overlay if debug option is enabled
  const showDebug = options?.debug === true;

  return (
    <ErrorBoundary>
      {/* Apply theme CSS from main process */}
      {theme && <style>{theme}</style>}
      {/* Use ref-based container to prevent React from overwriting Vue's DOM on re-renders */}
      <div ref={widgetContainerRef} />
      {showDebug && (
        <DebugOverlay
          widgetId={options?.widgetId}
          state={widgetState}
          events={debugEvents}
          bounds={bounds}
          visible={debugVisible}
          onToggle={toggleDebug}
        />
      )}
    </ErrorBoundary>
  );
}
