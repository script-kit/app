import { promises as fs } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import express from 'express';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('node:fs/promises');
vi.mock('express');
vi.mock('./logs', () => ({
  errorLog: { error: vi.fn() },
  log: vi.fn(),
  mainLog: { info: vi.fn() },
}));
vi.mock('./handleScript', () => ({
  handleScript: vi.fn(),
}));
vi.mock('@johnlindquist/kit/core/utils', () => ({
  kitPath: vi.fn((subpath?: string) => (subpath ? `/mock/kit/path/${subpath}` : '/mock/kit/path')),
}));
vi.mock('./install', () => ({
  tmpCleanupName: 'mock-cleanup-name',
}));
vi.mock('bonjour-service', () => ({
  default: vi.fn().mockImplementation(() => ({
    publish: vi.fn(),
    unpublishAll: vi.fn(),
  })),
}));

import { handleScript } from './handleScript';
// Import after mocks
import { expressApp, startServer, stopServer } from './server';

describe('HTTP Server', () => {
  let mockApp: any;
  let mockServer: any;
  let mockBonjour: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock express app
    mockApp = {
      use: vi.fn().mockReturnThis(),
      get: vi.fn().mockReturnThis(),
      post: vi.fn().mockReturnThis(),
      listen: vi.fn().mockImplementation((_port, cb) => {
        process.nextTick(cb);
        return mockServer;
      }),
    };

    // Mock server
    mockServer = {
      close: vi.fn().mockImplementation((cb) => cb?.()),
      on: vi.fn(),
    };

    // Mock express factory
    vi.mocked(express).mockReturnValue(mockApp);
    vi.mocked(express.json).mockReturnValue(vi.fn());
    vi.mocked(express.text).mockReturnValue(vi.fn());

    // Mock Bonjour
    const Bonjour = require('bonjour-service').default;
    mockBonjour = {
      publish: vi.fn(),
      unpublishAll: vi.fn(),
    };
    vi.mocked(Bonjour).mockReturnValue(mockBonjour);
  });

  describe('startServer', () => {
    it('should start HTTP server on specified port', async () => {
      const port = 8080;
      await startServer(port);

      expect(mockApp.listen).toHaveBeenCalledWith(port, expect.any(Function));
      expect(mockBonjour.publish).toHaveBeenCalledWith({
        name: 'Kit API',
        port,
        type: 'http',
        host: os.hostname(),
      });
    });

    it('should start HTTPS server when certificates exist', async () => {
      const port = 8443;
      vi.mocked(fs.readFile).mockResolvedValueOnce('mock-key');
      vi.mocked(fs.readFile).mockResolvedValueOnce('mock-cert');

      // Mock https.createServer
      const mockHttpsServer = {
        listen: vi.fn().mockImplementation((_p, cb) => {
          process.nextTick(cb);
          return mockHttpsServer;
        }),
        on: vi.fn(),
        close: vi.fn(),
      };
      vi.spyOn(https, 'createServer').mockReturnValue(mockHttpsServer as any);

      await startServer(port);

      expect(fs.readFile).toHaveBeenCalledWith('/mock/kit/path/key.pem');
      expect(fs.readFile).toHaveBeenCalledWith('/mock/kit/path/cert.pem');
      expect(https.createServer).toHaveBeenCalledWith({ key: 'mock-key', cert: 'mock-cert' }, mockApp);
      expect(mockHttpsServer.listen).toHaveBeenCalledWith(port, expect.any(Function));
    });

    it('should fall back to HTTP when certificates not found', async () => {
      const port = 8443;
      vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'));

      await startServer(port);

      expect(mockApp.listen).toHaveBeenCalledWith(port, expect.any(Function));
    });

    it('should register route handlers', async () => {
      await startServer(8080);

      // Verify routes are registered
      expect(mockApp.get).toHaveBeenCalledWith('/', expect.any(Function));
      expect(mockApp.post).toHaveBeenCalledWith('/', expect.any(Function));
      expect(mockApp.get).toHaveBeenCalledWith('/:script', expect.any(Function));
      expect(mockApp.post).toHaveBeenCalledWith('/:script', expect.any(Function));
      expect(mockApp.get).toHaveBeenCalledWith('/:folder/:script', expect.any(Function));
      expect(mockApp.post).toHaveBeenCalledWith('/:folder/:script', expect.any(Function));
      expect(mockApp.get).toHaveBeenCalledWith('/:folder/:subfolder/:script', expect.any(Function));
      expect(mockApp.post).toHaveBeenCalledWith('/:folder/:subfolder/:script', expect.any(Function));
    });
  });

  describe('Route handlers', () => {
    let getHandler: any;
    let postHandler: any;
    let mockReq: any;
    let mockRes: any;

    beforeEach(async () => {
      await startServer(8080);

      // Get route handlers
      getHandler = mockApp.get.mock.calls.find((call: any) => call[0] === '/:script')[1];
      postHandler = mockApp.post.mock.calls.find((call: any) => call[0] === '/:script')[1];

      // Mock request and response
      mockReq = {
        params: { script: 'test-script' },
        query: {},
        body: {},
        headers: {},
      };

      mockRes = {
        json: vi.fn(),
        send: vi.fn(),
        header: vi.fn().mockReturnThis(),
        status: vi.fn().mockReturnThis(),
      };
    });

    it('should handle GET request with query parameters', async () => {
      mockReq.query = { arg1: 'value1', arg2: 'value2' };
      vi.mocked(handleScript).mockResolvedValue({ data: 'success' });

      await getHandler(mockReq, mockRes);

      expect(handleScript).toHaveBeenCalledWith({
        filePath: 'test-script',
        args: ['value1', 'value2'],
        key: undefined,
      });
      expect(mockRes.json).toHaveBeenCalledWith({ data: 'success' });
    });

    it('should handle POST request with body', async () => {
      mockReq.body = { args: ['arg1', 'arg2'] };
      mockReq.headers = { 'kit-api-key': 'test-key' };
      vi.mocked(handleScript).mockResolvedValue({ message: 'done' });

      await postHandler(mockReq, mockRes);

      expect(handleScript).toHaveBeenCalledWith({
        filePath: 'test-script',
        args: ['arg1', 'arg2'],
        key: 'test-key',
      });
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'done' });
    });

    it('should handle script response with custom headers', async () => {
      vi.mocked(handleScript).mockResolvedValue({
        headers: { 'X-Custom': 'value' },
        status: 201,
        body: 'Custom response',
      });

      await getHandler(mockReq, mockRes);

      expect(mockRes.header).toHaveBeenCalledWith('X-Custom', 'value');
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.send).toHaveBeenCalledWith('Custom response');
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Script failed');
      vi.mocked(handleScript).mockRejectedValue(error);

      await getHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Internal server error',
        message: 'Script failed',
      });
    });

    it('should handle timeout', async () => {
      vi.useFakeTimers();

      // Mock handleScript to never resolve
      vi.mocked(handleScript).mockImplementation(() => new Promise(() => {}));

      const promise = getHandler(mockReq, mockRes);

      // Fast forward past timeout
      await vi.advanceTimersByTimeAsync(10001);

      await promise;

      expect(mockRes.status).toHaveBeenCalledWith(504);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Script execution timed out',
      });

      vi.useRealTimers();
    });

    it('should handle nested folder paths', async () => {
      const nestedHandler = mockApp.get.mock.calls.find((call: any) => call[0] === '/:folder/:subfolder/:script')[1];

      mockReq.params = { folder: 'utils', subfolder: 'network', script: 'ping' };
      vi.mocked(handleScript).mockResolvedValue({ result: 'pong' });

      await nestedHandler(mockReq, mockRes);

      expect(handleScript).toHaveBeenCalledWith({
        filePath: 'utils/network/ping',
        args: [],
        key: undefined,
      });
    });
  });

  describe('stopServer', () => {
    it('should stop the server and unpublish Bonjour service', async () => {
      await startServer(8080);
      await stopServer();

      expect(mockServer.close).toHaveBeenCalled();
      expect(mockBonjour.unpublishAll).toHaveBeenCalled();
    });

    it('should handle stopServer when no server is running', async () => {
      await expect(stopServer()).resolves.not.toThrow();
    });
  });

  describe('CORS configuration', () => {
    it('should allow all origins', async () => {
      await startServer(8080);

      const corsMiddleware = mockApp.use.mock.calls.find((call: any) => call[0].toString().includes('cors'));

      expect(corsMiddleware).toBeDefined();
    });
  });
});
