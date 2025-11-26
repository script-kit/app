import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DisposableRegistry } from './disposable-registry';

describe('DisposableRegistry', () => {
  let registry: DisposableRegistry;

  beforeEach(() => {
    registry = new DisposableRegistry();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('register', () => {
    it('should register a disposable in a scope', () => {
      const dispose = vi.fn();
      registry.register('test-scope', { dispose });

      expect(registry.hasScope('test-scope')).toBe(true);
      expect(registry.getScopeSize('test-scope')).toBe(1);
    });

    it('should allow multiple disposables in same scope', () => {
      registry.register('scope', { dispose: vi.fn() });
      registry.register('scope', { dispose: vi.fn() });
      registry.register('scope', { dispose: vi.fn() });

      expect(registry.getScopeSize('scope')).toBe(3);
    });

    it('should track disposables in different scopes independently', () => {
      registry.register('scope-a', { dispose: vi.fn() });
      registry.register('scope-a', { dispose: vi.fn() });
      registry.register('scope-b', { dispose: vi.fn() });

      expect(registry.getScopeSize('scope-a')).toBe(2);
      expect(registry.getScopeSize('scope-b')).toBe(1);
    });
  });

  describe('onScopeDispose', () => {
    it('should call cleanup callback when scope is disposed', () => {
      const callback = vi.fn();
      registry.onScopeDispose('test-scope', callback);
      registry.register('test-scope', { dispose: vi.fn() });

      registry.disposeScope('test-scope');

      expect(callback).toHaveBeenCalled();
    });

    it('should call multiple callbacks for same scope', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      registry.onScopeDispose('scope', callback1);
      registry.onScopeDispose('scope', callback2);
      registry.register('scope', { dispose: vi.fn() });

      registry.disposeScope('scope');

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });

    it('should remove callbacks after scope is disposed', () => {
      const callback = vi.fn();
      registry.onScopeDispose('scope', callback);
      registry.register('scope', { dispose: vi.fn() });

      registry.disposeScope('scope');
      callback.mockClear();

      // Disposing again should not call callback
      registry.disposeScope('scope');
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('addListener', () => {
    it('should add event listener to emitter', () => {
      const emitter = new EventEmitter();
      const handler = vi.fn();

      registry.addListener('scope', emitter, 'test-event', handler);
      emitter.emit('test-event', 'data');

      expect(handler).toHaveBeenCalledWith('data');
    });

    it('should remove listener when scope is disposed', () => {
      const emitter = new EventEmitter();
      const handler = vi.fn();

      registry.addListener('scope', emitter, 'test-event', handler);
      registry.disposeScope('scope');

      emitter.emit('test-event', 'data');
      expect(handler).not.toHaveBeenCalled();
    });

    it('should track listener as disposable', () => {
      const emitter = new EventEmitter();
      registry.addListener('scope', emitter, 'event', vi.fn());

      expect(registry.getScopeSize('scope')).toBe(1);
    });
  });

  describe('addOnceListener', () => {
    it('should add once listener to emitter', () => {
      const emitter = new EventEmitter();
      const handler = vi.fn();

      registry.addOnceListener('scope', emitter, 'test-event', handler);
      emitter.emit('test-event', 'data');

      expect(handler).toHaveBeenCalledWith('data');
    });

    it('should only fire once', () => {
      const emitter = new EventEmitter();
      const handler = vi.fn();

      registry.addOnceListener('scope', emitter, 'test-event', handler);
      emitter.emit('test-event', 'first');
      emitter.emit('test-event', 'second');

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith('first');
    });

    it('should remove listener when scope is disposed before event fires', () => {
      const emitter = new EventEmitter();
      const handler = vi.fn();

      registry.addOnceListener('scope', emitter, 'test-event', handler);
      registry.disposeScope('scope');

      emitter.emit('test-event', 'data');
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('addInterval', () => {
    it('should create interval that executes periodically', () => {
      const fn = vi.fn();
      registry.addInterval('scope', fn, 100);

      vi.advanceTimersByTime(350);

      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should clear interval when scope is disposed', () => {
      const fn = vi.fn();
      registry.addInterval('scope', fn, 100);

      vi.advanceTimersByTime(150);
      registry.disposeScope('scope');
      vi.advanceTimersByTime(500);

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should return interval ID', () => {
      const id = registry.addInterval('scope', vi.fn(), 100);
      expect(id).toBeDefined();
    });
  });

  describe('addTimeout', () => {
    it('should create timeout that executes after delay', () => {
      const fn = vi.fn();
      registry.addTimeout('scope', fn, 100);

      expect(fn).not.toHaveBeenCalled();
      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should clear timeout when scope is disposed', () => {
      const fn = vi.fn();
      registry.addTimeout('scope', fn, 100);

      vi.advanceTimersByTime(50);
      registry.disposeScope('scope');
      vi.advanceTimersByTime(100);

      expect(fn).not.toHaveBeenCalled();
    });

    it('should return timeout ID', () => {
      const id = registry.addTimeout('scope', vi.fn(), 100);
      expect(id).toBeDefined();
    });
  });

  describe('addAbortController', () => {
    it('should create AbortController', () => {
      const controller = registry.addAbortController('scope');

      expect(controller).toBeInstanceOf(AbortController);
      expect(controller.signal.aborted).toBe(false);
    });

    it('should abort controller when scope is disposed', () => {
      const controller = registry.addAbortController('scope');

      registry.disposeScope('scope');

      expect(controller.signal.aborted).toBe(true);
    });

    it('should not throw if controller already aborted', () => {
      const controller = registry.addAbortController('scope');
      controller.abort();

      expect(() => registry.disposeScope('scope')).not.toThrow();
    });

    it('should track controller as disposable', () => {
      registry.addAbortController('scope');
      expect(registry.getScopeSize('scope')).toBe(1);
    });
  });

  describe('hasScope', () => {
    it('returns false for non-existent scope', () => {
      expect(registry.hasScope('unknown')).toBe(false);
    });

    it('returns true for existing scope', () => {
      registry.register('known', { dispose: vi.fn() });
      expect(registry.hasScope('known')).toBe(true);
    });

    it('returns false after scope is disposed', () => {
      registry.register('scope', { dispose: vi.fn() });
      registry.disposeScope('scope');
      expect(registry.hasScope('scope')).toBe(false);
    });
  });

  describe('getScopeSize', () => {
    it('returns 0 for non-existent scope', () => {
      expect(registry.getScopeSize('unknown')).toBe(0);
    });

    it('returns correct count for scope', () => {
      registry.register('scope', { dispose: vi.fn() });
      registry.register('scope', { dispose: vi.fn() });
      expect(registry.getScopeSize('scope')).toBe(2);
    });

    it('returns 0 after scope is disposed', () => {
      registry.register('scope', { dispose: vi.fn() });
      registry.disposeScope('scope');
      expect(registry.getScopeSize('scope')).toBe(0);
    });
  });

  describe('getScopes', () => {
    it('returns empty array when no scopes', () => {
      expect(registry.getScopes()).toEqual([]);
    });

    it('returns all active scope names', () => {
      registry.register('scope-a', { dispose: vi.fn() });
      registry.register('scope-b', { dispose: vi.fn() });

      const scopes = registry.getScopes();
      expect(scopes).toContain('scope-a');
      expect(scopes).toContain('scope-b');
      expect(scopes).toHaveLength(2);
    });

    it('excludes disposed scopes', () => {
      registry.register('scope-a', { dispose: vi.fn() });
      registry.register('scope-b', { dispose: vi.fn() });
      registry.disposeScope('scope-a');

      expect(registry.getScopes()).toEqual(['scope-b']);
    });
  });

  describe('disposeScope', () => {
    it('calls dispose on all registered disposables', () => {
      const dispose1 = vi.fn();
      const dispose2 = vi.fn();
      registry.register('scope', { dispose: dispose1 });
      registry.register('scope', { dispose: dispose2 });

      registry.disposeScope('scope');

      expect(dispose1).toHaveBeenCalled();
      expect(dispose2).toHaveBeenCalled();
    });

    it('returns count of disposed resources', () => {
      registry.register('scope', { dispose: vi.fn() });
      registry.register('scope', { dispose: vi.fn() });

      const count = registry.disposeScope('scope');

      expect(count).toBe(2);
    });

    it('returns 0 for non-existent scope', () => {
      const count = registry.disposeScope('unknown');
      expect(count).toBe(0);
    });

    it('handles errors in dispose without throwing', () => {
      registry.register('scope', {
        dispose: () => {
          throw new Error('Dispose error');
        },
      });
      registry.register('scope', { dispose: vi.fn() });

      expect(() => registry.disposeScope('scope')).not.toThrow();
    });

    it('continues disposing after error', () => {
      const dispose1 = vi.fn(() => {
        throw new Error('Error');
      });
      const dispose2 = vi.fn();
      registry.register('scope', { dispose: dispose1 });
      registry.register('scope', { dispose: dispose2 });

      registry.disposeScope('scope');

      expect(dispose2).toHaveBeenCalled();
    });

    it('handles errors in cleanup callbacks without throwing', () => {
      registry.onScopeDispose('scope', () => {
        throw new Error('Callback error');
      });
      registry.register('scope', { dispose: vi.fn() });

      expect(() => registry.disposeScope('scope')).not.toThrow();
    });
  });

  describe('disposeAll', () => {
    it('disposes all scopes', () => {
      const dispose1 = vi.fn();
      const dispose2 = vi.fn();
      registry.register('scope-a', { dispose: dispose1 });
      registry.register('scope-b', { dispose: dispose2 });

      registry.disposeAll();

      expect(dispose1).toHaveBeenCalled();
      expect(dispose2).toHaveBeenCalled();
    });

    it('returns total count of disposed resources', () => {
      registry.register('scope-a', { dispose: vi.fn() });
      registry.register('scope-a', { dispose: vi.fn() });
      registry.register('scope-b', { dispose: vi.fn() });

      const count = registry.disposeAll();

      expect(count).toBe(3);
    });

    it('returns 0 when no scopes exist', () => {
      const count = registry.disposeAll();
      expect(count).toBe(0);
    });

    it('clears all scopes after disposal', () => {
      registry.register('scope-a', { dispose: vi.fn() });
      registry.register('scope-b', { dispose: vi.fn() });

      registry.disposeAll();

      expect(registry.getScopes()).toEqual([]);
    });
  });

  describe('getDebugInfo', () => {
    it('returns empty object when no scopes', () => {
      expect(registry.getDebugInfo()).toEqual({});
    });

    it('returns scope counts', () => {
      registry.register('scope-a', { dispose: vi.fn() });
      registry.register('scope-a', { dispose: vi.fn() });
      registry.register('scope-b', { dispose: vi.fn() });

      const info = registry.getDebugInfo();

      expect(info).toEqual({
        'scope-a': 2,
        'scope-b': 1,
      });
    });
  });

  describe('integration scenarios', () => {
    it('handles complex cleanup scenario with mixed resources', () => {
      const emitter = new EventEmitter();
      const handler = vi.fn();
      const intervalFn = vi.fn();
      const timeoutFn = vi.fn();
      const cleanup = vi.fn();

      registry.addListener('process:123', emitter, 'message', handler);
      registry.addInterval('process:123', intervalFn, 1000);
      registry.addTimeout('process:123', timeoutFn, 5000);
      registry.addAbortController('process:123');
      registry.onScopeDispose('process:123', cleanup);

      expect(registry.getScopeSize('process:123')).toBe(4);

      // Simulate some activity
      emitter.emit('message', 'hello');
      vi.advanceTimersByTime(2500);

      // Dispose everything
      registry.disposeScope('process:123');

      // Verify cleanup
      expect(cleanup).toHaveBeenCalled();
      expect(registry.hasScope('process:123')).toBe(false);

      // Further events/timers should not fire
      emitter.emit('message', 'world');
      vi.advanceTimersByTime(5000);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(intervalFn).toHaveBeenCalledTimes(2); // Only the 2 before dispose
    });

    it('handles multiple scopes independently', () => {
      const emitter1 = new EventEmitter();
      const emitter2 = new EventEmitter();
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      registry.addListener('scope-1', emitter1, 'event', handler1);
      registry.addListener('scope-2', emitter2, 'event', handler2);

      // Dispose only scope-1
      registry.disposeScope('scope-1');

      emitter1.emit('event');
      emitter2.emit('event');

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
  });
});
