/**
 * ProcessManager - Orchestrates all process management services
 *
 * Single entry point for process lifecycle management, coordinating
 * the idle pool, IPC routing, heartbeats, state machines, and cleanup.
 *
 * This class provides two modes of operation:
 * 1. Standalone mode: Creates processes directly using fork()
 * 2. Legacy integration mode: Wraps the existing processes singleton
 *
 * During migration, legacy integration mode is used to maintain
 * backward compatibility with existing code.
 */

import type { ChildProcess } from 'node:child_process';
import { fork } from 'node:child_process';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { Channel, ProcessType } from '@johnlindquist/kit/core/enum';
import { KIT_APP, KIT_APP_PROMPT, kitPath, resolveToScriptPath } from '@johnlindquist/kit/core/utils';
import { pathExistsSync } from '../cjs-exports';
import { createEnv } from '../env.utils';
import { processLog as log } from '../logs';
import { processScanner } from '../process-scanner';
import { kitState } from '../state';

import { type DisposableRegistry, disposableRegistry } from './disposable-registry';
import { type HeartbeatManager, heartbeatManager } from './heartbeat-manager';
import { type IdleProcessPool, idleProcessPool } from './idle-pool';
import { type IPCMessageRouter, ipcRouter } from './ipc-router';
import { ProcessState, ProcessStateMachine } from './process-state';
import type { ProcessAndPromptInfo, ProcessHandle, ProcessMetrics, SpawnOptions } from './types';

/**
 * Legacy integration type for backward compatibility
 * This represents the existing Processes class interface
 */
interface LegacyProcesses {
  add: (type: ProcessType, scriptPath?: string, args?: string[], port?: number) => any;
  removeByPid: (pid: number, reason?: string) => void;
  getByPid: (pid: number) => any;
  getAllProcessInfo: () => any[];
  getActiveProcesses: () => any[];
  findIdlePromptProcess: () => any;
  startHeartbeat: () => void;
  stopHeartbeat: () => void;
}

/**
 * Managed process entry
 */
interface ManagedProcess {
  pid: number;
  child: ChildProcess;
  state: ProcessStateMachine;
  type: ProcessType;
  scriptPath: string;
  startTime: number;
  promptInfo?: ProcessAndPromptInfo;
}

/**
 * ProcessManager configuration
 */
export interface ProcessManagerConfig {
  /** Default timeout for graceful shutdown (ms) */
  shutdownTimeout: number;
  /** Enable heartbeat monitoring */
  heartbeatEnabled: boolean;
  /** Idle pool configuration */
  idlePoolSize: number;
  /** Use legacy processes singleton for backward compatibility */
  useLegacyProcesses: boolean;
}

const DEFAULT_CONFIG: ProcessManagerConfig = {
  shutdownTimeout: 5000,
  heartbeatEnabled: true,
  idlePoolSize: 2,
  useLegacyProcesses: true, // Default to legacy mode during migration
};

export class ProcessManager {
  private processes = new Map<number, ManagedProcess>();
  private config: ProcessManagerConfig;

  // Injected services (allows for testing)
  private disposables: DisposableRegistry;
  private pool: IdleProcessPool;
  private heartbeats: HeartbeatManager;
  private router: IPCMessageRouter;

  // Legacy integration (set during initialization)
  private legacyProcesses: LegacyProcesses | null = null;

  constructor(
    config: Partial<ProcessManagerConfig> = {},
    services?: {
      disposables?: DisposableRegistry;
      pool?: IdleProcessPool;
      heartbeats?: HeartbeatManager;
      router?: IPCMessageRouter;
    },
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Use injected services or singletons
    this.disposables = services?.disposables ?? disposableRegistry;
    this.pool = services?.pool ?? idleProcessPool;
    this.heartbeats = services?.heartbeats ?? heartbeatManager;
    this.router = services?.router ?? ipcRouter;
  }

  /**
   * Set the legacy processes singleton for backward compatibility
   * Call this during app initialization with the processes singleton
   */
  setLegacyProcesses(processes: LegacyProcesses): void {
    this.legacyProcesses = processes;
    log.info('ProcessManager: Legacy processes integration enabled');
  }

