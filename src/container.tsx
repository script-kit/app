/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-bitwise */
/* eslint-disable react/no-danger */
/* eslint-disable react/jsx-props-no-spreading */
/* eslint-disable no-restricted-syntax */
/* eslint-disable guard-for-in */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable react/no-array-index-key */
/* eslint-disable react/prop-types */
/* eslint-disable no-nested-ternary */
/* eslint-disable @typescript-eslint/no-shadow */
/* eslint-disable jsx-a11y/no-autofocus */
/* eslint-disable jsx-a11y/label-has-associated-control */
import { RefObject, useCallback, useEffect, useRef } from 'react';

import { useAtom, useSetAtom, useAtomValue } from 'jotai';
import AutoSizer from 'react-virtualized-auto-sizer';
import useResizeObserver from '@react-hook/resize-observer';
import { AnimatePresence, motion, useAnimation } from 'framer-motion';
import { debounce } from 'lodash';

import { UI } from '@johnlindquist/kit/core/enum';
import Tabs from './components/tabs';
import List from './components/list';
import Input from './components/input';
import ActionBar from './components/actionbar';
import Drop from './components/drop';
import Editor from './components/editor';
import Hotkey from './components/hotkey';
import Hint from './components/hint';
import Selected from './components/selected';
import TextArea from './components/textarea';
import Panel from './components/panel';
import Console from './components/console';
import Log from './components/log';
import Header from './components/header';
import Form from './components/form';

import { useEnter, useEscape, useShortcuts, useThemeDetector } from './hooks';
import Splash from './components/splash';
import Emoji from './components/emoji';
import Terminal from './term';
import Inspector from './components/inspector';
import {
  hintAtom,
  isHiddenAtom,
  isMouseDownAtom,
  logHTMLAtom,
  mainHeightAtom,
  mouseEnabledAtom,
  nullChoicesAtom,
  onDropAtom,
  onPasteAtom,
  // openAtom,
  panelHTMLAtom,
  scoredChoices,
  scriptAtom,
  showSelectedAtom,
  showTabsAtom,
  submitValueAtom,
  topHeightAtom,
  topRefAtom,
  uiAtom,
} from './jotai';

