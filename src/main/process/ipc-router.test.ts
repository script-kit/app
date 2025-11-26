import { EventEmitter } from 'node:events';
import { Channel } from '@johnlindquist/kit/core/enum';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IPCMessageRouter } from './ipc-router';
import type { IPCMessage, ProcessAndPromptInfo } from './types';

// Mock logs
vi.mock('../logs', () => ({
  processLog: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    verbose: vi.fn(),
    silly: vi.fn(),
  },
}));

// Create a mock child process factory
function createMockChildProcess(options: { connected?: boolean; killed?: boolean } = {}) {
  const emitter = new EventEmitter() as EventEmitter & {
    connected: boolean;
    killed: boolean;
    send: ReturnType<typeof vi.fn>;
  };
  emitter.connected = options.connected ?? true;
  emitter.killed = options.killed ?? false;
  emitter.send = vi.fn((data, callback) => {
    if (callback) callback(null);
    return true;
  });
  return emitter;
}

// Create a mock ProcessAndPromptInfo
function createMockProcessInfo(overrides: Partial<ProcessAndPromptInfo> = {}): ProcessAndPromptInfo {
  return {
    pid: 12345,
    child: createMockChildProcess() as any,
    ...overrides,
  } as ProcessAndPromptInfo;
}

describe('IPCMessageRouter', () => {
  let router: IPCMessageRouter;

  beforeEach(() => {
    router = new IPCMessageRouter();
    vi.clearAllMocks();
  });

  describe('register/unregister', () => {
    it('should register a handler', () => {
      const handler = vi.fn();
      router.register(Channel.SET_VALUE, handler);

      expect(router.hasHandler(Channel.SET_VALUE)).toBe(true);
    });

    it('should register with description', () => {
      const handler = vi.fn();
      router.register(Channel.SET_VALUE, handler, { description: 'Test handler' });

      const debug = router.getDebugInfo();
      expect((debug.handlers as any)[Channel.SET_VALUE].description).toBe('Test handler');
    });

    it('should register with priority', () => {
      const handler = vi.fn();
      router.register(Channel.SET_VALUE, handler, { priority: 10 });

      const debug = router.getDebugInfo();
      expect((debug.handlers as any)[Channel.SET_VALUE].priority).toBe(10);
    });

    it('should overwrite existing handler', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      router.register(Channel.SET_VALUE, handler1);
      router.register(Channel.SET_VALUE, handler2);

      expect(router.hasHandler(Channel.SET_VALUE)).toBe(true);
      // The second handler should be the one registered
    });

    it('should unregister a handler', () => {
      const handler = vi.fn();
      router.register(Channel.SET_VALUE, handler);

      const removed = router.unregister(Channel.SET_VALUE);

      expect(removed).toBe(true);
      expect(router.hasHandler(Channel.SET_VALUE)).toBe(false);
    });

    it('should return false when unregistering non-existent handler', () => {
      const removed = router.unregister(Channel.SET_VALUE);
      expect(removed).toBe(false);
    });
  });

  describe('registerMany', () => {
    it('should register multiple handlers', () => {
      router.registerMany({
        [Channel.SET_VALUE]: vi.fn(),
        [Channel.SET_INPUT]: vi.fn(),
        [Channel.SET_CHOICES]: vi.fn(),
      });

      expect(router.hasHandler(Channel.SET_VALUE)).toBe(true);
      expect(router.hasHandler(Channel.SET_INPUT)).toBe(true);
      expect(router.hasHandler(Channel.SET_CHOICES)).toBe(true);
    });
  });

  describe('addGlobalHandler', () => {
    it('should add a global handler', async () => {
      const globalHandler = vi.fn();
      const handler = vi.fn();

      router.addGlobalHandler(globalHandler);
      router.register(Channel.SET_VALUE, handler);

      const message: IPCMessage = { channel: Channel.SET_VALUE, value: 'test' };
      const processInfo = createMockProcessInfo();

      await router.route(message, processInfo);

      expect(globalHandler).toHaveBeenCalledWith(message, processInfo);
    });

    it('should allow removing global handler', async () => {
      const globalHandler = vi.fn();
      const handler = vi.fn();

      const unsubscribe = router.addGlobalHandler(globalHandler);
      router.register(Channel.SET_VALUE, handler);

      unsubscribe();

      const message: IPCMessage = { channel: Channel.SET_VALUE, value: 'test' };
      await router.route(message, createMockProcessInfo());

      expect(globalHandler).not.toHaveBeenCalled();
    });

    it('should call multiple global handlers', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      router.addGlobalHandler(handler1);
      router.addGlobalHandler(handler2);
      router.register(Channel.SET_VALUE, vi.fn());

      const message: IPCMessage = { channel: Channel.SET_VALUE, value: 'test' };
      await router.route(message, createMockProcessInfo());

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
  });

  describe('middleware', () => {
    it('should run middleware before handler', async () => {
      const order: string[] = [];
      const middleware = vi.fn(async (msg, info, next) => {
        order.push('middleware');
        await next();
      });
      const handler = vi.fn(() => {
        order.push('handler');
      });

      router.use(middleware);
      router.register(Channel.SET_VALUE, handler);

      const message: IPCMessage = { channel: Channel.SET_VALUE, value: 'test' };
      await router.route(message, createMockProcessInfo());

      expect(order).toEqual(['middleware', 'handler']);
    });

    it('should chain multiple middleware', async () => {
      const order: string[] = [];
      const middleware1 = vi.fn(async (msg, info, next) => {
        order.push('mw1-before');
        await next();
        order.push('mw1-after');
      });
      const middleware2 = vi.fn(async (msg, info, next) => {
        order.push('mw2-before');
        await next();
        order.push('mw2-after');
      });
      const handler = vi.fn(() => {
        order.push('handler');
      });

      router.use(middleware1);
      router.use(middleware2);
      router.register(Channel.SET_VALUE, handler);

      const message: IPCMessage = { channel: Channel.SET_VALUE, value: 'test' };
      await router.route(message, createMockProcessInfo());

      expect(order).toEqual(['mw1-before', 'mw2-before', 'handler', 'mw2-after', 'mw1-after']);
    });

    it('should allow removing middleware', async () => {
      const middleware = vi.fn(async (msg, info, next) => {
        await next();
      });

      const unsubscribe = router.use(middleware);
      router.register(Channel.SET_VALUE, vi.fn());

      unsubscribe();

      const message: IPCMessage = { channel: Channel.SET_VALUE, value: 'test' };
      await router.route(message, createMockProcessInfo());

      expect(middleware).not.toHaveBeenCalled();
    });
  });

  describe('blockChannel', () => {
    it('should block a channel', async () => {
      const handler = vi.fn();
      router.register(Channel.SET_VALUE, handler);
      router.blockChannel(Channel.SET_VALUE);

      const message: IPCMessage = { channel: Channel.SET_VALUE, value: 'test' };
      const result = await router.route(message, createMockProcessInfo());

      expect(result).toBe(false);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should unblock a channel', async () => {
      const handler = vi.fn();
      router.register(Channel.SET_VALUE, handler);
      router.blockChannel(Channel.SET_VALUE);
      router.unblockChannel(Channel.SET_VALUE);

      const message: IPCMessage = { channel: Channel.SET_VALUE, value: 'test' };
      const result = await router.route(message, createMockProcessInfo());

      expect(result).toBe(true);
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('route', () => {
    it('should route message to handler', async () => {
      const handler = vi.fn();
      router.register(Channel.SET_VALUE, handler);

      const message: IPCMessage = { channel: Channel.SET_VALUE, value: 'test' };
      const result = await router.route(message, createMockProcessInfo());

      expect(result).toBe(true);
      expect(handler).toHaveBeenCalledWith(message);
    });

    it('should return false for unregistered channel', async () => {
      const message: IPCMessage = { channel: Channel.SET_VALUE, value: 'test' };
      const result = await router.route(message, createMockProcessInfo());

      expect(result).toBe(false);
    });

    it('should respect process preventChannels', async () => {
      const handler = vi.fn();
      router.register(Channel.SET_VALUE, handler);

      const message: IPCMessage = { channel: Channel.SET_VALUE, value: 'test' };
      const processInfo = createMockProcessInfo({
        preventChannels: new Set([Channel.SET_VALUE]),
      });

      const result = await router.route(message, processInfo);

      expect(result).toBe(false);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should handle errors in handler', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('Handler error'));
      router.register(Channel.SET_VALUE, handler);

      const message: IPCMessage = { channel: Channel.SET_VALUE, value: 'test' };
      const result = await router.route(message, createMockProcessInfo());

      expect(result).toBe(false);
    });

    it('should handle errors in global handler without stopping', async () => {
      const globalHandler = vi.fn().mockImplementation(() => {
        throw new Error('Global handler error');
      });
      const handler = vi.fn();

      router.addGlobalHandler(globalHandler);
      router.register(Channel.SET_VALUE, handler);

      const message: IPCMessage = { channel: Channel.SET_VALUE, value: 'test' };
      const result = await router.route(message, createMockProcessInfo());

      expect(result).toBe(true);
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('createHandler', () => {
    it('should create a bound message handler', async () => {
      const handler = vi.fn();
      router.register(Channel.SET_VALUE, handler);

      const processInfo = createMockProcessInfo();
      const boundHandler = router.createHandler(processInfo);

      const message: IPCMessage = { channel: Channel.SET_VALUE, value: 'test' };
      boundHandler(message);

      // Wait for async routing
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(handler).toHaveBeenCalledWith(message);
    });
  });

  describe('send', () => {
    it('should send message to child process', () => {
      const child = createMockChildProcess();
      const result = router.send(child as any, Channel.SET_VALUE, 'test', 'prompt-123');

      expect(result).toBe(true);
      expect(child.send).toHaveBeenCalledWith(
        { channel: Channel.SET_VALUE, value: 'test', promptId: 'prompt-123' },
        expect.any(Function),
      );
    });

    it('should return false for disconnected process', () => {
      const child = createMockChildProcess({ connected: false });
      const result = router.send(child as any, Channel.SET_VALUE, 'test');

      expect(result).toBe(false);
      expect(child.send).not.toHaveBeenCalled();
    });

    it('should return false for killed process', () => {
      const child = createMockChildProcess({ killed: true });
      const result = router.send(child as any, Channel.SET_VALUE, 'test');

      expect(result).toBe(false);
      expect(child.send).not.toHaveBeenCalled();
    });

    it('should handle send errors', () => {
      const child = createMockChildProcess();
      (child.send as any).mockImplementation(() => {
        throw new Error('Send error');
      });

      const result = router.send(child as any, Channel.SET_VALUE, 'test');

      expect(result).toBe(false);
    });
  });

  describe('broadcast', () => {
    it('should broadcast to multiple processes', () => {
      const children = [createMockChildProcess(), createMockChildProcess(), createMockChildProcess()];

      const sent = router.broadcast(children as any[], Channel.SET_VALUE, 'test');

      expect(sent).toBe(3);
      for (const child of children) {
        expect(child.send).toHaveBeenCalled();
      }
    });

    it('should skip disconnected processes', () => {
      const children = [
        createMockChildProcess(),
        createMockChildProcess({ connected: false }),
        createMockChildProcess(),
      ];

      const sent = router.broadcast(children as any[], Channel.SET_VALUE, 'test');

      expect(sent).toBe(2);
    });
  });

  describe('clear', () => {
    it('should clear all handlers', () => {
      router.register(Channel.SET_VALUE, vi.fn());
      router.addGlobalHandler(vi.fn());
      router.use(async (msg, info, next) => next());
      router.blockChannel(Channel.SET_INPUT);

      router.clear();

      const debug = router.getDebugInfo();
      expect(debug.handlerCount).toBe(0);
      expect(debug.globalHandlerCount).toBe(0);
      expect(debug.middlewareCount).toBe(0);
      expect((debug.blockedChannels as any[]).length).toBe(0);
    });
  });

  describe('getRegisteredChannels', () => {
    it('should return all registered channels', () => {
      router.register(Channel.SET_VALUE, vi.fn());
      router.register(Channel.SET_INPUT, vi.fn());

      const channels = router.getRegisteredChannels();

      expect(channels).toContain(Channel.SET_VALUE);
      expect(channels).toContain(Channel.SET_INPUT);
      expect(channels).toHaveLength(2);
    });
  });

  describe('getDebugInfo', () => {
    it('should return handler count', () => {
      router.register(Channel.SET_VALUE, vi.fn());
      router.register(Channel.SET_INPUT, vi.fn());

      const debug = router.getDebugInfo();

      expect(debug.handlerCount).toBe(2);
    });

    it('should return handler details', () => {
      router.register(Channel.SET_VALUE, vi.fn(), { description: 'Test', priority: 5 });

      const debug = router.getDebugInfo();
      const handlerInfo = (debug.handlers as any)[Channel.SET_VALUE];

      expect(handlerInfo.description).toBe('Test');
      expect(handlerInfo.priority).toBe(5);
    });

    it('should return global handler count', () => {
      router.addGlobalHandler(vi.fn());
      router.addGlobalHandler(vi.fn());

      const debug = router.getDebugInfo();

      expect(debug.globalHandlerCount).toBe(2);
    });

    it('should return middleware count', () => {
      router.use(async (msg, info, next) => next());
      router.use(async (msg, info, next) => next());

      const debug = router.getDebugInfo();

      expect(debug.middlewareCount).toBe(2);
    });

    it('should return blocked channels', () => {
      router.blockChannel(Channel.SET_VALUE);
      router.blockChannel(Channel.SET_INPUT);

      const debug = router.getDebugInfo();

      expect(debug.blockedChannels).toContain(Channel.SET_VALUE);
      expect(debug.blockedChannels).toContain(Channel.SET_INPUT);
    });
  });
});
