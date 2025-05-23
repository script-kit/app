import * as os from 'node:os';
import * as path from 'node:path';
import { kitPnpmPath } from '@johnlindquist/kit/core/utils';
import { ptyPool } from './pty';
import { getCommandSeparator, getDefaultShell, getReturnCharacter, getShellArgs, getDefaultArgs } from './pty-utils';
import type { IPty } from 'node-pty';
import type { TermConfig } from '../shared/types';
import { termLog } from './logs';

// Constants
const DEFAULT_TIMEOUT_MS = 2000;
const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 30;
const TERM_TYPE = 'xterm-color';

// Types for better testability
interface PtyExitInfo {
  exitCode: number | undefined;
  signal?: number;
}

// Configuration builder for better organization
class InvokeConfigBuilder {
  private readonly shell: string;
  private readonly command: string;
  private readonly cwd: string;
  private readonly env: Record<string, string>;

  constructor(command: string, cwd: string = os.homedir()) {
    this.shell = getDefaultShell();
    this.command = this.buildFullCommand(command);
    this.cwd = cwd;
    this.env = this.buildEnvironment();
  }

  private buildFullCommand(command: string): string {
    const separator = getCommandSeparator(this.shell);
    const returnCharacter = getReturnCharacter();
    return `${command} ${separator} exit${returnCharacter}`;
  }

  private buildEnvironment(): Record<string, string> {
    const env: Record<string, string> = {
      ...process.env,
      PNPM_HOME: kitPnpmPath(),
      TERM: TERM_TYPE,
      FORCE_COLOR: '1',
      DISABLE_AUTO_UPDATE: 'true',
    };

    if (env?.PNPM_HOME && env?.PATH) {
      env.PATH = `${env.PNPM_HOME}${path.delimiter}${env.PATH}`;
    }

    return env;
  }

  getPtyOptions() {
    return {
      name: TERM_TYPE,
      cols: DEFAULT_COLS,
      rows: DEFAULT_ROWS,
      cwd: this.cwd,
      env: this.env,
      command: this.command, // Add the command to options so PTY pool can handle it
    };
  }

  getTermConfig(): TermConfig {
    // Simplified config to match original invoke behavior
    return {
      command: this.command,
      pid: Date.now(),
    } as TermConfig;
  }

  getShellArgs(): string[] {
    // For invoke operations, we need to use the same args as the idle PTY
    // to enable PTY pool reuse. The idle PTY uses getDefaultArgs(true)
    return getDefaultArgs(true);
  }

  getShell(): string {
    return this.shell;
  }

  getCommand(): string {
    return this.command;
  }
}

// Error formatter for consistent error messages
class InvokeError extends Error {
  constructor(command: string, exitCode: number | undefined, output: string) {
    const message = `
Scriptlet Failed with exit code ${exitCode}

Attempted to run:
~~~
${command}
~~~

Error output:
~~~
${output}
~~~
    `.trim();

    super(message);
    this.name = 'InvokeError';
  }
}

// Output collector for managing command output
class OutputCollector {
  private output = '';

  append(data: string | Buffer): void {
    this.output += data.toString();
  }

  getCleanedOutput(): string {
    return this.output.trim();
  }
}

// PTY executor encapsulates the execution logic
class PtyExecutor {
  private ptyProcess: IPty | null = null;
  private exitTimeout: NodeJS.Timeout | null = null;
  private outputCollector = new OutputCollector();

  constructor(
    private config: InvokeConfigBuilder,
    private timeout: number = DEFAULT_TIMEOUT_MS,
  ) {}

  async execute(): Promise<string> {
    const startTime = Date.now();
    termLog.info(`🔧 [invoke-pty] Starting execution for command: ${this.config.getCommand()}`);

    return new Promise((resolve, reject) => {
      this.setupPty();
      this.setupHandlers(resolve, reject, startTime);
    });
  }

