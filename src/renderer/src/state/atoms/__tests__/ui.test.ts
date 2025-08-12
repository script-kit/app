import { describe, it, expect, beforeEach } from 'vitest';
import { createStore } from 'jotai';
import { UI, Mode } from '@johnlindquist/kit/core/enum';
import {
  _ui,
  _prevUI,
  // _defaultUI, // TODO: needs to be exported from ui.ts
  isHiddenAtom,
  isScriptlessAtom,
  mouseEnabledAtom,
  isWindowAtom,
  isFullScreenAtom,
  hasActionsAtom,
  actionsOpenAtom,
  promptData,
  appearanceAtom,
  _hideOnBlurChanged,
  hideOnBlurChangedAtom,
  modeAtom,
  promptReadyAtom,
} from '../ui';

describe.skip('UI Atoms', () => {
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore();
  });

  describe('UI State', () => {
    it('should initialize with default UI', () => {
      const ui = store.get(_ui);
      expect(ui).toBe(UI.arg);
    });

    it('should update UI state', () => {
      store.set(_ui, UI.editor);
      expect(store.get(_ui)).toBe(UI.editor);
      
      store.set(_ui, UI.term);
      expect(store.get(_ui)).toBe(UI.term);
    });

    it.skip('should track previous UI', () => {
      const initialPrev = store.get(_prevUI);
      expect(initialPrev).toBe(UI.arg);

      store.set(_prevUI, UI.chat);
      expect(store.get(_prevUI)).toBe(UI.chat);
    });

    it.skip('should handle default UI', () => {
      // TODO: _defaultUI atom needs to be exported from ui.ts
      // const defaultUI = store.get(_defaultUI);
      // expect(defaultUI).toBe(UI.arg);

      // store.set(_defaultUI, UI.form);
      // expect(store.get(_defaultUI)).toBe(UI.form);
    });
  });

  describe('UI Flags', () => {
    it.skip('should initialize hidden state as true', () => {
      // TODO: Fix atom initialization issue
      expect(store.get(isHiddenAtom)).toBe(true);
    });

    it.skip('should initialize scriptless state as false', () => {
      // TODO: Fix atom initialization issue
      expect(store.get(isScriptlessAtom)).toBe(false);
    });

    it('should track mouse enabled state', () => {
      expect(store.get(mouseEnabledAtom)).toBe(0);
      
      store.set(mouseEnabledAtom, 1);
      expect(store.get(mouseEnabledAtom)).toBe(1);
    });

    it('should track window state', () => {
      expect(store.get(isWindowAtom)).toBe(false);
      
      store.set(isWindowAtom, true);
      expect(store.get(isWindowAtom)).toBe(true);
    });

    it('should track fullscreen state', () => {
      expect(store.get(isFullScreenAtom)).toBe(false);
      
      store.set(isFullScreenAtom, true);
      expect(store.get(isFullScreenAtom)).toBe(true);
    });
  });

  describe('Actions State', () => {
    it('should initialize actions states', () => {
      expect(store.get(hasActionsAtom)).toBe(false);
      expect(store.get(actionsOpenAtom)).toBe(false);
    });

    it('should update actions states', () => {
      store.set(hasActionsAtom, true);
      expect(store.get(hasActionsAtom)).toBe(true);

      store.set(actionsOpenAtom, true);
      expect(store.get(actionsOpenAtom)).toBe(true);
    });
  });

  describe('Prompt Data', () => {
    it('should initialize with default prompt data', () => {
      const data = store.get(promptData);
      expect(data).toEqual(expect.objectContaining({
        input: '',
        placeholder: 'Script Kit',
      }));
    });

    it('should update prompt data', () => {
      const testData = {
        id: 'test-prompt',
        scriptPath: '/path/to/script.js',
        ui: UI.arg,
        input: 'test input',
        placeholder: 'Test placeholder',
      };

      store.set(promptData, testData);
      const data = store.get(promptData);
      expect(data).toEqual(testData);
    });

    it('should derive mode from prompt data', () => {
      store.set(promptData, { mode: Mode.FILTER });
      expect(store.get(modeAtom)).toBe(Mode.FILTER);

      store.set(promptData, { mode: Mode.GENERATE });
      expect(store.get(modeAtom)).toBe(Mode.GENERATE);
    });

    it('should track prompt ready state', () => {
      expect(store.get(promptReadyAtom)).toBe(false);
      
      store.set(promptReadyAtom, true);
      expect(store.get(promptReadyAtom)).toBe(true);
    });
  });

  describe('Appearance', () => {
    it('should have empty initial appearance', () => {
      const appearance = store.get(appearanceAtom);
      expect(appearance).toBe('');
    });

    it('should update appearance', () => {
      store.set(appearanceAtom, 'dark');
      expect(store.get(appearanceAtom)).toBe('dark');

      store.set(appearanceAtom, 'light');
      expect(store.get(appearanceAtom)).toBe('light');
    });
  });

  describe('Hide on Blur', () => {
    it('should track hide on blur changed state', () => {
      expect(store.get(hideOnBlurChangedAtom)).toBe(false);

      store.set(hideOnBlurChangedAtom, true);
      expect(store.get(hideOnBlurChangedAtom)).toBe(true);
    });
  });
});