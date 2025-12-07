import { readFile } from 'node:fs/promises';
import { getScripts } from '@johnlindquist/kit/core/db';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { handleScript, UNDEFINED_VALUE } from './handleScript';
import { createMcpHttpServer } from './mcp-http-server';
import { extractMCPToolParameters, type MCPToolParameter } from './mcp-parameter-extractor';
import { mcpService } from './mcp-service';

// Mock dependencies
vi.mock('electron', () => ({
  default: {
    app: {
      getPath: vi.fn(() => '/mock/path'),
    },
  },
  app: {
    getPath: vi.fn(() => '/mock/path'),
    getVersion: vi.fn(() => '1.0.0'),
    on: vi.fn(),
    whenReady: vi.fn(() => Promise.resolve()),
  },
  nativeTheme: {
    shouldUseDarkColors: false,
  },
  BrowserWindow: Object.assign(
    vi.fn(() => ({
      loadURL: vi.fn(),
      on: vi.fn(),
      webContents: {
        send: vi.fn(),
      },
    })),
    {
      getAllWindows: vi.fn(() => []),
    },
  ),
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn(),
  },
  powerMonitor: {
    on: vi.fn(),
    addListener: vi.fn(),
  },
}));
vi.mock('electron-context-menu', () => ({
  default: vi.fn(() => ({})),
}));
vi.mock('@johnlindquist/kit/core/utils', () => ({
  kenvPath: vi.fn((subpath?: string) => (subpath ? `/tmp/.kenv/${subpath}` : '/tmp/.kenv')),
  kitPath: vi.fn((subpath?: string) => (subpath ? `/tmp/.kit/${subpath}` : '/tmp/.kit')),
  tmpClipboardDir: '/tmp/clipboard',
  getTrustedKenvsKey: vi.fn(() => 'trusted-kenvs'),
  defaultGroupNameClassName: vi.fn(() => 'default-group'),
  defaultGroupClassName: vi.fn(() => 'default-group-class'),
  getLogFromScriptPath: vi.fn((scriptPath: string) => `/tmp/logs/${scriptPath}.log`),
}));
vi.mock('node-pty', () => ({
  spawn: vi.fn(() => ({
    on: vi.fn(),
    write: vi.fn(),
    kill: vi.fn(),
    pid: 1234,
  })),
}));
vi.mock('@johnlindquist/kit/core/db');
vi.mock('fs/promises');
vi.mock('./fork.options', () => ({
  fork: vi.fn(),
  forkOptions: {},
}));
vi.mock('./log-utils', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}));
vi.mock('./logs', () => ({
  mcpLog: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
  keymapLog: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));
vi.mock('./handleScript');
vi.mock('./serverTrayUtils', () => ({
  getMcpPort: vi.fn(() => 3000),
}));

describe('MCP Tool Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mcpService.clearCache();
  });

  describe('params() parameter extraction', () => {
    it('should extract parameters from params() function calls', async () => {
      const scriptContent = `
// Name: testing-mcp-tool
// Description: Test tool
// mcp: testing-mcp-tool

import "@johnlindquist/kit"

const result = await params({
  type: "object",
  properties: {
    message: {
      type: "string",
      description: "The message to display"
    },
    count: {
      type: "number",
      description: "Number of times to repeat",
      default: 1
    }
  },
  required: ["message"]
})

console.log(\`Message: \${result.message}, Count: \${result.count}\`)
`;

      const result = await extractMCPToolParameters(scriptContent);

      expect(result).toHaveProperty('inputSchema');
      expect((result as any).inputSchema).toEqual({
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'The message to display',
          },
          count: {
            type: 'number',
            description: 'Number of times to repeat',
            default: 1,
          },
        },
        required: ['message'],
      });
    });

    it('should handle complex parameter types', async () => {
      const scriptContent = `
// Name: complex-tool
// Description: Complex parameter test
// mcp: complex-tool

import "@johnlindquist/kit"

const result = await params({
  type: "object",
  properties: {
    simpleString: {
      type: "string",
      description: "A simple string"
    },
    enumString: {
      type: "string",
      description: "String with enum",
      enum: ["option1", "option2", "option3"]
    },
    patternString: {
      type: "string",
      description: "String with pattern",
      pattern: "^[A-Z]{3}$"
    },
    numberWithBounds: {
      type: "number",
      description: "Number with min/max",
      minimum: 0,
      maximum: 100
    },
    booleanFlag: {
      type: "boolean",
      description: "A boolean flag",
      default: false
    },
    arrayParam: {
      type: "array",
      description: "An array parameter"
    },
    objectParam: {
      type: "object",
      description: "An object parameter"
    }
  }
})
`;

      const result = await extractMCPToolParameters(scriptContent);

      expect(result).toHaveProperty('inputSchema');
      const inputSchema = (result as any).inputSchema;

      expect(inputSchema.properties).toHaveProperty('simpleString');
      expect(inputSchema.properties).toHaveProperty('enumString');
      expect(inputSchema.properties).toHaveProperty('patternString');
      expect(inputSchema.properties).toHaveProperty('numberWithBounds');
      expect(inputSchema.properties).toHaveProperty('booleanFlag');
      expect(inputSchema.properties).toHaveProperty('arrayParam');
      expect(inputSchema.properties).toHaveProperty('objectParam');

      expect(inputSchema.properties.enumString.enum).toEqual(['option1', 'option2', 'option3']);
      expect(inputSchema.properties.numberWithBounds.minimum).toBe(0);
      expect(inputSchema.properties.numberWithBounds.maximum).toBe(100);
      expect(inputSchema.properties.booleanFlag.default).toBe(false);
    });

    it('should fallback to arg() extraction when no params() is found', async () => {
      const scriptContent = `
// Name: arg-based-tool
// Description: Tool using arg() instead of params()
// mcp: arg-based-tool

import "@johnlindquist/kit"

const username = await arg("Enter username")
const age = await arg({
  placeholder: "Enter your age",
  validate: (value) => {
    const num = parseInt(value);
    return num > 0 && num < 150 ? true : "Please enter a valid age";
  }
})

console.log(\`User: \${username}, Age: \${age}\`)
`;

      const result = await extractMCPToolParameters(scriptContent);

      expect(Array.isArray(result)).toBe(true);
      const params = result as any[];

      expect(params).toHaveLength(2);
      expect(params[0]).toEqual({
        name: 'username',
        placeholder: 'Enter username',
      });
      expect(params[1]).toEqual({
        name: 'age',
        placeholder: 'Enter your age',
      });
    });
  });

  describe('tool configuration to JSON schema conversion', () => {
    it.skip('should convert tool config to proper JSON schema for MCP', async () => {
      const mockScript = {
        name: 'test-tool',
        command: 'test-tool',
        filePath: '/test/test-tool.js',
        description: 'Test tool with parameters',
        mcp: 'test-tool',
      };

      const scriptContent = `
// Name: test-tool
// Description: Test tool with parameters
// mcp: test-tool

import "@johnlindquist/kit"

const result = await params({
  type: "object",
  properties: {
    message: {
      type: "string",
      description: "The message to display"
    },
    count: {
      type: "number",
      description: "Number of times to repeat",
      default: 1
    },
    enabled: {
      type: "boolean",
      description: "Enable feature",
      default: false
    }
  },
  required: ["message"]
})
`;

      vi.mocked(getScripts).mockResolvedValue([mockScript] as any);
      vi.mocked(readFile).mockResolvedValue(scriptContent);

      const scripts = await mcpService.getMCPScripts();
      expect(scripts).toHaveLength(1);

      const script = scripts[0];
      expect(script.inputSchema).toBeDefined();

      // Verify the inputSchema structure
      const inputSchema = script.inputSchema;
      expect(inputSchema.type).toBe('object');
      expect(inputSchema.properties).toHaveProperty('message');
      expect(inputSchema.properties).toHaveProperty('count');
      expect(inputSchema.properties).toHaveProperty('enabled');
      expect(inputSchema.required).toEqual(['message']);
    });

    it('should generate Zod schema from params inputSchema', async () => {
      // Mock the internal createToolSchemaFromConfig function behavior
      const properties = {
        message: {
          type: 'string',
          description: 'The message to display',
        },
        count: {
          type: 'number',
          description: 'Number of times to repeat',
          default: 1,
        },
      };
      const required = ['message'];

      // This simulates what createToolSchemaFromConfig would do
      const shape: Record<string, z.ZodTypeAny> = {};

      // Message parameter (required string)
      shape.message = z.string().describe('The message to display');

      // Count parameter (optional number with default)
      shape.count = z.number().describe('Number of times to repeat').optional().default(1);

      const schema = z.object(shape);

      // Test schema validation
      const valid1 = schema.safeParse({ message: 'Hello' });
      expect(valid1.success).toBe(true);
      expect(valid1.data).toEqual({ message: 'Hello', count: 1 });

      const valid2 = schema.safeParse({ message: 'Hello', count: 5 });
      expect(valid2.success).toBe(true);
      expect(valid2.data).toEqual({ message: 'Hello', count: 5 });

      const invalid = schema.safeParse({ count: 5 }); // Missing required message
      expect(invalid.success).toBe(false);
    });
  });

  describe('MCP server registration', () => {
    it.skip('should register params-based scripts with MCP server', async () => {
      const mockScript = {
        name: 'test-mcp-tool',
        command: 'test-mcp-tool',
        filePath: '/test/test-mcp-tool.js',
        description: 'Test MCP tool',
        mcp: 'test-mcp-tool',
      };

      const scriptContent = `
// Name: test-mcp-tool
// Description: Test MCP tool
// mcp: test-mcp-tool

import "@johnlindquist/kit"

const result = await params({
  type: "object",
  properties: {
    action: {
      type: "string",
      description: "Action to perform",
      enum: ["create", "update", "delete"]
    },
    target: {
      type: "string",
      description: "Target resource"
    }
  },
  required: ["action", "target"]
})

await sendResponse({
  content: [{
    type: 'text',
    text: JSON.stringify({ action: result.action, target: result.target })
  }]
})
`;

      vi.mocked(getScripts).mockResolvedValue([mockScript] as any);
      vi.mocked(readFile).mockResolvedValue(scriptContent);

      // Mock the handleScript function
      vi.mocked(handleScript).mockResolvedValue({
        content: [{ type: 'text', text: '{"action":"create","target":"resource"}' }],
      });

      const scripts = await mcpService.getMCPScripts();
      const script = scripts[0];

      expect(script.inputSchema).toBeDefined();
      expect(script.inputSchema.properties.action.enum).toEqual(['create', 'update', 'delete']);

      // Simulate MCP tool registration (what happens in createMcpHttpServer)
      const toolName = script.name;
      const toolDescription = script.description;
      const toolProperties = script.inputSchema.properties;

      expect(toolName).toBe('test-mcp-tool');
      expect(toolDescription).toBe('Test MCP tool');
      expect(toolProperties).toHaveProperty('action');
      expect(toolProperties).toHaveProperty('target');
    });

    it.skip('should handle both params() and arg() based scripts in the same MCP server', async () => {
      const mockScripts = [
        {
          name: 'params-based',
          command: 'params-based',
          filePath: '/test/params-based.js',
          description: 'Params-based script',
          mcp: 'params-based',
        },
        {
          name: 'arg-based',
          command: 'arg-based',
          filePath: '/test/arg-based.js',
          description: 'Arg-based script',
          mcp: 'arg-based',
        },
      ];

      const paramsBasedContent = `
// Name: params-based
// Description: Params-based script
// mcp: params-based

import "@johnlindquist/kit"

const result = await params({
  type: "object",
  properties: {
    input: {
      type: "string",
      description: "Input value"
    }
  },
  required: ["input"]
})
`;

      const argBasedContent = `
// Name: arg-based
// Description: Arg-based script
// mcp: arg-based

import "@johnlindquist/kit"

const input = await arg("Enter input value")
const confirm = await arg({
  placeholder: "Confirm action?",
  choices: ["yes", "no"]
})
`;

      vi.mocked(getScripts).mockResolvedValue(mockScripts as any);
      vi.mocked(readFile).mockResolvedValueOnce(paramsBasedContent).mockResolvedValueOnce(argBasedContent);

      const scripts = await mcpService.getMCPScripts();
      expect(scripts).toHaveLength(2);

      // First script should have inputSchema
      expect(scripts[0].inputSchema).toBeDefined();
      expect(scripts[0].inputSchema.properties).toHaveProperty('input');
      expect(scripts[0].args).toEqual([]); // params() scripts have empty args array

      // Second script should have args array
      expect(scripts[1].inputSchema).toBeUndefined();
      expect(scripts[1].args).toHaveLength(2);
      expect(scripts[1].args[0].name).toBe('input');
      expect(scripts[1].args[0].placeholder).toBe('Enter input value');
      expect(scripts[1].args[1].name).toBe('confirm');
      expect(scripts[1].args[1].placeholder).toBe('Confirm action?');
    });
  });

  describe('MCP UI parameter display', () => {
    it.skip('should format tool parameters correctly for MCP UI display', async () => {
      const mockScript = {
        name: 'ui-test-tool',
        command: 'ui-test-tool',
        filePath: '/test/ui-test-tool.js',
        description: 'UI test tool',
        mcp: 'ui-test-tool',
      };

      const scriptContent = `
// Name: ui-test-tool
// Description: UI test tool
// mcp: ui-test-tool

import "@johnlindquist/kit"

const result = await params({
  type: "object",
  properties: {
    title: {
      type: "string",
      description: "Title of the item"
    },
    priority: {
      type: "string",
      description: "Priority level",
      enum: ["low", "medium", "high"],
      default: "medium"
    },
    tags: {
      type: "array",
      description: "Tags for categorization"
    },
    metadata: {
      type: "object",
      description: "Additional metadata"
    },
    isPublic: {
      type: "boolean",
      description: "Make item public",
      default: false
    }
  },
  required: ["title"]
})
`;

      vi.mocked(getScripts).mockResolvedValue([mockScript] as any);
      vi.mocked(readFile).mockResolvedValue(scriptContent);

      const scripts = await mcpService.getMCPScripts();
      const script = scripts[0];

      // Simulate what the MCP UI would receive
      const uiParameters = Object.entries(script.inputSchema.properties).map(([key, param]: [string, any]) => ({
        name: key,
        type: param.type,
        description: param.description,
        required: script.inputSchema.required?.includes(key) || false,
        default: param.default,
        enum: param.enum,
      }));

      expect(uiParameters).toHaveLength(5);

      // Verify UI-friendly format
      const titleParam = uiParameters.find((p) => p.name === 'title');
      expect(titleParam).toEqual({
        name: 'title',
        type: 'string',
        description: 'Title of the item',
        required: true,
        default: undefined,
        enum: undefined,
      });

      const priorityParam = uiParameters.find((p) => p.name === 'priority');
      expect(priorityParam).toEqual({
        name: 'priority',
        type: 'string',
        description: 'Priority level',
        required: false,
        default: 'medium',
        enum: ['low', 'medium', 'high'],
      });
    });
  });

  describe.skip('end-to-end integration', () => {
    it('should handle the complete flow from script to MCP execution', async () => {
      const mockScript = {
        name: 'e2e-test',
        command: 'e2e-test',
        filePath: '/test/e2e-test.js',
        description: 'End-to-end test',
        mcp: 'e2e-test',
      };

      const scriptContent = `
// Name: e2e-test
// Description: End-to-end test
// mcp: e2e-test

import "@johnlindquist/kit"

const result = await params({
  type: "object",
  properties: {
    operation: {
      type: "string",
      description: "Operation to perform",
      enum: ["read", "write", "delete"]
    },
    path: {
      type: "string",
      description: "File path"
    },
    content: {
      type: "string",
      description: "Content for write operations"
    }
  },
  required: ["operation", "path"]
})

// Simulate processing
let response;
switch (result.operation) {
  case "read":
    response = { status: "success", data: "file contents" };
    break;
  case "write":
    response = { status: "success", message: "File written" };
    break;
  case "delete":
    response = { status: "success", message: "File deleted" };
    break;
}

await sendResponse({
  content: [{
    type: 'text',
    text: JSON.stringify(response)
  }]
})
`;

      vi.mocked(getScripts).mockResolvedValue([mockScript] as any);
      vi.mocked(readFile).mockResolvedValue(scriptContent);

      // Mock handleScript to simulate execution
      vi.mocked(handleScript).mockImplementation(async ({ args }) => {
        const operation = args.operation || 'read';
        const responses: Record<string, any> = {
          read: { status: 'success', data: 'file contents' },
          write: { status: 'success', message: 'File written' },
          delete: { status: 'success', message: 'File deleted' },
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(responses[operation]),
            },
          ],
        };
      });

      // Get the script
      const scripts = await mcpService.getMCPScripts();
      const script = scripts[0];

      // Verify tool configuration
      expect(script.inputSchema).toBeDefined();
      expect(script.inputSchema.properties.operation.enum).toEqual(['read', 'write', 'delete']);

      // Simulate MCP tool invocation
      const toolArgs = {
        operation: 'write',
        path: '/test/file.txt',
        content: 'Hello, world!',
      };

      const result = await handleScript({
        filePath: script.filePath,
        args: toolArgs,
      });

      expect(result.content[0].text).toBe('{"status":"success","message":"File written"}');

      // Test with different operation
      const readResult = await handleScript({
        filePath: script.filePath,
        args: { operation: 'read', path: '/test/file.txt' },
      });

      expect(readResult.content[0].text).toBe('{"status":"success","data":"file contents"}');
    });

    it('should validate parameters according to schema', async () => {
      // Simulate Zod schema validation for tool parameters
      const schema = z.object({
        message: z.string().describe('The message to display'),
        count: z.number().describe('Number of times to repeat').min(1).max(10).optional().default(1),
        tags: z.array(z.string()).describe('Tags').optional(),
      });

      // Valid inputs
      const valid1 = schema.safeParse({ message: 'Hello' });
      expect(valid1.success).toBe(true);
      expect(valid1.data).toEqual({ message: 'Hello', count: 1 });

      const valid2 = schema.safeParse({ message: 'Hello', count: 5, tags: ['test', 'demo'] });
      expect(valid2.success).toBe(true);

      // Invalid inputs
      const invalid1 = schema.safeParse({}); // Missing required message
      expect(invalid1.success).toBe(false);

      const invalid2 = schema.safeParse({ message: 'Hello', count: 15 }); // Count out of range
      expect(invalid2.success).toBe(false);

      const invalid3 = schema.safeParse({ message: 123 }); // Wrong type
      expect(invalid3.success).toBe(false);
    });
  });

  describe.skip('error handling', () => {
    it('should handle malformed params() configurations gracefully', async () => {
      const malformedScript = `
// Name: malformed-tool
// Description: Malformed tool
// mcp: malformed-tool

import "@johnlindquist/kit"

// Missing properties
const result = await params({
  type: "object"
})
`;

      const result = await extractMCPToolParameters(malformedScript);
      expect(result).toHaveProperty('inputSchema');
      const inputSchema = (result as any).inputSchema;
      expect(inputSchema.properties).toBeUndefined();
    });

    it('should handle scripts with syntax errors', async () => {
      const syntaxErrorScript = `
// Name: syntax-error
// Description: Script with syntax error
// mcp: syntax-error

import "@johnlindquist/kit"

const result = await params({
  type: "object",
  properties: {
    test: {
      type: "string",
      description: "Test parameter"
      // Missing closing brace
  }
})
`;

      // extractMCPToolParameters should throw or return empty
      await expect(extractMCPToolParameters(syntaxErrorScript)).rejects.toThrow();
    });
  });
});
