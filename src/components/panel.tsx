/* eslint-disable no-nested-ternary */
import React, { RefObject, useEffect, useRef } from 'react';
import SimpleBar from 'simplebar-react';
import { useAtom, useAtomValue } from 'jotai';
import { motion } from 'framer-motion';
import { UI } from '@johnlindquist/kit/core/enum';

import {
  mouseEnabledAtom,
  panelHTMLAtom,
  darkAtom,
  inputFocusAtom,
  uiAtom,
  shortcutsAtom,
  flagsAtom,
} from '../jotai';
import { useKeyDirection, useObserveMainHeight } from '../hooks';
import { darkTheme, lightTheme } from './themes';

interface PanelProps {
  width: number;
  height: number;
}

export default function Panel({ width, height }: PanelProps) {
  // useEscape();
  // useEnter(); // Is this needed?
  // useOpen();
  const scrollRef: RefObject<any> = useRef(null);
  const panelHTML = useAtomValue(panelHTMLAtom);
  const [mouseEnabled] = useAtom(mouseEnabledAtom);
  const [isDark] = useAtom(darkAtom);
  const [inputFocus] = useAtom(inputFocusAtom);
  const [ui] = useAtom(uiAtom);
  const [shortcuts] = useAtom(shortcutsAtom);
  const [flags] = useAtom(flagsAtom);

  const divRef = useObserveMainHeight<HTMLDivElement>('.wrapper');

  useEffect(() => {
    if (scrollRef.current && ui === UI.div) {
      scrollRef?.current?.focus();
    }
  }, [inputFocus, scrollRef, ui]);

  useKeyDirection(
    (key) => {
      if (inputFocus) {
        scrollRef.current.scrollBy({
          top: key.endsWith('up') ? -200 : 200,
          behavior: 'smooth',
        });
      }
    },
    [scrollRef?.current, inputFocus, shortcuts, flags]
  );

  // remove the outermost tags from panelHTML
  // /^<[^>]+>|<\/[^>]+>$/g
  let __html = panelHTML.replace(/^<[^>]+>|<\/[^>]+>$/g, '');
  let containerClasses = '';
  const [, container] = panelHTML?.match(/class="([^"]*)"/) || ['', ''];
  if (container) {
    containerClasses = container;
    __html = panelHTML.replace(/^<[^>]+>|<\/[^>]+>$/g, '');
  }

  return (
    <SimpleBar
      scrollableNodeProps={{ ref: scrollRef }}
      autoHide={false}
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
        transition={{ duration: 0.25, ease: 'circOut' }}
        className={`
        ${ui === UI.hotkey ? 'h-10' : ''}
        ${containerClasses}
        wrapper
       `}
        ref={divRef as any}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html,
        }}
      />
    </SimpleBar>
  );
}
