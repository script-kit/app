import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createStore } from 'jotai';
import DOMPurify from 'dompurify';
import { closedDiv } from '../../../../../shared/defaults';
import {
  _previewHTML,
  previewEnabledAtom,
  previewHTMLAtom,
  hasPreviewAtom,
  previewCheckAtom,
  _panelHTML,
  panelHTMLAtom,
} from '../preview';
import { isHiddenAtom } from '../app-core';
import { promptData } from '../ui';
import { _mainHeight } from '../ui-elements';
import { loadingAtom } from '../app-core';

// Mock DOMPurify
vi.mock('dompurify', () => ({
  default: {
    sanitize: vi.fn((html) => html), // Simple pass-through for testing
  },
}));

// Mock document.getElementById
global.document = {
  getElementById: vi.fn(),
} as any;

describe('Preview Atoms', () => {
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore();
    vi.clearAllMocks();
  });

  describe('Preview HTML', () => {
    it('should initialize with empty preview HTML', () => {
      const html = store.get(previewHTMLAtom);
      expect(html).toBe('');
    });

    it.skip('should sanitize HTML when setting preview', () => {
      const testHTML = '<script>alert("xss")</script><div>Safe content</div>';
      store.set(previewHTMLAtom, testHTML);

      expect(DOMPurify.sanitize).toHaveBeenCalledWith(
        testHTML,
        expect.objectContaining({
          ADD_TAGS: ['iframe'],
          ALLOW_UNKNOWN_PROTOCOLS: true,
        })
      );
    });

    it('should update preview HTML', () => {
      const testHTML = '<div>Test preview</div>';
      store.set(previewHTMLAtom, testHTML);
      
      const html = store.get(previewHTMLAtom);
      expect(html).toBe(testHTML);
    });
  });

  describe('Preview Enabled', () => {
    it('should be enabled by default', () => {
      const enabled = store.get(previewEnabledAtom);
      expect(enabled).toBe(true);
    });

    it('should update preview enabled state', () => {
      store.set(previewEnabledAtom, false);
      expect(store.get(previewEnabledAtom)).toBe(false);

      store.set(previewEnabledAtom, true);
      expect(store.get(previewEnabledAtom)).toBe(true);
    });
  });

  describe('Has Preview', () => {
    it('should return false for empty preview', () => {
      store.set(_previewHTML, '');
      const hasPreview = store.get(hasPreviewAtom);
      expect(hasPreview).toBe(false);
    });

    it('should return true for non-empty preview', () => {
      store.set(_previewHTML, '<div>Content</div>');
      const hasPreview = store.get(hasPreviewAtom);
      expect(hasPreview).toBe(true);
    });
  });

  describe('Preview Check', () => {
    it('should return false when preview is empty', () => {
      store.set(_previewHTML, '');
      store.set(previewEnabledAtom, true);
      store.set(isHiddenAtom, false);
      
      const shouldShow = store.get(previewCheckAtom);
      expect(shouldShow).toBe(false);
    });

    it('should return false when preview is closedDiv', () => {
      store.set(_previewHTML, closedDiv);
      store.set(previewEnabledAtom, true);
      store.set(isHiddenAtom, false);
      
      const shouldShow = store.get(previewCheckAtom);
      expect(shouldShow).toBe(false);
    });

    it('should return false when preview is disabled', () => {
      store.set(_previewHTML, '<div>Content</div>');
      store.set(previewEnabledAtom, false);
      store.set(isHiddenAtom, false);
      
      const shouldShow = store.get(previewCheckAtom);
      expect(shouldShow).toBe(false);
    });

    it('should return false when hidden', () => {
      store.set(_previewHTML, '<div>Content</div>');
      store.set(previewEnabledAtom, true);
      store.set(isHiddenAtom, true);
      
      const shouldShow = store.get(previewCheckAtom);
      expect(shouldShow).toBe(false);
    });

    it('should return true when all conditions are met', () => {
      store.set(_previewHTML, '<div>Content</div>');
      store.set(previewEnabledAtom, true);
      store.set(isHiddenAtom, false);
      
      const shouldShow = store.get(previewCheckAtom);
      expect(shouldShow).toBe(true);
    });

    it('should treat empty div as no preview', () => {
      store.set(_previewHTML, '<div></div>');
      store.set(previewEnabledAtom, true);
      store.set(isHiddenAtom, false);
      
      const shouldShow = store.get(previewCheckAtom);
      expect(shouldShow).toBe(false);
    });
  });

  describe('Panel HTML', () => {
    it('should initialize with empty panel HTML', () => {
      const html = store.get(panelHTMLAtom);
      expect(html).toBe('');
    });

    it.skip('should sanitize panel HTML', () => {
      const testHTML = '<iframe src="test"></iframe><div>Panel content</div>';
      store.set(panelHTMLAtom, testHTML);

      expect(DOMPurify.sanitize).toHaveBeenCalledWith(
        testHTML,
        expect.objectContaining({
          ADD_TAGS: ['iframe'],
          ALLOW_UNKNOWN_PROTOCOLS: true,
        })
      );
    });

    it('should not update if content is the same', () => {
      const testHTML = '<div>Same content</div>';
      store.set(_panelHTML, testHTML);
      
      // Try to set the same content again
      store.set(panelHTMLAtom, testHTML);
      
      // Should still be the same
      expect(store.get(_panelHTML)).toBe(testHTML);
    });

    it('should close preview when panel is set without explicit preview', () => {
      store.set(promptData, {}); // No preview property
      store.set(panelHTMLAtom, '<div>Panel</div>');
      
      const previewHTML = store.get(_previewHTML);
      expect(previewHTML).toBe(closedDiv);
    });

    it('should preserve preview when explicitly defined in prompt data', () => {
      const originalPreview = '<div>Original preview</div>';
      store.set(_previewHTML, originalPreview);
      store.set(promptData, { preview: originalPreview });
      
      store.set(panelHTMLAtom, '<div>Panel</div>');
      
      const previewHTML = store.get(_previewHTML);
      expect(previewHTML).toBe(originalPreview);
    });

    it('should set loading to false when panel has content', () => {
      store.set(loadingAtom, true);
      store.set(panelHTMLAtom, '<div>Content</div>');
      
      const loading = store.get(loadingAtom);
      expect(loading).toBe(false);
    });

    it('should adjust main height when panel is cleared and no list is present', () => {
      const mockPanelElement = {};
      (document.getElementById as any).mockImplementation((id: string) => {
        if (id === 'panel') return mockPanelElement;
        if (id === 'list') return null;
        return null;
      });

      store.set(_mainHeight, 100);
      store.set(panelHTMLAtom, '');
      
      const mainHeight = store.get(_mainHeight);
      expect(mainHeight).toBe(0);
    });

    it('should not adjust main height when list is present', () => {
      const mockPanelElement = {};
      const mockListElement = {};
      (document.getElementById as any).mockImplementation((id: string) => {
        if (id === 'panel') return mockPanelElement;
        if (id === 'list') return mockListElement;
        return null;
      });

      store.set(_mainHeight, 100);
      store.set(panelHTMLAtom, '');
      
      const mainHeight = store.get(_mainHeight);
      expect(mainHeight).toBe(100); // Should remain unchanged
    });
  });
});