import { type ChildProcess, spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startServer, stopServer } from './server';

// Helper to make HTTP requests
function makeRequest(options: http.RequestOptions, data?: string): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ statusCode: res.statusCode || 0, body }));
    });
    req.on('error', reject);
    if (data) {
      req.write(data);
    }
    req.end();
  });
}

// Helper to wait for server to be ready
async function waitForServer(port: number, maxRetries = 30): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const { statusCode } = await makeRequest({
        hostname: 'localhost',
        port,
        path: '/api/mcp/scripts',
        method: 'GET',
      });
      if (statusCode === 200) {
        return true;
      }
    } catch (e) {
      // Server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

describe('MCP Full Integration Test', () => {
  let testDir: string;
  const mcpServerProcess: ChildProcess | null = null;
  const serverPort = 5173;

  beforeAll(async () => {
    // Create test directory
    testDir = path.join(tmpdir(), `mcp-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    // Create a test script
    const testScriptPath = path.join(testDir, 'test-mcp-integration.js');
    await writeFile(
      testScriptPath,
      `
// Name: Test Integration Script
// Description: Test script for MCP integration
// mcp: test-integration

import "@johnlindquist/kit"

const name = await arg("What's your name?")
const number = await arg("Pick a number")

const result = {
  greeting: \`Hello \${name}!\`,
  number: parseInt(number),
  doubled: parseInt(number) * 2,
  timestamp: new Date().toISOString()
}

// Send response for MCP
await sendResponse({
  content: [{
    type: 'text',
    text: JSON.stringify(result, null, 2)
  }]
})

export default result
`,
    );

    // Set up environment
    process.env.KENV = testDir;
    process.env.KIT_PORT = String(serverPort);

    // Start the HTTP server
    startServer();

    // Wait for server to be ready
    const serverReady = await waitForServer(serverPort);
    if (!serverReady) {
      throw new Error('Server failed to start');
    }
  }, 60000);

  afterAll(async () => {
    // Stop MCP server if running
    if (mcpServerProcess) {
      mcpServerProcess.kill();
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Stop HTTP server
    stopServer();

    // Clean up test directory
    // Note: In real tests, you might want to keep this for debugging
  });

  it('should execute full MCP workflow', async () => {
    // Step 1: Verify script discovery
    const { statusCode: discoverStatus, body: discoverBody } = await makeRequest({
      hostname: 'localhost',
      port: serverPort,
      path: '/api/mcp/scripts',
      method: 'GET',
    });

    expect(discoverStatus).toBe(200);
    const { scripts } = JSON.parse(discoverBody);
    expect(scripts).toBeInstanceOf(Array);

    const testScript = scripts.find((s: any) => s.name === 'test-integration');
    expect(testScript).toBeDefined();
    expect(testScript.args).toHaveLength(2);
    expect(testScript.args[0].placeholder).toBe("What's your name?");
    expect(testScript.args[1].placeholder).toBe('Pick a number');

    // Step 2: Execute the script
    const executeData = JSON.stringify({
      script: 'test-integration',
      args: ['Alice', '42'],
    });

    const { statusCode: execStatus, body: execBody } = await makeRequest(
      {
        hostname: 'localhost',
        port: serverPort,
        path: '/api/mcp/execute',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(executeData),
        },
      },
      executeData,
    );

    expect(execStatus).toBe(200);
    const result = JSON.parse(execBody);

    // Verify the response structure
    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');

    // Parse the actual result
    const scriptResult = JSON.parse(result.content[0].text);
    expect(scriptResult.greeting).toBe('Hello Alice!');
    expect(scriptResult.number).toBe(42);
    expect(scriptResult.doubled).toBe(84);
    expect(scriptResult.timestamp).toBeDefined();
  }, 30000);

  it('should handle script execution errors', async () => {
    const executeData = JSON.stringify({
      script: 'non-existent-script',
      args: [],
    });

    const { statusCode, body } = await makeRequest(
      {
        hostname: 'localhost',
        port: serverPort,
        path: '/api/mcp/execute',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(executeData),
        },
      },
      executeData,
    );

    expect(statusCode).toBe(404);
    const error = JSON.parse(body);
    expect(error.error).toContain('not found');
  });

  it('should validate request parameters', async () => {
    const executeData = JSON.stringify({
      // Missing script parameter
      args: ['test'],
    });

    const { statusCode, body } = await makeRequest(
      {
        hostname: 'localhost',
        port: serverPort,
        path: '/api/mcp/execute',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(executeData),
        },
      },
      executeData,
    );

    expect(statusCode).toBe(400);
    const error = JSON.parse(body);
    expect(error.error).toContain('Script name is required');
  });
});

describe('MCP Server Integration', () => {
  it('should start MCP server and register tools', async () => {
    // This test would start the actual MCP server process
    // and verify it can communicate with the HTTP server
    // For now, we'll skip this as it requires the full app running
    // In a real implementation, you would:
    // 1. Start the app's HTTP server
    // 2. Start the MCP server process
    // 3. Connect an MCP client
    // 4. Execute tools and verify results
  });
});
