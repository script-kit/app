/**
 * IPCMessageRouter - Routes IPC messages between processes and handlers
 *
 * Centralized message routing with handler registration,
 * replacing the ad-hoc message handling in process.ts.
 */

import type { ChildProcess } from 'node:child_process';
import { Channel } from '@johnlindquist/kit/core/enum';
import { processLog as log } from '../logs';
import type { IPCMessage, MessageHandler, ProcessAndPromptInfo } from './types';

/**
 * Handler with metadata
 */
interface RegisteredHandler {
  handler: MessageHandler;
  description?: string;
  priority: number;
}

/**
 * Message middleware
 */
export type MessageMiddleware = (
  message: IPCMessage,
  processInfo: ProcessAndPromptInfo,
  next: () => Promise<void>,
) => Promise<void>;

export class IPCMessageRouter {
  private handlers = new Map<Channel, RegisteredHandler>();
  private globalHandlers: ((message: IPCMessage, processInfo: ProcessAndPromptInfo) => void)[] = [];
  private middleware: MessageMiddleware[] = [];
  private blockedChannels = new Set<Channel>();

  /**
   * Channels to ignore in logs for reduced noise
   */
  private quietChannels = new Set<Channel>([Channel.HEARTBEAT, Channel.KIT_LOADING, Channel.KIT_READY]);

  /**
   * Register a handler for a specific channel
   */
  register(channel: Channel, handler: MessageHandler, options: { description?: string; priority?: number } = {}): void {
    const existing = this.handlers.get(channel);
    if (existing) {
      log.warn(`IPCRouter: Overwriting handler for channel ${channel}`);
    }

    this.handlers.set(channel, {
      handler,
      description: options.description,
      priority: options.priority ?? 0,
    });

    log.verbose(
      `IPCRouter: Registered handler for ${channel}${options.description ? ` (${options.description})` : ''}`,
    );
  }

  /**
   * Register multiple handlers at once
   */
  registerMany(handlers: Record<Channel, MessageHandler>): void {
    for (const [channel, handler] of Object.entries(handlers)) {
      this.register(channel as Channel, handler);
    }
  }

  /**
   * Unregister a handler
   */
  unregister(channel: Channel): boolean {
    const removed = this.handlers.delete(channel);
    if (removed) {
      log.verbose(`IPCRouter: Unregistered handler for ${channel}`);
    }
    return removed;
  }

  /**
   * Add a global handler that receives all messages
   */
  addGlobalHandler(handler: (message: IPCMessage, processInfo: ProcessAndPromptInfo) => void): () => void {
    this.globalHandlers.push(handler);
    return () => {
      const index = this.globalHandlers.indexOf(handler);
      if (index !== -1) {
        this.globalHandlers.splice(index, 1);
      }
    };
  }

  /**
   * Add middleware that runs before handlers
   */
  use(middleware: MessageMiddleware): () => void {
    this.middleware.push(middleware);
    return () => {
      const index = this.middleware.indexOf(middleware);
      if (index !== -1) {
        this.middleware.splice(index, 1);
      }
    };
  }

  /**
   * Block a channel from being processed
   */
  blockChannel(channel: Channel): void {
    this.blockedChannels.add(channel);
  }

  /**
   * Unblock a channel
   */
  unblockChannel(channel: Channel): void {
    this.blockedChannels.delete(channel);
  }

  /**
   * Check if a channel has a handler
   */
  hasHandler(channel: Channel): boolean {
    return this.handlers.has(channel);
  }

  /**
   * Get all registered channels
   */
  getRegisteredChannels(): Channel[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Route a message to its handler
   */
  async route(message: IPCMessage, processInfo: ProcessAndPromptInfo): Promise<boolean> {
    const { channel } = message;

    // Check if channel is blocked for this process
    if (processInfo.preventChannels?.has(channel)) {
      return false;
    }

    // Check global block
    if (this.blockedChannels.has(channel)) {
      return false;
    }

    // Log non-quiet messages
    if (!this.quietChannels.has(channel)) {
      log.silly(`IPCRouter: Routing ${channel} from ${processInfo.pid}`);
    }

    // Notify global handlers
    for (const globalHandler of this.globalHandlers) {
      try {
        globalHandler(message, processInfo);
      } catch (error) {
        log.error(`IPCRouter: Global handler error:`, error);
      }
    }

    // Get handler
    const registered = this.handlers.get(channel);
    if (!registered) {
      if (!this.quietChannels.has(channel)) {
        log.verbose(`IPCRouter: No handler for channel ${channel}`);
      }
      return false;
    }

    // Run middleware chain
    let middlewareIndex = 0;
    const runNext = async (): Promise<void> => {
      if (middlewareIndex < this.middleware.length) {
        const mw = this.middleware[middlewareIndex++];
        await mw(message, processInfo, runNext);
      } else {
        // Finally run the handler
        await registered.handler(message);
      }
    };

    try {
      await runNext();
      return true;
    } catch (error) {
      log.error(`IPCRouter: Error handling ${channel}:`, error);
      return false;
    }
  }

  /**
   * Create a bound message handler for a specific process
   */
  createHandler(processInfo: ProcessAndPromptInfo): (data: unknown) => void {
    return (data: unknown) => {
      const message = data as IPCMessage;
      this.route(message, processInfo).catch((error) => {
        log.error(`IPCRouter: Unhandled routing error:`, error);
      });
    };
  }

  /**
   * Send a message to a child process
   */
  send(child: ChildProcess, channel: Channel, value?: unknown, promptId?: string): boolean {
    if (!child.connected || child.killed) {
      log.warn(`IPCRouter: Cannot send to disconnected process`);
      return false;
    }

    try {
      child.send({ channel, value, promptId }, (error) => {
        if (error) {
          log.warn(`IPCRouter: Send error for ${channel}: ${error.message}`);
        }
      });
      return true;
    } catch (error) {
      log.error(`IPCRouter: Failed to send ${channel}:`, error);
      return false;
    }
  }

  /**
   * Broadcast a message to multiple processes
   */
  broadcast(children: ChildProcess[], channel: Channel, value?: unknown): number {
    let sent = 0;
    for (const child of children) {
      if (this.send(child, channel, value)) {
        sent++;
      }
    }
    return sent;
  }

  /**
   * Clear all handlers
   */
  clear(): void {
    this.handlers.clear();
    this.globalHandlers = [];
    this.middleware = [];
    this.blockedChannels.clear();
    log.info('IPCRouter: Cleared all handlers');
  }

  /**
   * Get debug info
   */
  getDebugInfo(): Record<string, unknown> {
    const handlers: Record<string, unknown> = {};
    for (const [channel, registered] of this.handlers) {
      handlers[channel] = {
        description: registered.description,
        priority: registered.priority,
      };
    }

    return {
      handlerCount: this.handlers.size,
      handlers,
      globalHandlerCount: this.globalHandlers.length,
      middlewareCount: this.middleware.length,
      blockedChannels: Array.from(this.blockedChannels),
    };
  }
}

// Export singleton for shared use
export const ipcRouter = new IPCMessageRouter();
