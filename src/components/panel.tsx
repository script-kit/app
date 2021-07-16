import React, { RefObject, useEffect, useRef } from 'react';
import SimpleBar from 'simplebar-react';
import useResizeObserver from '@react-hook/resize-observer';
import parse from 'html-react-parser';
import { useAtom } from 'jotai';
import { panelHTMLAtom } from '../jotai';

interface PanelProps {
  onPanelHeightChanged: (height: number) => void;
  width: number;
  height: number;
}

export default React.forwardRef<HTMLDivElement, PanelProps>(function Panel(
  { onPanelHeightChanged, width, height }: PanelProps,
  ref
) {
  const containerRef: RefObject<any> = useRef(null);
  const divRef: RefObject<any> = useRef(null);

  const [panelHTML] = useAtom(panelHTMLAtom);

  useResizeObserver(divRef, (entry) => {
    if (entry?.contentRect?.height) {
      onPanelHeightChanged(entry.contentRect.height);
    }
  });

  useEffect(() => {
    if (containerRef?.current?.firstElementChild) {
      onPanelHeightChanged(
        containerRef?.current?.firstElementChild?.clientHeight
      );
    }
  }, [onPanelHeightChanged, containerRef?.current?.firstElementChild]);

  return (
    <SimpleBar
      scrollableNodeProps={{ ref: containerRef }}
      style={
        {
          WebkitAppRegion: 'no-drag',
          WebkitUserSelect: 'text',
          width,
          height,
        } as any
      }
    >
      <div ref={divRef}>{parse(`${panelHTML}`)}</div>
    </SimpleBar>
  );
});
