import { beforeEach, describe, expect, it, vi } from 'vitest';
import { processWindowCoordinator, WindowOperation } from './process-window-coordinator';

describe('ProcessWindowCoordinator', () => {
  beforeEach(() => {
    // Clear any existing operations
    processWindowCoordinator.pendingOperations.clear();
    processWindowCoordinator.operationCounter = 0;
  });

  describe('registerOperation', () => {
    it('should register a window operation and return an operation ID', () => {
      const pid = 12345;
      const windowId = 100;

      const opId = processWindowCoordinator.registerOperation(pid, WindowOperation.Focus, windowId);

      expect(opId).toMatch(/^12345-100-focus-\d+$/);
      expect(processWindowCoordinator.getPendingOperations(pid)).toHaveLength(1);
    });

    it('should handle multiple operations for the same process', () => {
      const pid = 12345;

      const focusOpId = processWindowCoordinator.registerOperation(pid, WindowOperation.Focus, 100);
      const blurOpId = processWindowCoordinator.registerOperation(pid, WindowOperation.Blur, 100);

      expect(focusOpId).not.toBe(blurOpId);
      expect(processWindowCoordinator.getPendingOperations(pid)).toHaveLength(2);
    });
  });

  describe('completeOperation', () => {
    it('should mark an operation as completed and remove it', () => {
      const pid = 12345;
      const opId = processWindowCoordinator.registerOperation(pid, WindowOperation.Focus, 100);

      processWindowCoordinator.completeOperation(opId);

      expect(processWindowCoordinator.getPendingOperations(pid)).toHaveLength(0);
    });

    it('should handle completing non-existent operations gracefully', () => {
      expect(() => {
        processWindowCoordinator.completeOperation('non-existent-op');
      }).not.toThrow();
    });
  });

  describe('canCleanupProcess', () => {
    it('should allow cleanup when no operations are pending', () => {
      const pid = 12345;

      expect(processWindowCoordinator.canCleanupProcess(pid)).toBe(true);
    });

    it('should prevent cleanup when critical operations are pending', () => {
      const pid = 12345;

      processWindowCoordinator.registerOperation(pid, WindowOperation.Focus, 100);

      expect(processWindowCoordinator.canCleanupProcess(pid)).toBe(false);
    });

    it('should allow cleanup when only non-critical operations are pending', () => {
      const pid = 12345;

      const blurOpId = processWindowCoordinator.registerOperation(pid, WindowOperation.Blur, 100);
      processWindowCoordinator.completeOperation(blurOpId);

      const hideOpId = processWindowCoordinator.registerOperation(pid, WindowOperation.Hide, 100);

      expect(processWindowCoordinator.canCleanupProcess(pid)).toBe(true);
    });

    it('should prevent cleanup during window creation', () => {
      const pid = 12345;

      processWindowCoordinator.registerOperation(pid, WindowOperation.Create, 100);

      expect(processWindowCoordinator.canCleanupProcess(pid)).toBe(false);
    });
  });

  describe('forceCleanupProcess', () => {
    it('should remove all operations for a process', () => {
      const pid = 12345;

      processWindowCoordinator.registerOperation(pid, WindowOperation.Focus, 100);
      processWindowCoordinator.registerOperation(pid, WindowOperation.Blur, 100);
      processWindowCoordinator.registerOperation(pid, WindowOperation.Show, 100);

      processWindowCoordinator.forceCleanupProcess(pid);

      expect(processWindowCoordinator.getPendingOperations(pid)).toHaveLength(0);
    });
  });

  describe('cleanupStaleOperations', () => {
    it('should remove operations older than 30 seconds', () => {
      const pid = 12345;
      const opId = processWindowCoordinator.registerOperation(pid, WindowOperation.Focus, 100);

      // Manually set the timestamp to be old
      const operations = processWindowCoordinator.pendingOperations.get(pid);
      if (operations) {
        const op = operations.get(opId);
        if (op) {
          op.timestamp = Date.now() - 40000; // 40 seconds ago
        }
      }

      processWindowCoordinator.cleanupStaleOperations();

      expect(processWindowCoordinator.getPendingOperations(pid)).toHaveLength(0);
    });

    it('should keep recent operations', () => {
      const pid = 12345;
      processWindowCoordinator.registerOperation(pid, WindowOperation.Focus, 100);

      processWindowCoordinator.cleanupStaleOperations();

      expect(processWindowCoordinator.getPendingOperations(pid)).toHaveLength(1);
    });
  });

  describe('Race condition scenarios', () => {
    it('should handle rapid focus/blur transitions', () => {
      const pid = 12345;
      const windowId = 100;

      // Simulate rapid focus/blur
      const operations: string[] = [];

      for (let i = 0; i < 10; i++) {
        const focusOpId = processWindowCoordinator.registerOperation(pid, WindowOperation.Focus, windowId);
        operations.push(focusOpId);
        const blurOpId = processWindowCoordinator.registerOperation(pid, WindowOperation.Blur, windowId);
        operations.push(blurOpId);
      }

      // Process should not be cleanable while focus operations are pending
      expect(processWindowCoordinator.canCleanupProcess(pid)).toBe(false);

      // Complete all operations
      operations.forEach((opId) => processWindowCoordinator.completeOperation(opId));

      // Now process should be cleanable
      expect(processWindowCoordinator.canCleanupProcess(pid)).toBe(true);
    });

    it('should prevent cleanup during window creation even with other completed operations', () => {
      const pid = 12345;

      // Complete some operations
      const blurOpId = processWindowCoordinator.registerOperation(pid, WindowOperation.Blur, 100);
      processWindowCoordinator.completeOperation(blurOpId);

      // Start a critical operation
      processWindowCoordinator.registerOperation(pid, WindowOperation.Create, 101);

      // Should still prevent cleanup
      expect(processWindowCoordinator.canCleanupProcess(pid)).toBe(false);
    });
  });
});
