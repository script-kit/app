// src/renderer/src/state/controllers/ResizeController.tsx

import React, { useEffect, useRef, useCallback } from 'react';
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

export const ResizeController: React.FC = () => {
  const store = useStore();
  // Use ref to replace the module-level variable prevTopHeight
  const prevTopHeightRef = useRef(0);
  const lastSigRef = useRef<string>('');

  // Subscribe to the trigger atom. Updates to this atom signal a resize check is needed.
  const mainHeightTrigger = useAtomValue(_mainHeight);
  // Also re-run when other atoms request a recompute
  const tick = useAtomValue(resizeTickAtom);

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

      const ui = g(uiAtom);
      const scoredChoicesLength = g(scoredChoicesAtom)?.length;
      const hasPanel = g(_panelHTML) !== '';
      let mh = g(mainHeightAtom);

      if (promptData?.grid && document.getElementById(ID_MAIN)?.clientHeight > 10) {
        return;
      }

      const placeholderOnly = promptData?.mode === Mode.FILTER && scoredChoicesLength === 0 && ui === UI.arg;

        // DOM Measurements (Side effects localized here)
        const topHeight = document.getElementById(ID_HEADER)?.offsetHeight || 0;
        const footerHeight = document.getElementById(ID_FOOTER)?.offsetHeight || 0;

        const hasPreview = g(previewCheckAtom);
        const choicesHeight = g(choicesHeightAtom);

        // Calculate Main Height (mh) based on UI state
        if (ui === UI.arg) {
          if (!g(choicesReadyAtom)) return;

          if (choicesHeight > PROMPT.HEIGHT.BASE) {
            log.info(`🍃 choicesHeight: ${choicesHeight} > PROMPT.HEIGHT.BASE: ${PROMPT.HEIGHT.BASE}`);
            const baseHeight = (promptData?.height && promptData.height > PROMPT.HEIGHT.BASE) ? promptData.height : PROMPT.HEIGHT.BASE;
            mh = baseHeight - topHeight - footerHeight;
          } else {
            log.info(`🍃 choicesHeight: ${choicesHeight} <= PROMPT.HEIGHT.BASE: ${PROMPT.HEIGHT.BASE}`);
            mh = choicesHeight;
          }
        }

        if (mh === 0 && hasPanel) {
          mh = Math.max(g(itemHeightAtom), g(mainHeightAtom));
        }

        let forceResize = false;
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
                forceResize = ch === 0 || Boolean(ch < choicesHeight) || hasPanel;
            } else if (ui === UI.div) {
                forceResize = true;
            } else {
                // Use the prevMh atom for comparison (as in the original code)
                forceResize = Boolean(ch > g(prevMh));
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
            scriptPath: g(_script)?.filePath,
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
          if (!justOpened && !urgentShrink && sig === lastSigRef.current) {
            log.info('ResizeController: signature unchanged; skipping send');
            return;
          }
        } catch {}

        // Inflight guard: avoid duplicate sends until MAIN_ACK clears it
        // Exception: allow urgent shrink or forced resizes to pass through
        {
          const inflight = g(resizeInflightAtom);
          if (inflight && !(urgentShrink || forceResize || forceHeight)) {
            log.info('ResizeController: inflight true, skipping send (no urgent shrink/force)');
            return;
          }
        }

        // Mark inflight and send resize IPC
        store.set(resizeInflightAtom, true);
        debounceSendResize.cancel();
        if (g(justOpenedAtom) && !promptData?.scriptlet) {
          debounceSendResize(data);
        } else {
          sendResize(data);
        }

        // Now that we actually sent, update prevMh and lastSig to reflect committed state
        try {
          store.set(prevMh, mh);
          const sigObj = { ui, mh, topHeight, footerHeight, hasPanel, hasPreview };
          lastSigRef.current = JSON.stringify(sigObj);
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
  useEffect(() => {
    executeResize('CONTROLLER_TRIGGER');
    return () => {
      // Only debounceSendResize needs cancellation now
      debounceSendResize.cancel();
    };
  }, [executeResize, mainHeightTrigger, tick]);

  return null; // Controller components don't render anything
};

export default ResizeController;