  /**
   * Check if legacy mode is active
   */
  isLegacyMode(): boolean {
    return this.config.useLegacyProcesses && this.legacyProcesses !== null;
  }

  /**
   * Initialize the process manager
   */
  async initialize(): Promise<void> {
    log.info('ProcessManager: Initializing...');

    // Configure idle pool
    this.pool.setConfig({ maxSize: this.config.idlePoolSize, minSize: 1 });

    // Start heartbeat if enabled
    if (this.config.heartbeatEnabled) {
      this.heartbeats.start();
    }

    log.info('ProcessManager: Initialized');
  }

  /**
   * Spawn a new process
   *
   * In legacy mode, delegates to the existing processes.add() method.
   * In standalone mode, creates processes directly with full state machine support.
   */
  spawn(type: ProcessType, options: SpawnOptions = {}): ProcessHandle {
    const { scriptPath = '', args = [], port = 0, cwd } = options;

    // Legacy mode: delegate to existing processes singleton
    if (this.isLegacyMode()) {
      return this.spawnLegacy(type, scriptPath, args, port);
    }

    // Standalone mode: full ProcessManager control
    return this.spawnStandalone(type, options);
  }

  /**
   * Spawn using legacy processes singleton (backward compatibility)
   */
  private spawnLegacy(type: ProcessType, scriptPath: string, args: string[], port: number): ProcessHandle {
    if (!this.legacyProcesses) {
      throw new Error('Legacy processes not initialized');
    }

    const processInfo = this.legacyProcesses.add(type, scriptPath, args, port);
    const pid = processInfo.pid;
    const child = processInfo.child;

    log.info(`ProcessManager: Spawned process ${pid} via legacy mode (${type}, script: ${scriptPath || 'idle'})`);

    // Create a state machine to track this process (for observability)
    const state = new ProcessStateMachine(pid);
    state.transition({ type: 'SPAWN' });

    // Store reference for tracking
    const managed: ManagedProcess = {
      pid,
      child,
      state,
      type,
      scriptPath,
      startTime: Date.now(),
      promptInfo: processInfo,
    };
    this.processes.set(pid, managed);

    // Return handle that delegates to legacy methods
    return {
      pid,
      child,
      terminate: (reason?: string) => {
        this.legacyProcesses?.removeByPid(pid, reason || 'ProcessManager.terminate');
        this.processes.delete(pid);
        return Promise.resolve(true);
      },
      send: (data: unknown) => {
        if (child?.connected && !child.killed) {
          try {
            child.send(data, (err) => {
              if (err) {
                log.warn(`ProcessManager: Send error for ${pid}: ${err.message}`);
              }
            });
            return true;
          } catch (error) {
            log.error(`ProcessManager: Failed to send to ${pid}:`, error);
            return false;
          }
        }
        return false;
      },
    };
  }

  /**
   * Spawn using standalone mode (full ProcessManager control)
   */
  private spawnStandalone(type: ProcessType, options: SpawnOptions): ProcessHandle {
    const { scriptPath = '', args = [], port = 0, cwd } = options;

    // Resolve script path if provided
    const resolvedScriptPath = scriptPath ? resolveToScriptPath(scriptPath) : '';

    // Try to get from idle pool first (for Prompt types without debug port)
    let child: ChildProcess | null = null;
    if (type === ProcessType.Prompt && !port && !resolvedScriptPath) {
      child = this.pool.acquire();
      if (child) {
        log.info(`ProcessManager: Acquired process ${child.pid} from idle pool`);
      }
    }

    // Create new process if not from pool
    if (!child) {
      child = this.createProcess(type, resolvedScriptPath, args, port, cwd);
    }

    if (!child || !child.pid) {
      throw new Error('Failed to create process');
    }

    const pid = child.pid;
    const scope = `process:${pid}`;

    // Create state machine
    const state = new ProcessStateMachine(pid);
    state.transition({ type: 'SPAWN' });

    // Register with scanner
    processScanner.register(pid, {
      scriptPath: resolvedScriptPath,
      startTime: Date.now(),
    });

    // Create managed entry
    const managed: ManagedProcess = {
      pid,
      child,
      state,
      type,
      scriptPath: resolvedScriptPath,
      startTime: Date.now(),
    };
    this.processes.set(pid, managed);

    // Setup event handlers with automatic cleanup
    this.setupProcessHandlers(managed, scope);

    // Register heartbeat if visible prompt
    if (type === ProcessType.Prompt && this.config.heartbeatEnabled) {
      this.heartbeats.register(pid, child, () => {
        const m = this.processes.get(pid);
        return m?.promptInfo?.prompt?.isVisible() ?? false;
      });
    }

    log.info(`ProcessManager: Spawned process ${pid} (${type}, script: ${resolvedScriptPath || 'idle'})`);

    // Return handle
    return {
      pid,
      child,
      terminate: (reason?: string) => this.terminate(pid, reason),
      send: (data: unknown) => this.send(pid, data),
    };
  }

