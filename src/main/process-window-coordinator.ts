import { processWindowCoordinatorLog as log } from './logs';

export enum WindowOperation {
  Focus = 'focus',
  Blur = 'blur',
  Show = 'show',
  Hide = 'hide',
  Close = 'close',
  Create = 'create',
  Destroy = 'destroy',
}

interface OperationInfo {
  operation: WindowOperation;
  windowId: number;
  timestamp: number;
  completed: boolean;
}

/**
 * Coordinates between process lifecycle and window operations to prevent
 * race conditions where processes are cleaned up while windows are still
 * performing operations.
 */
class ProcessWindowCoordinator {
  private pendingOperations = new Map<number, Map<string, OperationInfo>>();
  private operationCounter = 0;

  /**
   * Register a window operation for a process
   * @returns Operation ID that must be used to complete the operation
   */
  registerOperation(pid: number, operation: WindowOperation, windowId: number): string {
    const operationId = `${pid}-${windowId}-${operation}-${++this.operationCounter}`;

    if (!this.pendingOperations.has(pid)) {
      this.pendingOperations.set(pid, new Map());
    }

    const operationInfo: OperationInfo = {
      operation,
      windowId,
      timestamp: Date.now(),
      completed: false,
    };

    this.pendingOperations.get(pid)!.set(operationId, operationInfo);

    log.info(`🔄 Registered ${operation} operation for PID ${pid}, Window ${windowId}, ID: ${operationId}`);

    return operationId;
  }

  /**
   * Complete a window operation
   */
  completeOperation(operationId: string): void {
    const [pidStr] = operationId.split('-');
    const pid = parseInt(pidStr, 10);

    const operations = this.pendingOperations.get(pid);
    if (!operations) {
      log.warn(`⚠️ No operations found for PID ${pid} when completing ${operationId}`);
      return;
    }

    const operation = operations.get(operationId);
    if (!operation) {
      log.warn(`⚠️ Operation ${operationId} not found`);
      return;
    }

    operation.completed = true;
    operations.delete(operationId);

    // Clean up empty maps
    if (operations.size === 0) {
      this.pendingOperations.delete(pid);
    }

    log.info(`✅ Completed ${operation.operation} operation ${operationId}`);
  }

  /**
   * Check if a process can be safely cleaned up
   */
  canCleanupProcess(pid: number): boolean {
    const operations = this.pendingOperations.get(pid);

    if (!operations || operations.size === 0) {
      log.info(`✅ Process ${pid} has no pending operations, safe to cleanup`);
      return true;
    }

    // Check for any incomplete critical operations
    const criticalOps = [WindowOperation.Focus, WindowOperation.Create, WindowOperation.Show];
    const hasCriticalOps = Array.from(operations.values()).some(
      op => !op.completed && criticalOps.includes(op.operation)
    );

    if (hasCriticalOps) {
      log.warn(`❌ Process ${pid} has critical pending operations, cannot cleanup yet`);
      log.warn(`   Pending: ${Array.from(operations.values()).map(op => op.operation).join(', ')}`);
      return false;
    }

    log.info(`✅ Process ${pid} has only non-critical operations, safe to cleanup`);
    return true;
  }

  /**
   * Force cleanup of all operations for a process (use with caution)
   */
  forceCleanupProcess(pid: number): void {
    const operations = this.pendingOperations.get(pid);
    if (operations) {
      log.warn(`🧹 Force cleaning up ${operations.size} operations for PID ${pid}`);
      this.pendingOperations.delete(pid);
    }
  }

  /**
   * Get pending operations for a process (for debugging)
   */
  getPendingOperations(pid: number): OperationInfo[] {
    const operations = this.pendingOperations.get(pid);
    return operations ? Array.from(operations.values()) : [];
  }

  /**
   * Get all pending operations (for debugging)
   */
  getAllPendingOperations(): Map<number, OperationInfo[]> {
    const result = new Map<number, OperationInfo[]>();

    for (const [pid, operations] of this.pendingOperations) {
      result.set(pid, Array.from(operations.values()));
    }

    return result;
  }

  /**
   * Clean up stale operations (operations older than 30 seconds)
   */
  cleanupStaleOperations(): void {
    const now = Date.now();
    const staleThreshold = 30000; // 30 seconds

    for (const [pid, operations] of this.pendingOperations) {
      const staleOps = Array.from(operations.entries()).filter(
        ([_, op]) => now - op.timestamp > staleThreshold
      );

      for (const [opId, op] of staleOps) {
        log.warn(`🧹 Cleaning up stale operation ${opId} (${op.operation}) for PID ${pid}`);
        operations.delete(opId);
      }

      if (operations.size === 0) {
        this.pendingOperations.delete(pid);
      }
    }
  }
}

// Export singleton instance
export const processWindowCoordinator = new ProcessWindowCoordinator();

// Clean up stale operations periodically (every 60 seconds)
setInterval(() => {
  processWindowCoordinator.cleanupStaleOperations();
}, 60000);
