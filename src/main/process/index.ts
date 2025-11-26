/**
 * Process Management Module
 *
 * Centralized process lifecycle management with:
 * - State machine for lifecycle transitions
 * - Disposable registry for cleanup
 * - Idle process pool for fast startup
 * - Heartbeat monitoring
 * - IPC message routing
 *
 * Usage:
 * ```typescript
 * import { processManager, ProcessState } from './process';
 *
 * // Spawn a process
 * const handle = processManager.spawn(ProcessType.Prompt, { scriptPath: 'my-script.ts' });
 *
 * // Send message
 * handle.send({ channel: Channel.SET_VALUE, value: 'hello' });
 *
 * // Terminate
 * await handle.terminate('user requested');
 * ```
 */

// Core services
export { DisposableRegistry, disposableRegistry } from './disposable-registry';
export type { HeartbeatConfig } from './heartbeat-manager';
export { HeartbeatManager, heartbeatManager } from './heartbeat-manager';
export type { IdlePoolConfig } from './idle-pool';

// Extracted services
export { IdleProcessPool, idleProcessPool } from './idle-pool';
export type { MessageMiddleware } from './ipc-router';
export { IPCMessageRouter, ipcRouter } from './ipc-router';
export type { ProcessManagerConfig } from './process-manager';
// Main orchestrator
export { ProcessManager, processManager } from './process-manager';
export type { ProcessEvent, StateChangeCallback, TransitionResult } from './process-state';
export { ProcessState, ProcessStateMachine } from './process-state';
// Types
export * from './types';
