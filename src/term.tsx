import React, { RefObject, useEffect, useRef } from 'react';
import { XTerm } from 'xterm-for-react';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { Unicode11Addon } from 'xterm-addon-unicode11';
import { SearchAddon } from 'xterm-addon-search';
import { LigaturesAddon } from 'xterm-addon-ligatures';
import { SerializeAddon } from 'xterm-addon-serialize';
import { AttachAddon } from 'xterm-addon-attach';
import useResizeObserver from '@react-hook/resize-observer';
import { motion } from 'framer-motion';
import { throttle } from 'lodash';

import { useAtom } from 'jotai';
import { openAtom, socketURLAtom, submitValueAtom } from './jotai';
import { useEscape } from './hooks';

export default function Terminal() {
  const xtermRef = useRef<XTerm>(null);
  const fitRef = useRef(new FitAddon());
  const [socketURL] = useAtom(socketURLAtom);
  const [, submit] = useAtom(submitValueAtom);
  const [open] = useAtom(openAtom);
  const containerRef = useRef<HTMLDivElement>(null);

  useResizeObserver(
    containerRef,
    throttle((entry) => {
      if (entry?.contentRect?.height) {
        // console.log(`Fitting....`);
        fitRef.current.fit();
      }
    }, 50)
  );

  useEffect(() => {
    if (xtermRef?.current?.terminal && !open) {
      xtermRef.current?.terminal?.clear();
    }
  }, [open]);

  useEscape();

  useEffect(() => {
    if (socketURL) {
      const ws = new WebSocket(`${socketURL}/terminals/1`);
      ws.onopen = () => {
        if (!xtermRef?.current?.terminal) return;
        const t = xtermRef.current.terminal;

        // console.log(`onopen`, { ws });
        const attachAddon = new AttachAddon(ws);

        // console.log(`loadAddon`, xtermRef?.current?.terminal.loadAddon);

        t.loadAddon(fitRef.current);
        t.loadAddon(new WebLinksAddon());
        t.loadAddon(new Unicode11Addon());
        t.loadAddon(new SearchAddon());
        t.loadAddon(new LigaturesAddon());
        t.loadAddon(new SerializeAddon());

        t.onKey((x) => {
          // console.log({ key: x });
          if (
            (x?.domEvent.key === 'Enter' && x?.domEvent.metaKey) ||
            x.domEvent.ctrlKey
          ) {
            // const line = t.buffer.normal
            //   .getLine(t.buffer.normal.cursorY)
            //   ?.translateToString(true);

            // console.log({ line });

            // console.log(`SUBMIT`);
            submit('');
            attachAddon.dispose();
          }
        });

        t.loadAddon(attachAddon);

        fitRef.current.fit();
        t.focus();
      };
    } else {
      xtermRef?.current?.terminal?.clear();
    }
  }, [xtermRef?.current?.terminal, socketURL]);

  return (
    <motion.div
      key="terminal"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1] }}
      transition={{ duration: 0.5, ease: 'circOut' }}
      className="w-full h-full p-3"
      ref={containerRef as RefObject<HTMLDivElement>}
    >
      <XTerm
        options={{
          fontFamily: 'monospace',
          allowTransparency: true,
          theme: {
            background: '#00000000',
          },
        }}
        ref={xtermRef}
        addons={[]}
      />
    </motion.div>
  );
}
