/* eslint-disable no-nested-ternary */
import React, { LegacyRef, RefObject, useEffect, useRef } from 'react';
import SimpleBar from 'simplebar-react';
import { useAtom } from 'jotai';
import { motion, useAnimation } from 'framer-motion';
import { UI } from '@johnlindquist/kit/cjs/enum';

import {
  mouseEnabledAtom,
  panelHTMLAtom,
  darkAtom,
  inputFocusAtom,
  uiAtom,
} from '../jotai';
import {
  useEnter,
  useEscape,
  useKeyDirection,
  useObserveMainHeight,
  useOpen,
} from '../hooks';
import { darkTheme, lightTheme } from './themes';

interface PanelProps {
  width: number;
  height: number;
}

export default function Panel({ width, height }: PanelProps) {
  // useEscape();
  useEnter(); // Is this needed?
  useOpen();
  const scrollRef: RefObject<any> = useRef(null);
  const [panelHTML] = useAtom(panelHTMLAtom);
  const [mouseEnabled] = useAtom(mouseEnabledAtom);
  const [isDark] = useAtom(darkAtom);
  const [inputFocus] = useAtom(inputFocusAtom);
  const [ui] = useAtom(uiAtom);

  const divRef = useObserveMainHeight<HTMLDivElement>('.wrapper');

  useEffect(() => {
    if (scrollRef.current && ui === UI.div) {
      scrollRef?.current?.focus();
    }
  }, [inputFocus, scrollRef]);

  useKeyDirection(
    (key) => {
      if (inputFocus) {
        scrollRef.current.scrollBy({
          top: key.endsWith('up') ? -200 : 200,
          behavior: 'smooth',
        });
      }
    },
    [scrollRef?.current, inputFocus]
  );

  return (
    <SimpleBar
      scrollableNodeProps={{ ref: scrollRef }}
      style={
        {
          cursor: mouseEnabled ? 'auto' : 'none',
          width,
          height,
          maxHeight: height,
          WebkitAppRegion: 'no-drag',
          WebkitUserSelect: 'text',
        } as any
      }
    >
      {/* <div className="w-full h-full" ref={divRef as LegacyRef<HTMLDivElement>}>
        <Highlight innerHTML>{panelHTML}</Highlight>
      </div> */}
      <style type="text/css">{isDark ? darkTheme : lightTheme}</style>
      <style>{`*:focus {
    outline: none;
}`}</style>

      <motion.div
        id="panel"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1] }}
        transition={{ duration: 0.5, ease: 'circOut' }}
        className={`
        wrapper
       `}
        ref={divRef as any}
        dangerouslySetInnerHTML={{ __html: panelHTML }}
      />
    </SimpleBar>
  );
}