  private setupPty(): void {
    const ptySetupStart = Date.now();
    const shellArgs = this.config.getShellArgs();
    const fullCommand = this.config.getCommand();

    termLog.info(`🔧 [invoke-pty] Setting up PTY with shell: ${this.config.getShell()}`);
    termLog.info(`🔧 [invoke-pty] Shell args: ${JSON.stringify(shellArgs)}`);
    termLog.info(`🔧 [invoke-pty] Full command: ${fullCommand}`);

    // Pass shell args without the command to match idle PTY expectations
    this.ptyProcess = ptyPool.getIdlePty(
      this.config.getShell(),
      shellArgs, // Don't include command in args
      this.config.getPtyOptions(),
      this.config.getTermConfig(),
    );

    const ptySetupTime = Date.now() - ptySetupStart;
    termLog.info(`🔧 [invoke-pty] PTY setup took ${ptySetupTime}ms, got PTY with PID: ${this.ptyProcess?.pid}`);

    // Check if this is an idle PTY that was reused
    const bufferedData = (this.ptyProcess as any)?.bufferedData;
    if (bufferedData && bufferedData.length > 0) {
      termLog.info(`🔧 [invoke-pty] ✅ Reusing idle PTY with ${bufferedData.length} buffered data chunks`);
    } else {
      termLog.info(`🔧 [invoke-pty] ❌ Created new PTY (no buffered data)`);
    }
  }

  private setupHandlers(resolve: (value: string) => void, reject: (reason: Error) => void, startTime: number): void {
    if (!this.ptyProcess) {
      reject(new Error('Failed to create PTY process'));
      return;
    }

    const handlerSetupTime = Date.now() - startTime;
    termLog.info(`🔧 [invoke-pty] Handler setup after ${handlerSetupTime}ms from start`);

    // Data handler
    this.ptyProcess.onData((data) => this.handleData(data));

    // Exit handler
    this.ptyProcess.onExit((exitInfo) => this.handleExit(exitInfo, resolve, reject, startTime));

    // Timeout handler
    this.exitTimeout = setTimeout(() => this.handleTimeout(reject), this.timeout);
  }

  private handleData(data: string | Buffer): void {
    this.outputCollector.append(data);
  }

  private handleExit(
    exitInfo: PtyExitInfo,
    resolve: (value: string) => void,
    reject: (reason: Error) => void,
    startTime: number,
  ): void {
    const totalTime = Date.now() - startTime;
    termLog.info(`🔧 [invoke-pty] Command completed in ${totalTime}ms with exit code: ${exitInfo.exitCode}`);

    this.cleanup();
    const output = this.outputCollector.getCleanedOutput();

    if (exitInfo.exitCode !== 0) {
      termLog.info(`🔧 [invoke-pty] Command failed with output: ${output.substring(0, 200)}...`);
      reject(new InvokeError(this.config.getCommand(), exitInfo.exitCode, output));
    } else {
      termLog.info(`🔧 [invoke-pty] Command succeeded with output length: ${output.length} chars`);
      resolve(output);
    }
  }

  private handleTimeout(reject: (reason: Error) => void): void {
    this.cleanup();
    reject(new Error('Command timed out'));
  }

  private cleanup(): void {
    if (this.exitTimeout) {
      clearTimeout(this.exitTimeout);
      this.exitTimeout = null;
    }

    if (this.ptyProcess) {
      try {
        this.ptyProcess.kill();
      } catch (error) {
        // Ignore errors when killing process (it might already be dead)
      }
      this.ptyProcess = null;
    }
  }
}

// Main invoke function - now much simpler and cleaner
export async function invoke(command: string, cwd = os.homedir()): Promise<string> {
  const config = new InvokeConfigBuilder(command, cwd);
  const executor = new PtyExecutor(config, DEFAULT_TIMEOUT_MS);
  return executor.execute();
}

// Export for testing purposes
export { InvokeConfigBuilder, InvokeError, OutputCollector, PtyExecutor };
