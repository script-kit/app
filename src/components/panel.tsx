/* eslint-disable no-nested-ternary */
import React, { RefObject, useRef } from 'react';
import SimpleBar from 'simplebar-react';
import useResizeObserver from '@react-hook/resize-observer';
import Highlight from 'react-highlight';
import { atom, useAtom } from 'jotai';
import { mainHeightAtom, panelHTMLAtom } from '../jotai';
import { useKeyDirection } from '../hooks';

interface PanelProps {
  width: number;
  height: number;
}
const scrollTarget = atom(0);

export default function Panel({ width, height }: PanelProps) {
  const scrollRef: RefObject<any> = useRef(null);
  const simpleRef: RefObject<any> = useRef(null);
  const divRef: RefObject<any> = useRef(null);

  const [panelHTML] = useAtom(panelHTMLAtom);
  const [mainHeight, setMainHeight] = useAtom(mainHeightAtom);
  const [top, setScrollTop] = useAtom(scrollTarget);

  useResizeObserver(divRef, (entry) => {
    if (entry?.contentRect?.height) {
      setMainHeight(entry.contentRect.height);
    }
  });

  useKeyDirection((key) => {
    scrollRef.current.scrollBy({
      top: key === 'up' ? -200 : 200,
      behavior: 'smooth',
    });
  }, []);

  return (
    <SimpleBar
      className={`
      shadow-inner
      `}
      scrollableNodeProps={{ ref: scrollRef }}
      style={
        {
          width,
          height,
          WebkitAppRegion: 'no-drag',
          WebkitUserSelect: 'text',
        } as any
      }
    >
      <div className="w-full h-full" ref={divRef}>
        <Highlight innerHTML>{panelHTML}</Highlight>
      </div>
    </SimpleBar>
  );
}
