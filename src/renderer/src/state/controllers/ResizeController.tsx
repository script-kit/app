// src/renderer/src/state/controllers/ResizeController.tsx

import React, { useLayoutEffect, useRef, useCallback, useEffect } from 'react';
import { useAtomValue, useStore } from 'jotai';
import { debounce } from 'lodash-es';

// Import necessary enums, types, constants, and utils
import { AppChannel } from '../../../../shared/enums';
import { Channel, Mode, UI, PROMPT } from '@johnlindquist/kit/core/enum';
import type { ResizeData, PromptData } from '../../../../shared/types';
import { computeResize } from '../resize/compute';
import {
  RESIZE_DEBOUNCE_MS, SEND_RESIZE_DEBOUNCE_MS
} from '../constants';
import {
  ID_HEADER, ID_FOOTER, ID_MAIN, ID_PANEL, ID_LIST, ID_LOG
} from '../dom-ids';
import { createLogger } from '../../log-utils';
import { resizeInflightAtom } from '../resize/scheduler';
import { actionsOverlayOpenAtom } from '../../jotai';

// Import from facade for gradual migration
import {
  _mainHeight, // The trigger atom
  promptResizedByHumanAtom, promptBoundsAtom, channelAtom, promptActiveAtom,
  promptDataAtom, uiAtom, scoredChoicesAtom, mainHeightAtom,
  choicesReadyAtom, previewCheckAtom, choicesHeightAtom,
  logHTMLAtom, scriptAtom, isWindowAtom, justOpenedAtom,
  gridReadyAtom, inputAtom, previewEnabledAtom, isSplashAtom,
  isMainScriptAtom
} from '../../jotai';

import { _panelHTML } from '../atoms/preview';
import { itemHeightAtom, prevMh, resizeTickAtom } from '../atoms/ui-elements';
import { _flaggedValue } from '../atoms/actions';
import { _inputChangedAtom } from '../atoms/input';
import { _open } from '../atoms/lifecycle';
import { _tabIndex } from '../atoms/tabs';
import { _script } from '../atoms/script-state';

const log = createLogger('ResizeController.ts');
const { ipcRenderer } = window.electron;

// Restore IPC helpers
const sendResize = (data: ResizeData) => ipcRenderer.send(AppChannel.RESIZE, data);
const debounceSendResize = debounce(sendResize, SEND_RESIZE_DEBOUNCE_MS);

const isDebugResizeEnabled = (): boolean => {
  try {
    return Boolean((window as any).DEBUG_RESIZE);
  } catch {
    return false;
  }
};

