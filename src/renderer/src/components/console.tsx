/* eslint-disable jsx-a11y/mouse-events-have-key-events */
import React, { RefObject, useCallback, useRef, useState } from 'react';
import SimpleBar from 'simplebar-react';
import useResizeObserver from '@react-hook/resize-observer';
import { PencilAltIcon } from '@heroicons/react/outline';
import parse from 'html-react-parser';
import { useAtom } from 'jotai';
const { ipcRenderer } = window.electron;
import { logHeightAtom, logHTMLAtom, scriptAtom } from '../jotai';
import { AppChannel } from '../enums';

export default function Console() {
  const [script, setScript] = useAtom(scriptAtom);
  const containerRef: RefObject<any> = useRef(null);
  const divRef: RefObject<any> = useRef(null);
  const [mouseOver, setMouseOver] = useState(false);

  const [logHTML] = useAtom(logHTMLAtom);
  const [logHeight, setLogHeight] = useAtom(logHeightAtom);

  const editLog = useCallback(() => {
    ipcRenderer.send(AppChannel.OPEN_SCRIPT_LOG, script);
  }, [script]);

  useResizeObserver(divRef, (entry) => {
    if (entry?.contentRect?.height) {
      setLogHeight(entry.contentRect.height);
      const curr = containerRef?.current;
      if (curr) {
        curr?.scrollTo({ top: curr?.scrollHeight, behavior: 'smooth' });
      }
    }
  });

  // useEffect(() => {
  //   if (containerRef?.current?.firstElementChild) {
  //     onPanelHeightChanged(
  //       containerRef?.current?.firstElementChild?.clientHeight
  //     );
  //   }
  // }, [onPanelHeightChanged, containerRef?.current?.firstElementChild]);

  return (
    <div
      key="log"
      id="log"
      className="relative"
      onMouseOver={() => setMouseOver(true)}
      onMouseOut={() => setMouseOver(false)}
    >
      <SimpleBar
        forceVisible="y"
        className="log
        h-16 w-full
        bg-bg-base/20 font-mono
        text-xs text-text-base
        hover:cursor-auto
        "
        scrollableNodeProps={{ ref: containerRef }}
        style={
          {
            WebkitAppRegion: 'no-drag',
            WebkitUserSelect: 'text',
          } as any
        }
      >
        <div
          className={`
       px-4
       pb-4
        `}
          ref={divRef}
        >
          {parse(`${logHTML}`)}
        </div>
      </SimpleBar>
      {!script.name?.startsWith('error') && (
        <PencilAltIcon
          className={`
        absolute
        top-1.5 right-1.5
        h-5 w-5
        ${mouseOver ? 'opacity-50' : 'opacity-20'}
        text-text-base transition
        ease-in
        hover:cursor-pointer
        hover:opacity-100
        `}
          onClick={editLog}
        />
      )}
    </div>
  );
}
