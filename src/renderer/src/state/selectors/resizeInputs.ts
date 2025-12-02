import { Mode, UI } from '@johnlindquist/kit/core/enum';
import { atom } from 'jotai';
// Import from facade for gradual migration
import {
  actionsOverlayOpenAtom,
  choicesReadyAtom,
  promptDataAtom,
  scoredChoicesAtom,
  scriptAtom,
  uiAtom,
} from '../../jotai';
import { _flaggedValue } from '../atoms/actions';
import { justOpenedAtom, promptActiveAtom } from '../atoms/app-core';
import { promptBoundsAtom, promptResizedByHumanAtom } from '../atoms/bounds';
import { logHTMLAtom } from '../atoms/log';
import { _panelHTML, previewCheckAtom, previewEnabledAtom } from '../atoms/preview';
import {
  _mainHeight,
  choicesHeightAtom,
  gridReadyAtom,
  isWindowAtom,
  itemHeightAtom,
  prevMh,
} from '../atoms/ui-elements';
import { ID_FOOTER, ID_HEADER, ID_LIST, ID_LOG, ID_MAIN, ID_PANEL } from '../dom-ids';

/**
 * Pure derived selector that gathers all inputs needed for resize calculation.
 * This atom only READS other atoms; it performs no writes or side-effects.
 */
export const resizeInputsAtom = atom((g) => {
  const promptData = g(promptDataAtom);
  const ui = g(uiAtom);
  const scoredChoices = g(scoredChoicesAtom);
  const scoredChoicesLength = scoredChoices?.length || 0;

  // DOM lookups – single point of truth
  const headerEl = typeof document !== 'undefined' ? document.getElementById(ID_HEADER) : null;
  const footerEl = typeof document !== 'undefined' ? document.getElementById(ID_FOOTER) : null;
  const logEl = typeof document !== 'undefined' ? document.getElementById(ID_LOG) : null;
  const listEl = typeof document !== 'undefined' ? document.getElementById(ID_LIST) : null;
  const mainEl = typeof document !== 'undefined' ? document.getElementById(ID_MAIN) : null;
  const panelEl = typeof document !== 'undefined' ? document.getElementById(ID_PANEL) : null;

  const topHeight = headerEl?.offsetHeight || 0;
  const footerHeight = footerEl?.offsetHeight || 0;
  const logHeight = logEl?.offsetHeight || 0;
  const listHeight = listEl?.offsetHeight || 0;
  const mainDomHeight = mainEl?.offsetHeight || 0;
  const panelHeight = panelEl?.offsetHeight || 0;

  const script = g(scriptAtom);
  const logHTML = g(logHTMLAtom);
  const logVisible = logHTML?.length > 0 && script?.script?.log !== false;

  const choicesReady = g(choicesReadyAtom);
  return {
    // Core state
    ui,
    promptData,
    promptActive: g(promptActiveAtom),
    promptResizedByHuman: g(promptResizedByHumanAtom),
    promptBounds: g(promptBoundsAtom),

    // Choice state
    scoredChoicesLength,
    choicesHeight: g(choicesHeightAtom),
    choicesReady,
    listHeight,

    // Panel/Preview state
    hasPanel: g(_panelHTML) !== '',
    hasPreview: g(previewCheckAtom),
    previewEnabled: g(previewEnabledAtom),
    panelHeight,

    // Heights
    topHeight,
    footerHeight,
    mainHeightCurrent: g(_mainHeight),
    mainDomHeight,
    itemHeight: g(itemHeightAtom),
    prevMainHeight: g(prevMh),

    // Log state
    logVisible,
    logHeight,

    // Window state
    isWindow: g(isWindowAtom),
    justOpened: g(justOpenedAtom),

    // Grid state
    gridActive: g(gridReadyAtom),

    // Overlay / misc
    overlayOpen: g(actionsOverlayOpenAtom),
    flaggedValue: g(_flaggedValue),
    placeholderOnly: promptData?.mode === Mode.FILTER && scoredChoicesLength === 0 && ui === UI.arg,
  };
});
