// src/renderer/src/state/controllers/ResizeController.tsx

import React, { useLayoutEffect, useRef, useCallback, useEffect } from 'react';
import { useAtomValue, useStore } from 'jotai';

// Import necessary enums, types, constants, and utils
import { AppChannel } from '../../../../shared/enums';
import { Channel, Mode, UI, PROMPT } from '@johnlindquist/kit/core/enum';
import type { ResizeData, PromptData } from '../../../../shared/types';
import { createLogger } from '../../log-utils';
import { resizeInflightAtom } from '../resize/scheduler';
import { resizeInputsAtom } from '../selectors/resizeInputs';
import { performResize } from '../services/resize';

// Import from facade for gradual migration
import {
  _mainHeight, // The trigger atom
  channelAtom,
  promptDataAtom,
  scriptAtom,
  inputAtom,
  isSplashAtom,
  isMainScriptAtom,
} from '../../jotai';

import { prevMh, resizeTickAtom } from '../atoms/ui-elements';
import { _inputChangedAtom } from '../atoms/input';
import { _open } from '../atoms/lifecycle';
import { _tabIndex } from '../atoms/tabs';
import { _script } from '../atoms/script-state';

const log = createLogger('ResizeController.ts');
const { ipcRenderer } = window.electron;

// Restore IPC helpers
const sendResize = (data: ResizeData) => ipcRenderer.send(AppChannel.RESIZE, data);

const isDebugResizeEnabled = (): boolean => {
  try {
    return Boolean((window as any).DEBUG_RESIZE);
  } catch {
    return false;
  }
};