  /**
   * Create a new child process
   */
  private createProcess(
    type: ProcessType,
    scriptPath: string,
    args: string[],
    port: number,
    cwd?: string,
  ): ChildProcess {
    const isPrompt = type === ProcessType.Prompt;
    const entry = isPrompt ? KIT_APP_PROMPT : KIT_APP;

    if (!pathExistsSync(entry)) {
      throw new Error(`Entry point not found: ${entry}`);
    }

    const processArgs = scriptPath ? [scriptPath, ...args] : args;
    const env = createEnv();
    const loaderFileUrl = pathToFileURL(kitPath('build', 'loader.js')).href;

    const child = fork(entry, processArgs, {
      silent: true,
      stdio: kitState?.kenvEnv?.KIT_STDIO || 'pipe',
      execPath: kitState.KIT_NODE_PATH,
      cwd: cwd || kitState?.kenvEnv?.KIT_CWD || os.homedir(),
      execArgv: port ? ['--loader', loaderFileUrl, `--inspect=${port}`] : ['--loader', loaderFileUrl],
      windowsHide: kitState?.kenvEnv?.KIT_WINDOWS_HIDE === 'true',
      detached: !port,
      env: {
        ...env,
        KIT_DEBUG: port ? '1' : '0',
      },
    });

    return child;
  }

  /**
   * Setup event handlers for a process
   */
  private setupProcessHandlers(managed: ManagedProcess, scope: string): void {
    const { child, state, pid } = managed;

    // KIT_READY handler
    const readyHandler = (data: { channel?: Channel }) => {
      if (data?.channel === Channel.KIT_READY) {
        state.transition({ type: 'READY' });
        child.off('message', readyHandler);
      }
    };
    child.on('message', readyHandler);

    // Message routing
    this.disposables.addListener(scope, child, 'message', (data) => {
      if (managed.promptInfo) {
        this.router.route(data as any, managed.promptInfo);
      }
    });

    // Exit handler
    this.disposables.addOnceListener(scope, child, 'exit', (code: number | null) => {
      log.info(`ProcessManager: Process ${pid} exited with code ${code}`);
      state.transition({ type: 'EXIT', code });
      this.cleanup(pid, 'exit');
    });

    // Error handler
    this.disposables.addListener(scope, child, 'error', (error: Error) => {
      if (error.message?.includes('EPIPE')) {
        log.verbose(`ProcessManager: Process ${pid} EPIPE (ignored)`);
        return;
      }
      log.error(`ProcessManager: Process ${pid} error:`, error);
      state.transition({ type: 'ERROR', error });
      this.cleanup(pid, 'error');
    });

    // Disconnect handler
    this.disposables.addOnceListener(scope, child, 'disconnect', () => {
      log.info(`ProcessManager: Process ${pid} disconnected`);
      this.cleanup(pid, 'disconnect');
    });
  }

