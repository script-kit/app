import React, { RefObject, useEffect, useRef } from 'react';
import SimpleBar from 'simplebar-react';
import useResizeObserver from '@react-hook/resize-observer';
import parse from 'html-react-parser';
import { useAtom } from 'jotai';
import { panelHTMLAtom } from '../jotai';

interface PanelProps {
  onContainerHeightChanged: (height: number) => void;
}

export default React.forwardRef<HTMLDivElement, PanelProps>(function Panel(
  { onContainerHeightChanged }: PanelProps,
  ref
) {
  const containerRef: RefObject<any> = useRef(null);
  const divRef: RefObject<any> = useRef(null);

  const [panelHTML] = useAtom(panelHTMLAtom);

  useResizeObserver(divRef, (entry) => {
    if (entry?.contentRect?.height) {
      onContainerHeightChanged(entry.contentRect.height);
    }
  });

  useEffect(() => {
    if (containerRef?.current?.firstElementChild) {
      onContainerHeightChanged(
        containerRef?.current?.firstElementChild?.clientHeight
      );
    }
  }, [onContainerHeightChanged, containerRef?.current?.firstElementChild]);

  return (
    <SimpleBar
      className="w-full h-full"
      scrollableNodeProps={{ ref: containerRef }}
      style={
        {
          WebkitAppRegion: 'no-drag',
          WebkitUserSelect: 'text',
        } as any
      }
    >
      <div ref={divRef}>{parse(`${panelHTML}`)}</div>
    </SimpleBar>
  );
});
