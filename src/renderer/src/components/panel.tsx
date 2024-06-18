import { UI } from '@johnlindquist/kit/core/enum';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
/* eslint-disable no-nested-ternary */
import React, { type RefObject, useEffect, useLayoutEffect, useRef } from 'react';
import SimpleBar from 'simplebar-react';

import useResizeObserver from '@react-hook/resize-observer';
import { darkTheme, lightTheme } from '../../../shared/themes';
import { useKeyDirection } from '../hooks';
import {
  darkAtom,
  domUpdatedAtom,
  flagsAtom,
  inputFocusAtom,
  mouseEnabledAtom,
  panelHTMLAtom,
  shortcutsAtom,
  uiAtom,
} from '../jotai';

function extractInnerHtmlAndClasses(panelHTML: string) {
  // if panelHTML isn't wrapped in a tag, wrap it in a div
  if (!panelHTML.startsWith('<')) {
    // eslint-disable-next-line no-param-reassign
    panelHTML = `<div>${panelHTML}</div>`;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(panelHTML, 'text/html');
  const outerElement = doc.body.firstChild as HTMLElement;

  if (outerElement && outerElement.tagName.toLowerCase() === 'div') {
    const containerClasses = outerElement.getAttribute('class') || '';
    const { innerHTML } = outerElement;
    return { __html: innerHTML, containerClasses };
  }

  return { __html: panelHTML, containerClasses: '' };
}

export default function Panel() {
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

  const domUpdated = useSetAtom(domUpdatedAtom);
  const panelRef = useRef<HTMLDivElement>(null);

  useResizeObserver(panelRef, (entry) => {
    domUpdated()('Panel useResizeObserver');
  });

  useLayoutEffect(() => {
    domUpdated()('Panel useLayoutEffect');

    return () => {
      // domUpdated()(`Panel useLayoutEffect cleanup`);
    };
  }, [panelHTML, domUpdated]);

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
    [scrollRef?.current, inputFocus, shortcuts, flags],
  );

  const { __html, containerClasses } = extractInnerHtmlAndClasses(panelHTML);

  return (
    <SimpleBar
      id="panel-simplebar"
      scrollableNodeProps={{ ref: scrollRef }}
      className="h-full w-full"
      style={
        {
          cursor: mouseEnabled ? 'auto' : 'none',
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

      <div
        id="panel"
        ref={panelRef}
        className={`
        ${containerClasses}
        wrapper
       `}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html,
        }}
      />
    </SimpleBar>
  );
}
