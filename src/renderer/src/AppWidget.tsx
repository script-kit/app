import { Channel } from '@johnlindquist/kit/core/enum';
import { WidgetOptions } from '@johnlindquist/kit/types/pro';
import { useEffect, useState } from 'react';

const { ipcRenderer } = window.electron;

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

    document.addEventListener('click', handleClick);
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('input', handleInput);

    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('input', handleInput);
    };
  }, [options]);

  return (
    <div
      dangerouslySetInnerHTML={{
        __html: options?.body || `<div>Body Missing</div>`,
      }}
    ></div>
  );
}
