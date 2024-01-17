import React, { RefObject, useEffect, useRef } from 'react';
import { UI } from '@johnlindquist/kit/core/enum';
const { ipcRenderer, shell } = window.electron;
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { Unicode11Addon } from 'xterm-addon-unicode11';
import { SearchAddon } from 'xterm-addon-search';
import { LigaturesAddon } from 'xterm-addon-ligatures';
import { SerializeAddon } from 'xterm-addon-serialize';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { throttle } from 'lodash-es';
import useResizeObserver from '@react-hook/resize-observer';
import {
  appBoundsAtom,
  appDbAtom,
  darkAtom,
  hasPreviewAtom,
  logAtom,
  promptDataAtom,
  sendShortcutAtom,
  shortcutsAtom,
  termConfigAtom,
  termFontAtom,
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
  const xtermRef = useRef<XTerm | null>(null);
  const fitRef = useRef(new FitAddon());
  const [isDark] = useAtom(darkAtom);
  const containerRef = useRef<HTMLDivElement>(null);
  const [termConfig] = useAtom(termConfigAtom);
  const [promptData] = useAtom(promptDataAtom);
  const shortcuts = useAtomValue(shortcutsAtom);
  const sendShortcut = useSetAtom(sendShortcutAtom);
  const [hasPreview] = useAtom(hasPreviewAtom);
  const [fontFamily] = useAtom(termFontAtom);

  const attachAddonRef = useRef<AttachIPCAddon | null>(null);

  // useEscape();

  useEffect(() => {
    ipcRenderer.once(AppChannel.PTY_READY, () => {
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
        if (t) t.focus();
        if (fitRef.current) fitRef.current.fit();
      }, 250);
    });
  }, []);

  const terminalKeyReadyRef = useRef(false);
  useEffect(() => {
    terminalKeyReadyRef.current = false;
  }, []);

  useEffect(() => {
    if (!xtermRef?.current?.terminal) return;
    const t = xtermRef.current.terminal;
    if (terminalKeyReadyRef.current) return;
    t.onKey((x: any) => {
      if (!x || !x.domEvent) return;
      if (x.domEvent.metaKey) {
        const shortcut = `cmd+${x.domEvent.key.toLowerCase()}`;
        sendShortcut(shortcut);
      }
      if (x.domEvent.ctrlKey) {
        const shortcut = `ctrl+${x.domEvent.key.toLowerCase()}`;
        sendShortcut(shortcut);
      }
      if (x.domEvent.altKey) {
        const shortcut = `alt+${x.domEvent.key.toLowerCase()}`;
        sendShortcut(shortcut);
      }
    });
    terminalKeyReadyRef.current = true;
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
    if (termConfig.promptId !== promptData?.id && attachAddonRef.current) {
      attachAddonRef.current.dispose();
      attachAddonRef.current = null;
      xtermRef.current = null;
    }
  }, [termConfig, promptData]);

  useEffect(() => {
    return () => {
      if (attachAddonRef.current) {
        attachAddonRef.current.dispose();
        attachAddonRef.current = null;
        xtermRef.current = null;
      }
    };
  }, []);

  const [appDb] = useAtom(appDbAtom);
  const appBounds = useAtomValue(appBoundsAtom);
  const log = useAtomValue(logAtom);

  // useEffect(() => {
  //   if (!fitRef?.current) return;
  //   fitRef.current.fit();
  //   const dimensions = fitRef.current.proposeDimensions();
  //   if (!dimensions) return;
  //   ipcRenderer.send(AppChannel.TERM_RESIZE, dimensions);
  // }, [appBounds]);

  useResizeObserver(
    containerRef,
    throttle((entry) => {
      if (!fitRef?.current) return;
      fitRef.current.fit();
      const dimensions = fitRef.current.proposeDimensions();
      if (!dimensions) return;
      ipcRenderer.send(AppChannel.TERM_RESIZE, dimensions);
    }, 150)
  );

  return (
    <div
      id={UI.term}
      key="terminal"
      className="-mb-6 h-full max-h-full w-full flex-1 overflow-hidden px-3 pt-3"
    >
      <div
        ref={containerRef as RefObject<HTMLDivElement>}
        className="h-full w-full"
      >
        <XTerm
          className="h-full max-h-fit w-full max-w-screen-md"
          options={{
            fontFamily,
            allowTransparency: true,
            theme: isDark ? darkTheme : defaultTheme,
            allowProposedApi: true,
          }}
          ref={xtermRef}
          addons={[]}
        />
      </div>
    </div>
  );
}