  /**
   * Terminate a process
   */
  async terminate(pid: number, reason = 'unknown'): Promise<boolean> {
    const managed = this.processes.get(pid);
    if (!managed) {
      log.warn(`ProcessManager: Process ${pid} not found for termination`);
      return false;
    }

    const { state, child } = managed;

    // Check if we can stop
    if (!state.canStop() && !state.canForceStop()) {
      log.warn(`ProcessManager: Cannot terminate process ${pid} in state ${state.getState()}`);
      return false;
    }

    // Use force stop if normal stop not allowed
    const eventType = state.canStop() ? 'STOP' : 'FORCE_STOP';
    const result = state.transition({ type: eventType, reason });

    if (!result.success && eventType === 'STOP') {
      // Try force stop
      state.transition({ type: 'FORCE_STOP', reason });
    }

    // Kill the process
    if (!child.killed) {
      try {
        // Try graceful shutdown first
        child.kill('SIGTERM');

        // Wait for exit or force kill after timeout
        await Promise.race([
          new Promise<void>((resolve) => child.once('exit', () => resolve())),
          new Promise<void>((resolve) =>
            setTimeout(() => {
              if (!child.killed) {
                child.kill('SIGKILL');
              }
              resolve();
            }, this.config.shutdownTimeout),
          ),
        ]);
      } catch (error) {
        log.error(`ProcessManager: Error terminating process ${pid}:`, error);
        child.kill('SIGKILL');
      }
    }

    this.cleanup(pid, reason);
    return true;
  }

  /**
   * Cleanup a process
   */
  private cleanup(pid: number, reason: string): void {
    const scope = `process:${pid}`;

    // Unregister from services
    this.heartbeats.unregister(pid);
    processScanner.unregister(pid);
    processScanner.clearCache();

    // Dispose all tracked resources
    this.disposables.disposeScope(scope);

    // Remove from managed list
    this.processes.delete(pid);

    log.info(`ProcessManager: Cleaned up process ${pid} (${reason})`);
  }

  /**
   * Send data to a process
   */
  send(pid: number, data: unknown): boolean {
    const managed = this.processes.get(pid);
    if (!managed) {
      log.warn(`ProcessManager: Process ${pid} not found for send`);
      return false;
    }

    const { child, state } = managed;

    if (!state.isReady()) {
      log.warn(`ProcessManager: Process ${pid} not ready for messages (state: ${state.getState()})`);
      return false;
    }

    if (!child.connected || child.killed) {
      log.warn(`ProcessManager: Process ${pid} not connected`);
      return false;
    }

    try {
      child.send(data, (error) => {
        if (error) {
          log.warn(`ProcessManager: Send error for ${pid}: ${error.message}`);
        }
      });
      return true;
    } catch (error) {
      log.error(`ProcessManager: Failed to send to ${pid}:`, error);
      return false;
    }
  }

  /**
   * Get a process by PID
   */
  get(pid: number): ManagedProcess | undefined {
    return this.processes.get(pid);
  }

  /**
   * Get all processes
   */
  getAll(): ManagedProcess[] {
    return Array.from(this.processes.values());
  }

  /**
   * Get processes by type
   */
  getByType(type: ProcessType): ManagedProcess[] {
    return this.getAll().filter((p) => p.type === type);
  }

  /**
   * Get active (non-idle) processes
   */
  getActive(): ManagedProcess[] {
    return this.getAll().filter((p) => p.scriptPath);
  }

  /**
   * Get process count
   */
  getCount(): number {
    return this.processes.size;
  }

  /**
   * Bind prompt info to a process
   */
  bindPromptInfo(pid: number, promptInfo: ProcessAndPromptInfo): void {
    const managed = this.processes.get(pid);
    if (managed) {
      managed.promptInfo = promptInfo;
    }
  }

  /**
   * Register a window operation (for state machine coordination)
   */
  registerWindowOperation(pid: number, windowId: number, operation: string): boolean {
    const managed = this.processes.get(pid);
    if (!managed) {
      return false;
    }

    const result = managed.state.transition({
      type: 'WINDOW_OP_START',
      windowId,
      operation,
    });

    return result.success;
  }

  /**
   * Complete a window operation
   */
  completeWindowOperation(pid: number, windowId: number): boolean {
    const managed = this.processes.get(pid);
    if (!managed) {
      return false;
    }

    const result = managed.state.transition({
      type: 'WINDOW_OP_END',
      windowId,
    });

    return result.success;
  }