export const ResizeController: React.FC = () => {
  const store = useStore();
  // Use ref to replace the module-level variable prevTopHeight
  const prevTopHeightRef = useRef(0);
  const lastSigRef = useRef<string>('');
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
  const promptChangeKey = `${promptDataForKey?.id ?? ''}|${scriptForKey?.filePath ?? ''}`;

  // Define the resize execution using useCallback for a stable reference.
  // No longer debounced here since resize() already debounces at the API level
  const executeResize = useCallback(
    (reason = 'UNSET') => {
      log.info(`ResizeController.executeResize called with reason: ${reason}`);
      
      // Use store.get() (g) to access state synchronously at the time of execution.
      const g = store.get;

      // --- Start of restored and adapted logic from original resize() ---

      const human = g(promptResizedByHumanAtom);
      if (human) {
        g(channelAtom)(Channel.SET_BOUNDS, g(promptBoundsAtom));
        return;
      }

      const active = g(promptActiveAtom);
      if (!active) return;

      const promptData = g(promptDataAtom) as Partial<PromptData>;
      if (!promptData?.scriptPath) return;
      const currentPromptId = promptData?.id as string | undefined;
      const currentScriptPath = g(_script)?.filePath as string | undefined;

      // Reset signature dedupe across distinct prompts/scripts so initial sends aren't skipped
      if (
        lastPromptIdRef.current !== currentPromptId ||
        lastScriptPathRef.current !== currentScriptPath
      ) {
        log.info(`ResizeController: prompt/script changed. Resetting signature. prevPromptId=${lastPromptIdRef.current} prevScript=${lastScriptPathRef.current} -> promptId=${currentPromptId} script=${currentScriptPath}`);
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

      const ui = g(uiAtom);
      const scoredChoicesLength = g(scoredChoicesAtom)?.length;
      const currentChoicesLength =
        typeof scoredChoicesLength === 'number' ? scoredChoicesLength : undefined;
      const previousChoicesLength = lastChoicesLengthRef.current;
      const debug = isDebugResizeEnabled();
      const hasPanel = g(_panelHTML) !== '';
      let mh = g(mainHeightAtom);

      log.info(`ResizeController: context`, {
        promptId: currentPromptId,
        scriptPath: currentScriptPath,
        ui,
        scoredChoicesLength,
        hasPanel,
        prevMh: g(prevMh),
      });

      if (promptData?.grid && document.getElementById(ID_MAIN)?.clientHeight > 10) {
        return;
      }

      const placeholderOnly = promptData?.mode === Mode.FILTER && scoredChoicesLength === 0 && ui === UI.arg;

        // DOM Measurements (Side effects localized here)
        const topHeight = document.getElementById(ID_HEADER)?.offsetHeight || 0;
        const footerHeight = document.getElementById(ID_FOOTER)?.offsetHeight || 0;

        const hasPreview = g(previewCheckAtom);
        const choicesHeight = g(choicesHeightAtom);
        const listHeight = document.getElementById(ID_LIST)?.offsetHeight || 0;
        const choicesReady = g(choicesReadyAtom);
        const prevMainHeightValue = g(prevMh);
        const shrinkAgainstPrevMain =
          ui === UI.arg &&
          !choicesReady &&
          typeof currentChoicesLength === 'number' &&
          prevMainHeightValue > 0 &&
          choicesHeight >= 0 &&
          choicesHeight < prevMainHeightValue;
        const shrinkAgainstPrevChoices =
          ui === UI.arg &&
          !choicesReady &&
          typeof previousChoicesLength === 'number' &&
          typeof currentChoicesLength === 'number' &&
          currentChoicesLength < previousChoicesLength &&
          choicesHeight >= 0;
        const allowPreReadyShrink = shrinkAgainstPrevChoices || shrinkAgainstPrevMain;

        if (debug) {
          try {
            log.info('ResizeController: choice measurements', {
              scoredChoicesLength,
              prevScoredChoicesLength: lastChoicesLengthRef.current,
              choicesHeight,
              listHeight,
              diffVirtualVsDom: choicesHeight - listHeight,
              choicesReady,
              allowPreReadyShrink,
              shrinkAgainstPrevChoices,
              shrinkAgainstPrevMain,
              prevMainHeightValue,
            });
          } catch {}
        }

        log.info(`ResizeController: DOM measures`, { topHeight, footerHeight, hasPreview, choicesHeight });

        // Calculate Main Height (mh) based on UI state
        if (ui === UI.arg) {
          if (!choicesReady && !allowPreReadyShrink) {
            if (debug) {
              log.info('ResizeController: choices not ready, skipping resize', {
                scoredChoicesLength,
                previousChoicesLength,
                currentChoicesLength,
                choicesHeight,
                listHeight,
                prevMainHeightValue,
                shrinkAgainstPrevChoices,
                shrinkAgainstPrevMain,
              });
            }
            if (typeof currentChoicesLength === 'number') {
              lastChoicesLengthRef.current = currentChoicesLength;
            }
            return;
          }

          if (choicesHeight > PROMPT.HEIGHT.BASE) {
            log.info(`🍃 choicesHeight: ${choicesHeight} > PROMPT.HEIGHT.BASE: ${PROMPT.HEIGHT.BASE}`);
            const baseHeight = (promptData?.height && promptData.height > PROMPT.HEIGHT.BASE) ? promptData.height : PROMPT.HEIGHT.BASE;
            mh = baseHeight - topHeight - footerHeight;
          } else {
            log.info(`🍃 choicesHeight: ${choicesHeight} <= PROMPT.HEIGHT.BASE: ${PROMPT.HEIGHT.BASE}`);
            mh = choicesHeight;
          }

          if (allowPreReadyShrink && debug) {
            log.info('ResizeController: overriding choicesReady guard for shrink', {
              mh,
              choicesHeight,
              prevMainHeightValue,
              previousChoicesLength,
              currentChoicesLength,
              shrinkAgainstPrevChoices,
              shrinkAgainstPrevMain,
            });
          }
        }

        if (mh === 0 && hasPanel) {
          mh = Math.max(g(itemHeightAtom), g(mainHeightAtom));
        }

        let forceResize = Boolean(allowPreReadyShrink);
        let ch = 0;

        // Complex DOM measurement based on UI type (Verbatim from original)
        try {
            if (ui === UI.form || ui === UI.fields) {
                ch = (document as any)?.getElementById(UI.form)?.offsetHeight;
                mh = ch;
            } else if (ui === UI.div) {
                ch = (document as any)?.getElementById(ID_PANEL)?.offsetHeight;
                if (ch) {
                    mh = promptData?.height || ch;
                } else {
                    return;
                }
            } else if (ui === UI.arg && hasPanel) {
                ch = (document as any)?.getElementById(ID_PANEL)?.offsetHeight;
                mh = ch;
                forceResize = true;
            } else if (ui === UI.arg && !hasPanel && !scoredChoicesLength && !document.getElementById(ID_LIST)) {
                ch = 0;
                mh = 0;
                forceResize = true;
            } else if (ui !== UI.arg) {
                ch = (document as any)?.getElementById(ID_MAIN)?.offsetHeight;
            }

            if (ui === UI.arg) {
                const argForce = ch === 0 || Boolean(ch < choicesHeight) || hasPanel;
                forceResize = forceResize || argForce;
            } else if (ui === UI.div) {
                forceResize = true;
            } else {
                // Use the prevMh atom for comparison (as in the original code)
                const nonArgForce = Boolean(ch > g(prevMh));
                forceResize = forceResize || nonArgForce;
            }
        } catch (error) {
            log.error('DOM measurement error during resize', error);
        }

        // Handle top height changes using the ref
        if (topHeight !== prevTopHeightRef.current) {
          forceResize = true;
          prevTopHeightRef.current = topHeight;
        }

        // Prepare inputs for computeResize
        const logVisible = g(logHTMLAtom)?.length > 0 && g(scriptAtom)?.log !== false;
        const logHeight = document.getElementById(ID_LOG)?.offsetHeight || 0;

        // Compute Resize (Pure calculation)
        const computeOut = computeResize({
          ui,
          scoredChoicesLength: scoredChoicesLength || 0,
          choicesHeight,
          hasPanel,
          hasPreview,
          promptData: { height: promptData?.height, baseHeight: PROMPT.HEIGHT.BASE },
          topHeight,
          footerHeight,
          isWindow: g(isWindowAtom),
          justOpened: Boolean(g(justOpenedAtom)),
          flaggedValue: g(_flaggedValue),
          mainHeightCurrent: mh,
          itemHeight: g(itemHeightAtom),
          logVisible,
          logHeight,
          gridActive: g(gridReadyAtom),
          prevMainHeight: g(prevMh),
          placeholderOnly,
        });

        mh = computeOut.mainHeight;
        let forceHeight = computeOut.forceHeight;

        log.info(`ResizeController: computeResize output`, { mainHeight: mh, forceHeight, forceResizeCompute: computeOut.forceResize });

        // If actions overlay is open, ensure window is at least default/base height
        try {
          const overlayOpen = g(actionsOverlayOpenAtom) as boolean;
          if (overlayOpen) {
            const baseHeight = (promptData?.height && promptData.height > PROMPT.HEIGHT.BASE)
              ? (promptData.height as number)
              : PROMPT.HEIGHT.BASE;
            const minMain = Math.max(0, baseHeight - topHeight - footerHeight);
            if (mh < minMain) {
              log.info(`Actions overlay open: enforcing min main height ${minMain} (was ${mh})`);
              mh = minMain;
              // Signal that we should apply programmatically to avoid user-guard issues
              forceResize = true;
            }
          }
        } catch {}

        if (ui === UI.debugger) {
            forceHeight = 128;
        }

        if (mh === 0 && promptData?.preventCollapse) {
            log.info('🍃 Prevent collapse to zero...');
            return;
        }

        log.info(`🍃 mh: ${mh}`, `forceHeight: ${forceHeight}`);

        // Prepare Data and Send IPC (Side effect)
        const data: ResizeData = {
            id: promptData?.id || 'missing',
            pid: (window as any).pid || 0,
            reason,
            scriptPath: currentScriptPath,
            placeholderOnly,
            topHeight,
            ui,
            mainHeight: mh + (g(isWindowAtom) ? 24 : 0) + 1,
            footerHeight,
            mode: promptData?.mode || Mode.FILTER,
            hasPanel,
            hasInput: g(inputAtom)?.length > 0,
            previewEnabled: g(previewEnabledAtom),
            open: g(_open),
            tabIndex: g(_tabIndex),
            isSplash: g(isSplashAtom),
            hasPreview,
            inputChanged: g(_inputChangedAtom),
            forceResize,
            forceHeight,
            isWindow: g(isWindowAtom),
            justOpened: g(justOpenedAtom) as any,
            forceWidth: promptData?.width as any,
            totalChoices: scoredChoicesLength as any,
            isMainScript: g(isMainScriptAtom) as any,
        } as ResizeData;

        // IMPORTANT: capture previous main height BEFORE updating prevMh to detect urgent shrink correctly
        const prevMain = g(prevMh);
        const urgentShrink = mh < prevMain;

        // Short-circuit if signature is unchanged (avoid redundant sends)
        // Note: only apply this optimization when not inflight OR when not an urgent shrink
        try {
          const sigObj = { ui, mh, topHeight, footerHeight, hasPanel, hasPreview };
          const sig = JSON.stringify(sigObj);
          const justOpened = Boolean(g(justOpenedAtom));
          const inflight = g(resizeInflightAtom);
          log.info('ResizeController: signature check', {
            sig,
            lastSig: lastSigRef.current,
            justOpened,
            inflight,
            urgentShrink,
          });
          if (!justOpened && !urgentShrink && sig === lastSigRef.current) {
            log.info('ResizeController: signature unchanged; skipping send');
            return;
          }
        } catch (e) {
          log.info('ResizeController: signature check error', { message: (e as Error)?.message });
        }

        // Inflight guard: avoid duplicate sends until MAIN_ACK clears it
        // Exception: allow urgent shrink or forced resizes to pass through
        {
          const inflight = g(resizeInflightAtom);
          if (inflight && !(urgentShrink || forceResize || forceHeight)) {
            log.info('ResizeController: inflight true, skipping send (no urgent shrink/force)', {
              inflight,
              urgentShrink,
              forceResize,
              forceHeight,
            });
            return;
          }
        }

        // Mark inflight and send resize IPC
        store.set(resizeInflightAtom, true);
        debounceSendResize.cancel();
        if (g(justOpenedAtom) && !promptData?.scriptlet) {
          log.info('ResizeController: sending debounced resize', { pid: data.pid, id: data.id, mainHeight: data.mainHeight, reason: data.reason });
          debounceSendResize(data);
        } else {
          log.info('ResizeController: sending resize', { pid: data.pid, id: data.id, mainHeight: data.mainHeight, reason: data.reason });
          sendResize(data);
        }

        // Now that we actually sent, update prevMh and lastSig to reflect committed state
        try {
          store.set(prevMh, mh);
          const sigObj = { ui, mh, topHeight, footerHeight, hasPanel, hasPreview };
          lastSigRef.current = JSON.stringify(sigObj);
        } catch {}

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
                  executeResize(`CHOICES_LENGTH_${direction}`);
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

        // For just-opened arg UI, schedule a couple of quick rechecks to pick up
        // late-arriving small choice heights and ensure shrink applies even if
        // initial measurements were taken early.
        try {
          const isArg = ui === UI.arg;
          const isJustOpened = Boolean(g(justOpenedAtom));
          const key = `${currentPromptId ?? ''}`;
          if (isArg && isJustOpened) {
            const count = recheckCountsRef.current[key] || 0;
            if (count < 2) {
              recheckCountsRef.current[key] = count + 1;
              const delay = count === 0 ? 50 : 120; // two quick passes
              log.info('ResizeController: scheduling recheck', { delayMs: delay, attempt: recheckCountsRef.current[key], promptId: key });
              setTimeout(() => {
                try { executeResize('RECHECK'); } catch {}
              }, delay);
            }
          } else if (!isJustOpened && currentPromptId) {
            // Reset recheck counts once prompt settles
            recheckCountsRef.current[currentPromptId] = 0;
          }
        } catch {}
        // Failsafe: clear inflight if no ACK arrives
        setTimeout(() => {
        try { store.set(resizeInflightAtom, false); } catch {}
      }, 300);

      // --- End of restored logic ---
  },
  [store]
);

  // Trigger the execution when the mainHeightTrigger value changes or tick increments
  // Use layout effect so DOM measurements + IPC happen before paint
  useLayoutEffect(() => {
    log.info('ResizeController: tick/mainHeight trigger');
    executeResize('CONTROLLER_TRIGGER');
    return () => {
      // Only debounceSendResize needs cancellation now
      debounceSendResize.cancel();
    };
  }, [executeResize, mainHeightTrigger, tick]);

  // Also trigger once when the prompt/script changes to avoid missing the first shrink
  useLayoutEffect(() => {
    log.info('ResizeController: promptChangeKey trigger', { promptChangeKey });
    executeResize('PROMPT_CHANGED');
    // no cleanup needed
  }, [executeResize, promptChangeKey]);

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
