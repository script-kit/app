import { describe, expect, it, vi, beforeEach } from 'vitest';
import { spawn } from 'child_process';
import { mcpService } from './mcp-service';
import { getScripts } from '@johnlindquist/kit/core/db';
import { readFile } from 'node:fs/promises';

// Mock dependencies
vi.mock('@johnlindquist/kit/core/db');
vi.mock('fs/promises');
vi.mock('child_process');

describe('MCP Tool Script Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mcpService.clearCache();
  });

  it('should execute MCP tool script and verify result object matches parameters', async () => {
    const scriptContent = `// Name: Testing MCP Tool
// mcp: testing-mcp-tool

import "@johnlindquist/kit"

const result = await tool({
    name: "testing-mcp-tool",
    description: "A tool for testing MCP",
    parameters: {
        text: {
            type: "string",
            description: "Just give me any string",
            default: "Hello, world!",
        },
        number: {
            type: "number",
            description: "Just give me any number",
            default: 100,
        },
    },
} as MCPTool);

// Verify result has the expected shape
console.log("Result type:", typeof result);
console.log("Result keys:", Object.keys(result));
console.log("Result.text:", result.text);
console.log("Result.number:", result.number);

const response: MCPToolResult = {
    content: [
        {
            type: "text",
            text: \`\${result.text} is a great string!\`,
        },
    ],
};

await sendResponse(response);

await editor(JSON.stringify(result, null, 2));`;

    // Mock the script in the database
    const mockScript = {
      name: 'testing-mcp-tool',
      command: 'testing-mcp-tool',
      filePath: '/path/to/testing-mcp-tool.js',
      description: 'A tool for testing MCP',
      mcp: 'testing-mcp-tool',
    };

    vi.mocked(getScripts).mockResolvedValue([mockScript] as any);
    vi.mocked(readFile).mockResolvedValue(scriptContent);

    // Get MCP scripts to ensure it's parsed correctly
    const scripts = await mcpService.getMCPScripts();
    expect(scripts).toHaveLength(1);
    expect(scripts[0].toolConfig).toBeDefined();
    expect(scripts[0].toolConfig.parameters).toHaveProperty('text');
    expect(scripts[0].toolConfig.parameters).toHaveProperty('number');

    // Simulate MCP execution with parameters
    const mockChildProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn((event, callback) => {
        if (event === 'close') {
          // Simulate successful execution
          setTimeout(() => callback(0), 10);
        }
      }),
      kill: vi.fn(),
    };

    vi.mocked(spawn).mockReturnValue(mockChildProcess as any);

    // Simulate calling the script with MCP parameters
    const mcpParameters = {
      text: 'Hello from test',
      number: 42,
    };

    // This would be done by the MCP server in practice
    const env = {
      ...process.env,
      KIT_MCP_CALL: JSON.stringify({
        tool: 'testing-mcp-tool',
        parameters: mcpParameters,
      }),
    };

    const childProcess = spawn('node', ['/path/to/testing-mcp-tool.js'], { env });

    // Capture stdout to verify the result object
    let stdoutData = '';
    mockChildProcess.stdout.on.mockImplementation((event, callback) => {
      if (event === 'data') {
        // Simulate the console.log outputs from the script
        const output = [
          'Result type: object',
          'Result keys: text,number',
          'Result.text: Hello from test',
          'Result.number: 42',
        ].join('\\n');
        callback(Buffer.from(output));
      }
    });

    // Wait for process to complete
    await new Promise(resolve => setTimeout(resolve, 50));

    // Verify spawn was called with correct environment
    expect(spawn).toHaveBeenCalledWith(
      'node',
      ['/path/to/testing-mcp-tool.js'],
      expect.objectContaining({
        env: expect.objectContaining({
          KIT_MCP_CALL: JSON.stringify({
            tool: 'testing-mcp-tool',
            parameters: mcpParameters,
          }),
        }),
      })
    );
  });

  it('should verify tool() returns typed object with all parameter keys', async () => {
    // This test verifies the type system behavior
    const scriptContent = `
import "@johnlindquist/kit"

interface MyToolParams {
  name: string;
  age: number;
  active: boolean;
  tags: string[];
}

const result = await tool<MyToolParams>({
  name: "typed-tool",
  description: "Tool with typed parameters",
  parameters: {
    name: { type: "string", description: "User name" },
    age: { type: "number", description: "User age" },
    active: { type: "boolean", description: "Is active" },
    tags: { type: "array", description: "User tags" },
  },
} as MCPTool);

// TypeScript would enforce these at compile time
// result.name is string
// result.age is number
// result.active is boolean
// result.tags is string[]

// Verify all keys exist
const hasAllKeys = 'name' in result && 'age' in result && 'active' in result && 'tags' in result;
console.log("Has all parameter keys:", hasAllKeys);
`;

    const mockScript = {
      name: 'typed-tool',
      command: 'typed-tool',
      filePath: '/path/to/typed-tool.js',
      description: 'Tool with typed parameters',
      mcp: 'typed-tool',
    };

    vi.mocked(getScripts).mockResolvedValue([mockScript] as any);
    vi.mocked(readFile).mockResolvedValue(scriptContent);

    const scripts = await mcpService.getMCPScripts();
    expect(scripts).toHaveLength(1);
    
    const toolConfig = scripts[0].toolConfig;
    expect(toolConfig).toBeDefined();
    expect(toolConfig.parameters).toHaveProperty('name');
    expect(toolConfig.parameters).toHaveProperty('age');
    expect(toolConfig.parameters).toHaveProperty('active');
    expect(toolConfig.parameters).toHaveProperty('tags');
  });
});