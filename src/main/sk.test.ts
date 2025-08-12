import { EventEmitter } from 'node:events';
import { promises as fs } from 'node:fs';
import net from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('node:fs/promises', () => ({
  unlink: vi.fn(),
  chmod: vi.fn(),
}));
vi.mock('./logs', () => ({
  log: vi.fn(),
  errorLog: { error: vi.fn() },
  warn: vi.fn(),
}));
vi.mock('./handleScript', () => ({
  handleScript: vi.fn(),
}));
vi.mock('@johnlindquist/kit/core/utils', () => ({
  kitPath: vi.fn((subpath?: string) => (subpath ? `/mock/kit/path/${subpath}` : '/mock/kit/path')),
}));

import { handleScript } from './handleScript';
import { log, warn } from './logs';
// Import after mocks
import { startSK } from './sk';

describe('Unix Socket Server (sk.ts)', () => {
  let mockServer: any;
  let mockSocket: any;
  let serverPromise: Promise<void>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock socket
    mockSocket = new EventEmitter() as any;
    mockSocket.write = vi.fn();
    mockSocket.end = vi.fn();
    mockSocket.destroy = vi.fn();

    // Mock server
    mockServer = new EventEmitter() as any;
    mockServer.listen = vi.fn().mockImplementation((_path, cb) => {
      process.nextTick(cb);
      return mockServer;
    });
    mockServer.close = vi.fn().mockImplementation((cb) => {
      if (cb) {
        process.nextTick(cb);
      }
    });

    // Mock net.createServer
    vi.spyOn(net, 'createServer').mockReturnValue(mockServer);

    // fs operations are already mocked
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('startSK', () => {
    it.skip('should create socket server at kit.sock', async () => {
      serverPromise = startSK();

      // Wait for server to be created
      await new Promise((resolve) => process.nextTick(resolve));

      expect(net.createServer).toHaveBeenCalled();
      expect(mockServer.listen).toHaveBeenCalledWith('/mock/kit/path/kit.sock', expect.any(Function));
      expect(fs.chmod).toHaveBeenCalledWith('/mock/kit/path/kit.sock', 0o777);
    });

    it.skip('should handle socket file cleanup on error', async () => {
      // Mock listen to emit error
      mockServer.listen.mockImplementation((_path, _cb) => {
        process.nextTick(() => {
          mockServer.emit('error', { code: 'EADDRINUSE' });
        });
        return mockServer;
      });

      serverPromise = startSK();

      // Wait for error handling
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(fs.unlink).toHaveBeenCalledWith('/mock/kit/path/kit.sock');
      expect(warn).toHaveBeenCalledWith('Socket file already exists, removing and retrying...');
    });

    it.skip('should handle other errors', async () => {
      const error = new Error('Permission denied');
      mockServer.listen.mockImplementation(() => {
        process.nextTick(() => {
          mockServer.emit('error', error);
        });
        return mockServer;
      });

      serverPromise = startSK();

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(log).toHaveBeenCalledWith('Error starting socket server:', error);
    });
  });

  describe.skip('Socket communication', () => {
    beforeEach(async () => {
      serverPromise = startSK();
      await new Promise((resolve) => process.nextTick(resolve));

      // Get the connection handler
      const connectionHandler = (net.createServer as any).mock.calls[0][0];

      // Simulate connection
      connectionHandler(mockSocket);
    });

    it('should handle JSON request with script and args', async () => {
      const requestData = {
        script: 'test-script',
        args: ['arg1', 'arg2'],
        cwd: '/test/dir',
      };

      vi.mocked(handleScript).mockResolvedValue({ result: 'success' });

      // Simulate data
      mockSocket.emit('data', Buffer.from(JSON.stringify(requestData)));

      // Wait for async handling
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(handleScript).toHaveBeenCalledWith({
        filePath: 'test-script',
        args: ['arg1', 'arg2'],
        cwd: '/test/dir',
      });

      expect(mockSocket.write).toHaveBeenCalledWith(JSON.stringify({ result: 'success' }));
      expect(mockSocket.end).toHaveBeenCalled();
    });

    it('should handle GET-style request', async () => {
      vi.mocked(handleScript).mockResolvedValue({ status: 'ok' });

      // Simulate HTTP-like request
      mockSocket.emit('data', Buffer.from('GET /my-script?arg1=foo&arg2=bar HTTP/1.0\r\n\r\n'));

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(handleScript).toHaveBeenCalledWith({
        filePath: 'my-script',
        args: ['foo', 'bar'],
      });

      expect(mockSocket.write).toHaveBeenCalledWith(expect.stringContaining('HTTP/1.0 200 OK'));
      expect(mockSocket.write).toHaveBeenCalledWith(expect.stringContaining(JSON.stringify({ status: 'ok' })));
    });

    it('should handle script errors', async () => {
      const error = new Error('Script failed');
      vi.mocked(handleScript).mockRejectedValue(error);

      mockSocket.emit('data', Buffer.from(JSON.stringify({ script: 'failing-script' })));

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockSocket.write).toHaveBeenCalledWith(JSON.stringify({ error: 'Script failed' }));
      expect(mockSocket.end).toHaveBeenCalled();
    });

    it('should handle invalid JSON', async () => {
      mockSocket.emit('data', Buffer.from('invalid json {'));

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(handleScript).not.toHaveBeenCalled();
      expect(mockSocket.destroy).toHaveBeenCalled();
    });

    it('should handle socket errors', () => {
      const socketError = new Error('Socket error');

      mockSocket.emit('error', socketError);

      expect(log).toHaveBeenCalledWith('Socket error:', socketError);
    });

    it('should handle empty data', async () => {
      mockSocket.emit('data', Buffer.from(''));

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(handleScript).not.toHaveBeenCalled();
      expect(mockSocket.destroy).toHaveBeenCalled();
    });

    it('should parse query string arguments correctly', async () => {
      vi.mocked(handleScript).mockResolvedValue({ done: true });

      // Test with special characters in query
      mockSocket.emit('data', Buffer.from('GET /utils/encode?text=hello%20world&encode=true HTTP/1.0\r\n\r\n'));

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(handleScript).toHaveBeenCalledWith({
        filePath: 'utils/encode',
        args: ['hello world', 'true'],
      });
    });

    it('should handle scripts with no arguments', async () => {
      vi.mocked(handleScript).mockResolvedValue({ ran: true });

      mockSocket.emit('data', Buffer.from(JSON.stringify({ script: 'no-args-script' })));

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(handleScript).toHaveBeenCalledWith({
        filePath: 'no-args-script',
        args: [],
        cwd: undefined,
      });
    });
  });

  describe.skip('Server cleanup', () => {
    it('should close server on process exit signals', async () => {
      serverPromise = startSK();
      await new Promise((resolve) => process.nextTick(resolve));

      // Simulate SIGTERM
      process.emit('SIGTERM', 'SIGTERM');

      expect(mockServer.close).toHaveBeenCalled();
    });
  });
});
