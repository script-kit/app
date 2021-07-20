/* eslint-disable jsx-a11y/mouse-events-have-key-events */
import React, {
  RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import SimpleBar from 'simplebar-react';
import useResizeObserver from '@react-hook/resize-observer';
import parse from 'html-react-parser';
import { Channel } from 'kit-bridge/cjs/enum';
import { useAtom } from 'jotai';
import { ipcRenderer } from 'electron';
import { logHeightAtom, logHTMLAtom, scriptAtom } from '../jotai';
import { ReactComponent as EditFileIcon } from '../svg/icons8-edit-file.svg';

export default function Log() {
  const [script, setScript] = useAtom(scriptAtom);
  const containerRef: RefObject<any> = useRef(null);
  const divRef: RefObject<any> = useRef(null);
  const [mouseOver, setMouseOver] = useState(false);

  const [logHTML] = useAtom(logHTMLAtom);
  const [logHeight, setLogHeight] = useAtom(logHeightAtom);

  const editLog = useCallback(() => {
    ipcRenderer.send(Channel.OPEN_SCRIPT_LOG, script);
  }, []);

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
      className="relative"
      onMouseOver={() => setMouseOver(true)}
      onMouseOut={() => setMouseOver(false)}
    >
      <SimpleBar
        forceVisible="y"
        className="log
        w-full h-16 bg-black text-white dark:bg-white dark:text-black bg-opacity-80 dark:bg-opacity-60
        font-mono text-xs"
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
        `}
          ref={divRef}
        >
          {parse(`${logHTML}`)}
        </div>
      </SimpleBar>
      <EditFileIcon
        className={`absolute top-4 right-3  text-primary-dark dark:text-primary-light h-6 w-6
        fill-current
        ${
          mouseOver ? 'text-opacity-100' : 'text-opacity-20'
        } hover:cursor-pointer
        `}
        onClick={editLog}
        viewBox="0 0 32 32"
      />
    </div>
  );
}