export default function Wrapper() {
  useShortcuts();
  useEnter();
  useThemeDetector();
  const controls = useAnimation();

  const ui = useAtomValue(uiAtom);
  // const [open, setOpen] = useAtom(openAtom);
  const setMainHeight = useSetAtom(mainHeightAtom);
  const setTopHeight = useSetAtom(topHeightAtom);
  const setMouseEnabled = useSetAtom(mouseEnabledAtom);
  const setIsMouseDown = useSetAtom(isMouseDownAtom);
  const setTopRef = useSetAtom(topRefAtom);
  const [hidden, setHidden] = useAtom(isHiddenAtom);
  const onDrop = useAtomValue(onDropAtom);
  const onPaste = useAtomValue(onPasteAtom);
  const setSubmitValue = useSetAtom(submitValueAtom);

  const [script, setScript] = useAtom(scriptAtom);
  const [hint, setHint] = useAtom(hintAtom);
  const [panelHTML, setPanelHTML] = useAtom(panelHTMLAtom);
  const [logHtml, setLogHtml] = useAtom(logHTMLAtom);
  const choices = useAtomValue(scoredChoices);
  const showSelected = useAtomValue(showSelectedAtom);
  const nullChoices = useAtomValue(nullChoicesAtom);
  const showTabs = useAtomValue(showTabsAtom);

  const mainRef: RefObject<HTMLDivElement> = useRef(null);
  const windowContainerRef: RefObject<HTMLDivElement> = useRef(null);
  const headerRef: RefObject<HTMLDivElement> = useRef(null);

  useResizeObserver(
    headerRef,
    debounce((entry) => {
      setTopHeight(entry.contentRect.height);
    }, 100)
  );

  const onMouseDown = useCallback(() => {
    setIsMouseDown(true);
  }, [setIsMouseDown]);
  const onMouseUp = useCallback(() => {
    setIsMouseDown(false);
  }, [setIsMouseDown]);
  const onMouseLeave = useCallback(() => {
    setIsMouseDown(false);
  }, [setIsMouseDown]);

  const onMouseMove = useCallback(() => {
    setMouseEnabled(1);
  }, [setMouseEnabled]);

  useEffect(() => {
    if (headerRef?.current) setTopRef(headerRef?.current);
  }, [headerRef, setTopRef]);

  // useEffect(() => {
  //   if (open) {
  //     controls.start({ opacity: [1, 1] });
  //   } else {
  //     controls.stop();
  //     controls.set({ opacity: 1 });
  //   }
  // }, [open, controls]);

  // const showIfOpen = useCallback(() => {
  //   if (open) setHidden(false);
  // }, [open, setHidden]);

  // const hideIfClosed = useCallback(() => {
  //   if (!open) setHidden(true);
  // }, [open, setHidden]);

  useEscape();

  // return (
  //   <div className="w-screen h-screen min-w-screen min-h-screen">
  //     <Header />
  //     <div className="h-1/2 w-full">
  //       <Editor />
  //     </div>
  //     <ActionBar />
  //   </div>
  // );

  return (
    <div
      className={`
        w-screen h-screen
        min-w-screen min-h-screen

      bg-bg-base
      text-text-base

      transition-colors duration-100
      border-secondary border-opacity-5
      bg-opacity-base

      `}
    >
      {/* {JSON.stringify(state)} */}
      <AnimatePresence key="appComponents">
        <motion.div
          animate={controls}
          // TODO: Maybe remove animation when not main menu?
          transition={{ duration: 0.1 }}
          // onAnimationStart={showIfOpen}
          // onAnimationComplete={hideIfClosed}
          ref={windowContainerRef}
          style={
            {
              WebkitUserSelect: 'none',
            } as any
          }
          className={`
        flex flex-col
        w-full h-full
        `}
          onMouseDown={onMouseDown}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseLeave}
          onMouseMove={onMouseMove}
        >
          {ui !== UI.log && (
            <header ref={headerRef} className="relative z-10">
              <Header />

              {ui === UI.hotkey && (
                <Hotkey
                  key="AppHotkey"
                  submit={setSubmitValue}
                  onHotkeyHeightChanged={setMainHeight}
                />
              )}

              {ui === UI.arg && <Input key="AppInput" />}

              {hint && <Hint key="AppHint" />}

              {(showTabs || showSelected) && (
                <div className="max-h-5.5">
                  {showTabs && <Tabs key="AppTabs" />}
                  {showSelected && <Selected key="AppSelected" />}
                </div>
              )}
            </header>
          )}
          <main
            ref={mainRef}
            className="flex-1 min-h-1 overflow-y-hidden w-full"
            onPaste={onPaste}
            onDrop={(event) => {
              console.log(`🎉 drop`);
              onDrop(event);
            }}
            onDragEnter={() => {
              console.log(`drag enter`);
            }}
            onDragOver={(event) => {
              event.stopPropagation();
              event.preventDefault();
            }}
          >
            <AnimatePresence key="mainComponents">
              {ui === UI.splash && <Splash />}
              {ui === UI.drop && <Drop />}
              {ui === UI.textarea && <TextArea />}
              {ui === UI.editor && <Editor />}
              {ui === UI.log && <Log />}
              {ui === UI.term && <Terminal />}
              {ui === UI.emoji && <Emoji />}
              {ui === UI.debugger && <Inspector />}
            </AnimatePresence>
            <AutoSizer>
              {({ width, height }) => (
                <>
                  {(ui === UI.arg && !nullChoices && choices.length > 0 && (
                    <>
                      <List height={height} width={width} />
                    </>
                  )) ||
                    (!!(ui === UI.arg || ui === UI.hotkey || ui === UI.div) &&
                      panelHTML.length > 0 && (
                        <>
                          <Panel width={width} height={height} />
                        </>
                      )) ||
                    (ui === UI.form && (
                      <>
                        <Form width={width} height={height} />
                      </>
                    ))}
                </>
              )}
            </AutoSizer>
          </main>
          {logHtml?.length > 0 && script?.log !== 'false' && (
            <Console key="AppLog" />
          )}
          <ActionBar />
        </motion.div>
      </AnimatePresence>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio id="audio" />
    </div>
  );
}
