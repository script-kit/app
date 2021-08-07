/* eslint-disable no-nested-ternary */
import React, { RefObject, useRef } from 'react';
import SimpleBar from 'simplebar-react';
import Highlight from 'react-highlight';
import { useAtom } from 'jotai';
import { panelHTMLAtom } from '../jotai';
import {
  useEnter,
  useEscape,
  useKeyDirection,
  useObserveMainHeight,
  useOpen,
} from '../hooks';

interface PanelProps {
  width: number;
  height: number;
}

export default function Panel({ width, height }: PanelProps) {
  useEscape();
  useEnter();
  useOpen();
  const scrollRef: RefObject<any> = useRef(null);
  const [panelHTML] = useAtom(panelHTMLAtom);

  const divRef = useObserveMainHeight();

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
