/**
 * Shared types for the process management system
 */

import type { ChildProcess } from 'node:child_process';
import type { Channel, ProcessType } from '@johnlindquist/kit/core/enum';
import type { KitPrompt } from '../prompt';

/**
 * Disposable interface for cleanup tracking
 */
export interface Disposable {
  dispose(): void;
}

/**
 * Process metrics from pidusage
 */
export interface ProcessMetrics {
  cpu: number;
  memory: number;
  elapsed: number;
  timestamp: number;
}

/**
 * Metadata tracked for each process
 */
export interface ProcessMetadata {
  pid: number;
  scriptPath: string;
  type: ProcessType;
  startTime: number;
  lastHeartbeat?: number;
}

/**
 * Handle returned when spawning a process
 */
export interface ProcessHandle {
  pid: number;
  child: ChildProcess;
  terminate: (reason?: string) => Promise<void>;
  send: (data: unknown) => void;
}

/**
 * Options for spawning a process
 */
export interface SpawnOptions {
  scriptPath?: string;
  args?: string[];
  port?: number;
  cwd?: string;
}

/**
 * Pool statistics
 */
export interface PoolStats {
  available: number;
  total: number;
  maxSize: number;
}

/**
 * Health report from monitoring
 */
export interface HealthReport {
  processCount: number;
  metrics: Map<number, ProcessMetrics>;
  orphans: number[];
  timestamp: number;
}

/**
 * Extended process info with prompt binding
 */
export interface ProcessAndPromptInfo {
  pid: number;
  child: ChildProcess;
  type: ProcessType;
  scriptPath: string;
  values: unknown[];
  date: number;
  prompt: KitPrompt;
  promptId?: string;
  launchedFromMain: boolean;
  preventChannels?: Set<Channel>;
  runId?: string;
  runStartedAt?: number;
}

/**
 * Message handler signature
 */
export type MessageHandler = (data: unknown) => void | Promise<void>;

/**
 * IPC message structure
 */
export interface IPCMessage {
  channel: Channel;
  value?: unknown;
  kitScript?: string;
  promptId?: string;
  pid?: number;
}
