import { atom } from 'jotai';
import { _mainHeight, itemHeightAtom, choicesHeightAtom, prevMh, logHeightAtom, gridReadyAtom, isWindowAtom } from '../atoms/ui-elements';
import { promptActiveAtom, justOpenedAtom } from '../atoms/app-core';
import { promptResizedByHumanAtom, promptBoundsAtom } from '../atoms/bounds';
import { previewEnabledAtom, previewCheckAtom } from '../atoms/preview';
import { logHTMLAtom } from '../atoms/log';
import { _panelHTML } from '../atoms/preview';
import { _flaggedValue } from '../atoms/actions';
import { Mode } from '@johnlindquist/kit/core/enum';
import { ID_HEADER, ID_FOOTER, ID_LOG } from '../dom-ids';
// Import from facade for gradual migration
import { promptDataAtom, uiAtom, scoredChoicesAtom, scriptAtom } from '../facade';

/**
 * Pure derived selector that gathers all inputs needed for resize calculation.
 * This atom only READS other atoms; it performs no writes or side-effects.
 */
export const resizeInputsAtom = atom((g) => {
  const promptData = g(promptDataAtom);
  const ui = g(uiAtom);
  const scoredChoices = g(scoredChoicesAtom);
  const scoredChoicesLength = scoredChoices?.length || 0;
  
  // Get DOM measurements - these will be moved to a controller later
  const topHeight = typeof document !== 'undefined' ? 
    document.getElementById(ID_HEADER)?.offsetHeight || 0 : 0;
  const footerHeight = typeof document !== 'undefined' ? 
    document.getElementById(ID_FOOTER)?.offsetHeight || 0 : 0;
  const logHeight = typeof document !== 'undefined' ? 
    document.getElementById(ID_LOG)?.offsetHeight || 0 : 0;
  
  const script = g(scriptAtom);
  const logHTML = g(logHTMLAtom);
  const logVisible = logHTML?.length > 0 && script?.log !== false;
  
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
    
    // Panel/Preview state
    hasPanel: g(_panelHTML) !== '',
    hasPreview: g(previewCheckAtom),
    previewEnabled: g(previewEnabledAtom),
    
    // Heights
    topHeight,
    footerHeight,
    mainHeightCurrent: g(_mainHeight),
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
    
    // Other state
    flaggedValue: g(_flaggedValue),
    placeholderOnly: promptData?.mode === Mode.FILTER && scoredChoicesLength === 0 && ui === 'arg',
  };
});