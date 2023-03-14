import React, { RefObject, useCallback, useEffect, useRef } from 'react';
import { ipcRenderer, shell } from 'electron';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { Unicode11Addon } from 'xterm-addon-unicode11';
import { SearchAddon } from 'xterm-addon-search';
import { LigaturesAddon } from 'xterm-addon-ligatures';
import { SerializeAddon } from 'xterm-addon-serialize';
import useResizeObserver from '@react-hook/resize-observer';
import { motion } from 'framer-motion';
import { throttle } from 'lodash';
import { Channel } from '@johnlindquist/kit/cjs/enum';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  appDbAtom,
  darkAtom,
  openAtom,
  sendShortcutAtom,
  shortcutsAtom,
  submittedAtom,
  submitValueAtom,
  termConfigAtom,
} from './jotai';

import XTerm from './components/xterm';
import { AppChannel } from './enums';
import { AttachIPCAddon } from './term-attach-ipc-addon';

const defaultTheme = {
  foreground: '#2c3e50',
  background: '#ffffff00',
  cursor: 'rgba(0, 0, 0, .4)',
  selection: 'rgba(0, 0, 0, 0.3)',
  black: '#000000',
  red: '#e83030',
  brightRed: '#e83030',
  green: '#42b983',
  brightGreen: '#42b983',
  brightYellow: '#ea6e00',
  yellow: '#ea6e00',
  magenta: '#e83030',
  brightMagenta: '#e83030',
  cyan: '#03c2e6',
  brightBlue: '#03c2e6',
  brightCyan: '#03c2e6',
  blue: '#03c2e6',
  white: '#d0d0d0',
  brightBlack: '#808080',
  brightWhite: '#ffffff',
};

const darkTheme = {
  ...defaultTheme,
  foreground: '#fff',
  background: '#00000000',
  cursor: 'rgba(255, 255, 255, .4)',
  selection: 'rgba(255, 255, 255, 0.3)',
  magenta: '#e83030',
  brightMagenta: '#e83030',
};

export default function Terminal() {
  const xtermRef = useRef<XTerm>(null);
  const fitRef = useRef(new FitAddon());
  const [, submit] = useAtom(submitValueAtom);
  const submitted = useAtomValue(submittedAtom);
  const [open] = useAtom(openAtom);
  const [isDark] = useAtom(darkAtom);
  const containerRef = useRef<HTMLDivElement>(null);
  const [termConfig, setTermConfig] = useAtom(termConfigAtom);
  const shortcuts = useAtomValue(shortcutsAtom);
  const sendShortcut = useSetAtom(sendShortcutAtom);

  const attachAddonRef = useRef<AttachIPCAddon | null>(null);

  useEffect(() => {
    if (xtermRef?.current?.terminal && !open) {
      xtermRef.current?.terminal?.clear();
    }
  }, [open]);

  // useEscape();

  useEffect(() => {
    if (!xtermRef?.current?.terminal) return;
    const t = xtermRef.current.terminal;

    // console.log(`onopen`, { ws });

    // console.log(`loadAddon`, xtermRef?.current?.terminal.loadAddon);

    t.loadAddon(fitRef.current);
    t.loadAddon(
      new WebLinksAddon((e, uri) => {
        shell.openExternal(uri);
      })
    );

    // t.loadAddon(new WebglAddon());
    t.loadAddon(new Unicode11Addon());
    t.loadAddon(new SearchAddon());
    t.loadAddon(new LigaturesAddon());
    t.loadAddon(new SerializeAddon());

    if (fitRef?.current) {
      fitRef.current.fit();
    }
    t.focus();

    setTimeout(() => {
      t.focus();
      if (fitRef?.current) {
        fitRef.current.fit();
      }
    }, 250);
  }, []);

  useEffect(() => {
    if (!xtermRef?.current?.terminal) return;
    const t = xtermRef.current.terminal;
    t.onKey((x: any) => {
      if (x.domEvent.metaKey) {
        const shortcut = `cmd+${x.domEvent.key.toLowerCase}`;
        sendShortcut(shortcut);
      }
      if (x.domEvent.ctrlKey) {
        const shortcut = `ctrl+${x.domEvent.key.toLowerCase}`;
        sendShortcut(shortcut);
      }
      if (x.domEvent.altKey) {
        const shortcut = `alt+${x.domEvent.key.toLowerCase}`;
        sendShortcut(shortcut);
      }
    });
  }, [sendShortcut, shortcuts]);

  useEffect(() => {
    if (!xtermRef?.current?.terminal) return;
    const t = xtermRef.current.terminal;
    if (attachAddonRef.current) return;
    const attachAddon = new AttachIPCAddon(termConfig);
    attachAddonRef.current = attachAddon;
    t.loadAddon(attachAddon);
  }, [termConfig]);

  useEffect(() => {
    if (submitted) {
      if (attachAddonRef.current) {
        attachAddonRef.current.dispose();
        setTermConfig(null);
      }
    }
  }, [setTermConfig, submitted]);

  const [appDb] = useAtom(appDbAtom);

  const onResize = useCallback(
    ({ rows, cols }: { cols: number; rows: number }) => {
      // debounce(({ rows, cols }) => {
      if (!rows || !cols) return;

      ipcRenderer.send(AppChannel.TERM_RESIZE, { rows, cols });
    },
    // }, 250),
    []
  );

  // Detect when container is resized
  useResizeObserver(
    containerRef,
    throttle((entry) => {
      if (!fitRef?.current) return;
      fitRef.current.fit();
    }, 250)
  );

  return (
    <motion.div
      key="terminal"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1] }}
      transition={{ duration: 0.5, ease: 'circOut' }}
      className="w-full h-full pt-3 -mb-6 px-3 max-h-full"
    >
      <div
        ref={containerRef as RefObject<HTMLDivElement>}
        className="w-full h-full"
      >
        <XTerm
          onResize={onResize}
          className="w-full h-full max-h-fit"
          options={{
            fontFamily: appDb?.termFont || 'monospace',
            allowTransparency: true,
            theme: isDark ? darkTheme : defaultTheme,
            allowProposedApi: true,
          }}
          ref={xtermRef}
          addons={[]}
        />
      </div>
    </motion.div>
  );
}