export const ResizeController: React.FC = () => {
  const store = useStore();
  const lastSigRef = useRef<string>('');
  const framePendingRef = useRef(false);
  const lastReasonRef = useRef<string>('INIT');
  const lastPromptIdRef = useRef<string | undefined>(undefined);
  const lastScriptPathRef = useRef<string | undefined>(undefined);
  const recheckCountsRef = useRef<Record<string, number>>({});
  const lastChoicesLengthRef = useRef<number | undefined>(undefined);
  const pendingChoicesTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastChoicesScheduleKeyRef = useRef<string>('');

  // Subscribe to the trigger atom. Updates to this atom signal a resize check is needed.
  const mainHeightTrigger = useAtomValue(_mainHeight);
  // Also re-run when other atoms request a recompute
  const tick = useAtomValue(resizeTickAtom);

  // Ensure we run at least once on each new prompt/script even if heights are identical.
  const promptDataForKey = useAtomValue(promptDataAtom) as Partial<PromptData> | undefined;
  const scriptForKey = useAtomValue(scriptAtom) as any;
  const promptChangeKey = `${promptDataForKey?.id ?? ''}|${scriptForKey?.script?.filePath ?? ''}`;

  // Define the resize execution using useCallback for a stable reference.
  // Called by scheduleResizeExecution to run at most once per animation frame
  const executeResize = useCallback(
    (reason = 'UNSET') => {
      log.info(`ResizeController.executeResize called with reason: ${reason}`);
      const g = store.get;
      const debug = isDebugResizeEnabled();
      const input = g(resizeInputsAtom);

      if (input.promptResizedByHuman) {
        g(channelAtom)(Channel.SET_BOUNDS, input.promptBounds);
        return;
      }

      if (!input.promptActive) return;

      const promptData = input.promptData as Partial<PromptData>;
      if (!promptData?.scriptPath) return;

      const currentPromptId = promptData.id as string | undefined;
      const currentScriptPath = g(_script)?.script?.filePath as string | undefined;

      if (
        lastPromptIdRef.current !== currentPromptId ||
        lastScriptPathRef.current !== currentScriptPath
      ) {
        if (debug) {
          log.info('ResizeController: prompt/script changed', {
            prevPromptId: lastPromptIdRef.current,
            prevScript: lastScriptPathRef.current,
            promptId: currentPromptId,
            script: currentScriptPath,
          });
        }
        lastSigRef.current = '';
        lastPromptIdRef.current = currentPromptId;
        lastScriptPathRef.current = currentScriptPath;
        lastChoicesLengthRef.current = undefined;
        lastChoicesScheduleKeyRef.current = '';
        if (pendingChoicesTimeoutRef.current) {
          clearTimeout(pendingChoicesTimeoutRef.current);
          pendingChoicesTimeoutRef.current = null;
        }
      }

      const ui = input.ui;
      const scoredChoicesLength = input.scoredChoicesLength;
      const choicesHeight = input.choicesHeight;
      const choicesReady = input.choicesReady;
      const prevMainHeightValue = input.prevMainHeight;
      const hasPanel = input.hasPanel;

      if (promptData?.grid && input.mainDomHeight > 10) {
        return;
      }

      const currentChoicesLength = scoredChoicesLength;
      const previousChoicesLength = lastChoicesLengthRef.current;

      const shrinkAgainstPrevMain =
        ui === UI.arg &&
        !choicesReady &&
        prevMainHeightValue > 0 &&
        choicesHeight >= 0 &&
        choicesHeight < prevMainHeightValue;

      const shrinkAgainstPrevChoices =
        ui === UI.arg &&
        !choicesReady &&
        typeof previousChoicesLength === 'number' &&
        currentChoicesLength < previousChoicesLength &&
        choicesHeight >= 0;

      const allowPreReadyShrink = shrinkAgainstPrevChoices || shrinkAgainstPrevMain;

      if (ui === UI.arg && !choicesReady && !allowPreReadyShrink) {
        if (typeof currentChoicesLength === 'number') {
          lastChoicesLengthRef.current = currentChoicesLength;
        }
        return;
      }

      const resizeResult = performResize(input);
      let mh = resizeResult.mainHeight;
      let forceHeight = resizeResult.forceHeight;
      let forceResize = resizeResult.forceResize;
      const urgentShrink = resizeResult.urgentShrink;
      const forceWidth =
        typeof promptData?.width === 'number' ? (promptData.width as number) : undefined;

      if (ui === UI.debugger) {
        forceHeight = 128;
      }

      if (mh === 0 && promptData?.preventCollapse) {
        const fallbackMain = Math.max(
          input.mainHeightCurrent || 0,
          Math.max(
            0,
            (promptData?.height ?? PROMPT.HEIGHT.BASE) -
              input.topHeight -
              input.footerHeight,
          ),
        );
        mh = fallbackMain;
        forceResize = true;
      }

      const data: ResizeData = {
        id: promptData?.id || 'missing',
        pid: (window as any).pid || 0,
        reason,
        scriptPath: currentScriptPath,
        placeholderOnly: input.placeholderOnly,
        topHeight: input.topHeight,
        ui,
        mainHeight: mh + (input.isWindow ? 24 : 0) + 1,
        footerHeight: input.footerHeight,
        mode: promptData?.mode || Mode.FILTER,
        hasPanel,
        hasInput: g(inputAtom)?.length > 0,
        previewEnabled: input.previewEnabled,
        open: g(_open),
        tabIndex: g(_tabIndex),
        isSplash: g(isSplashAtom),
        hasPreview: input.hasPreview,
        inputChanged: g(_inputChangedAtom),
        forceResize,
        forceHeight,
        forceWidth,
        isWindow: input.isWindow,
        justOpened: input.justOpened as any,
        totalChoices: scoredChoicesLength as any,
        isMainScript: g(isMainScriptAtom) as any,
      } as ResizeData;

      try {
        const sigObj = {
          ui,
          mh,
          topHeight: input.topHeight,
          footerHeight: input.footerHeight,
          hasPanel: input.hasPanel,
          hasPreview: input.hasPreview,
          forceHeight: forceHeight || 0,
          forceWidth: forceWidth || 0,
        };
        const sig = JSON.stringify(sigObj);
        const justOpened = Boolean(input.justOpened);
        if (
          !justOpened &&
          !urgentShrink &&
          sig === lastSigRef.current &&
          !forceResize &&
          !forceHeight &&
          !forceWidth
        ) {
          if (debug) log.info('ResizeController: signature unchanged; skipping send');
          return;
        }
        lastSigRef.current = sig;
      } catch (e) {
        if (debug) {
          log.info('ResizeController: signature check error', {
            message: (e as Error)?.message,
          });
        }
      }

      const inflight = g(resizeInflightAtom);
      if (inflight && !(urgentShrink || forceResize || forceHeight || forceWidth)) {
        if (debug) {
          log.info('ResizeController: inflight, skipping non-urgent resize', {
            inflight,
            urgentShrink,
            forceResize,
            forceHeight,
            forceWidth,
          });
        }
        return;
      }

      store.set(resizeInflightAtom, true);
      log.info('ResizeController: sending resize', { pid: data.pid, id: data.id, mainHeight: data.mainHeight, reason: data.reason });
      sendResize(data);
      store.set(prevMh, mh);

      try {
        const prevChoicesLength = lastChoicesLengthRef.current;
        const nextChoicesLength = typeof scoredChoicesLength === 'number' ? scoredChoicesLength : 0;
        lastChoicesLengthRef.current = nextChoicesLength;
        const choicesChanged =
          typeof prevChoicesLength === 'number' && prevChoicesLength !== nextChoicesLength;
        if (choicesChanged) {
          const direction = nextChoicesLength < prevChoicesLength ? 'SHRINK' : 'GROW';
          const scheduleKey = `${currentPromptId ?? ''}|${nextChoicesLength}|${direction}`;
          if (lastChoicesScheduleKeyRef.current !== scheduleKey) {
            if (pendingChoicesTimeoutRef.current) {
              clearTimeout(pendingChoicesTimeoutRef.current);
              pendingChoicesTimeoutRef.current = null;
            }
            lastChoicesScheduleKeyRef.current = scheduleKey;
            const delay = direction === 'SHRINK' ? 48 : 96;
            if (debug) {
              log.info('ResizeController: scheduling follow-up for choices length change', {
                direction,
                delay,
                from: prevChoicesLength,
                to: nextChoicesLength,
                scheduleKey,
              });
            }
            pendingChoicesTimeoutRef.current = setTimeout(() => {
              pendingChoicesTimeoutRef.current = null;
              if (lastChoicesScheduleKeyRef.current === scheduleKey) {
                lastChoicesScheduleKeyRef.current = '';
              }
              try {
                scheduleResizeExecution(`CHOICES_LENGTH_${direction}`);
              } catch (error) {
                if (debug) {
                  log.info('ResizeController: follow-up resize threw', {
                    message: (error as Error)?.message,
                  });
                }
              }
            }, delay);
          }
          if (debug) {
            log.info('ResizeController: recorded choices length change', {
              prevChoicesLength,
              nextChoicesLength,
              direction,
              scheduleKey,
            });
          }
        }
        if (!choicesChanged && debug) {
          log.info('ResizeController: choices length unchanged after send', {
            prevChoicesLength,
            nextChoicesLength,
          });
        }
      } catch {}

      try {
        const isArg = ui === UI.arg;
        const isJustOpened = Boolean(input.justOpened);
        const key = `${currentPromptId ?? ''}`;
        if (isArg && isJustOpened) {
          const count = recheckCountsRef.current[key] || 0;
          if (count < 2) {
            recheckCountsRef.current[key] = count + 1;
            const delay = count === 0 ? 50 : 120;
            log.info('ResizeController: scheduling recheck', { delayMs: delay, attempt: recheckCountsRef.current[key], promptId: key });
            setTimeout(() => {
              try { scheduleResizeExecution('RECHECK'); } catch {}
            }, delay);
          }
        } else if (!isJustOpened && currentPromptId) {
          recheckCountsRef.current[currentPromptId] = 0;
        }
      } catch {}

      setTimeout(() => {
        try { store.set(resizeInflightAtom, false); } catch {}
      }, 300);
    },
    [store]
  );

  const scheduleResizeExecution = useCallback(
    (reason: string) => {
      lastReasonRef.current = reason;
      if (framePendingRef.current) return;

      framePendingRef.current = true;
      requestAnimationFrame(() => {
        framePendingRef.current = false;
        executeResize(lastReasonRef.current);
      });
    },
    [executeResize],
  );

  // Trigger the execution when the mainHeightTrigger value changes or tick increments
  // Use layout effect so DOM measurements + IPC happen before paint
  useLayoutEffect(() => {
    log.info('ResizeController: tick/mainHeight trigger');
    scheduleResizeExecution('CONTROLLER_TRIGGER');
  }, [scheduleResizeExecution, mainHeightTrigger, tick]);

  // Also trigger once when the prompt/script changes to avoid missing the first shrink
  useLayoutEffect(() => {
    log.info('ResizeController: promptChangeKey trigger', { promptChangeKey });
    scheduleResizeExecution('PROMPT_CHANGED');
    // no cleanup needed
  }, [scheduleResizeExecution, promptChangeKey]);

  useEffect(() => {
    return () => {
      if (pendingChoicesTimeoutRef.current) {
        clearTimeout(pendingChoicesTimeoutRef.current);
        pendingChoicesTimeoutRef.current = null;
      }
      lastChoicesScheduleKeyRef.current = '';
    };
  }, []);

  return null; // Controller components don't render anything
};

export default ResizeController;