  /**
   * Terminate all processes
   */
  async terminateAll(reason = 'shutdown'): Promise<number> {
    log.info(`ProcessManager: Terminating all ${this.processes.size} processes...`);

    const pids = Array.from(this.processes.keys());
    const results = await Promise.allSettled(pids.map((pid) => this.terminate(pid, reason)));

    const terminated = results.filter((r) => r.status === 'fulfilled' && r.value).length;
    log.info(`ProcessManager: Terminated ${terminated}/${pids.length} processes`);

    return terminated;
  }

  /**
   * Warm up the idle pool
   */
  async warmupPool(count?: number): Promise<void> {
    await this.pool.warmup(count);
  }

  /**
   * Shutdown the process manager
   */
  async shutdown(): Promise<void> {
    log.info('ProcessManager: Shutting down...');

    // Stop heartbeats
    this.heartbeats.stop();

    // Terminate all processes
    await this.terminateAll('shutdown');

    // Drain idle pool
    await this.pool.drain();

    // Clear all disposables
    this.disposables.disposeAll();

    log.info('ProcessManager: Shutdown complete');
  }

  /**
   * Find an idle prompt process (legacy mode)
   * Returns a process handle for an idle process
   */
  findIdleProcess(): ProcessHandle | null {
    if (this.isLegacyMode() && this.legacyProcesses) {
      const processInfo = this.legacyProcesses.findIdlePromptProcess();
      if (processInfo) {
        return {
          pid: processInfo.pid,
          child: processInfo.child,
          terminate: (reason?: string) => {
            this.legacyProcesses?.removeByPid(processInfo.pid, reason || 'findIdleProcess.terminate');
            return Promise.resolve(true);
          },
          send: (data: unknown) => {
            if (processInfo.child?.connected && !processInfo.child.killed) {
              try {
                processInfo.child.send(data);
                return true;
              } catch {
                return false;
              }
            }
            return false;
          },
        };
      }
    }
    return null;
  }

  /**
   * Get all process info (legacy mode - for backward compatibility)
   */
  getAllProcessInfo(): { type: ProcessType; scriptPath: string; pid: number }[] {
    if (this.isLegacyMode() && this.legacyProcesses) {
      return this.legacyProcesses.getAllProcessInfo();
    }
    return this.getAll().map((p) => ({
      type: p.type,
      scriptPath: p.scriptPath,
      pid: p.pid,
    }));
  }

  /**
   * Get active processes (legacy mode - for backward compatibility)
   */
  getActiveProcessInfo(): any[] {
    if (this.isLegacyMode() && this.legacyProcesses) {
      return this.legacyProcesses.getActiveProcesses();
    }
    return this.getActive();
  }

  /**
   * Get process by PID (legacy mode - for backward compatibility)
   */
  getProcessByPid(pid: number): any {
    if (this.isLegacyMode() && this.legacyProcesses) {
      return this.legacyProcesses.getByPid(pid);
    }
    return this.get(pid);
  }

  /**
   * Remove process by PID (legacy mode - for backward compatibility)
   */
  removeByPid(pid: number, reason = 'ProcessManager.removeByPid'): void {
    if (this.isLegacyMode() && this.legacyProcesses) {
      this.legacyProcesses.removeByPid(pid, reason);
    } else {
      this.terminate(pid, reason);
    }
    this.processes.delete(pid);
  }

  /**
   * Get debug info
   */
  getDebugInfo(): Record<string, unknown> {
    const processes: Record<string, unknown>[] = [];

    for (const [pid, managed] of this.processes) {
      processes.push({
        pid,
        type: managed.type,
        scriptPath: managed.scriptPath,
        state: managed.state.getState(),
        age: Date.now() - managed.startTime,
        connected: managed.child.connected,
        killed: managed.child.killed,
        pendingWindowOps: managed.state.getPendingWindowOps().size,
      });
    }

    return {
      config: this.config,
      mode: this.isLegacyMode() ? 'legacy' : 'standalone',
      legacyProcessesSet: this.legacyProcesses !== null,
      processCount: this.processes.size,
      processes,
      pool: this.pool.getDebugInfo(),
      heartbeats: this.heartbeats.getDebugInfo(),
      router: this.router.getDebugInfo(),
      disposables: this.disposables.getDebugInfo(),
    };
  }
}

// Export singleton for shared use
export const processManager = new ProcessManager();
