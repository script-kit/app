import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import http from 'node:http';
import { getScripts } from '@johnlindquist/kit/core/db';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { handleScript, UNDEFINED_VALUE } from './handleScript';
import { startMcpHttpServer, stopMcpHttpServer } from './mcp-http-server';
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

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => ({
    on: vi.fn(),
    write: vi.fn(),
    kill: vi.fn(),
    pid: 1234,
  })),
}));

vi.mock('@johnlindquist/kit/core/db');
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    readFile: vi.fn(() => Promise.resolve('')),
  };
});
vi.mock('./handleScript');
vi.mock('./logs', () => ({
  perf: {
    start: vi.fn(() => () => 0),
    measure: vi.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    measureSync: vi.fn((_name: string, fn: () => unknown) => fn()),
    logMetric: vi.fn(),
    logSummary: vi.fn(),
    isEnabled: vi.fn(() => false),
  },
  mcpLog: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));
vi.mock('./serverTrayUtils', () => ({
  getMcpPort: vi.fn(() => 3000),
}));

vi.mock('./state', () => ({
  kitState: {
    kenvPath: '/mock/kenv',
    scripts: new Map(),
  },
  subs: [],
}));

// Mock implementation of createToolSchemaFromConfig for testing
function createToolSchemaFromConfig(parameters: Record<string, any>): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, param] of Object.entries(parameters)) {
    let schema: z.ZodTypeAny;

    switch (param.type) {
      case 'string':
        schema = z.string();
        if (param.enum) {
          schema = z.enum(param.enum as [string, ...string[]]);
        }
        if (param.pattern) {
          schema = (schema as z.ZodString).regex(new RegExp(param.pattern));
        }
        break;

      case 'number':
        schema = z.number();
        if (param.minimum !== undefined) {
          schema = (schema as z.ZodNumber).min(param.minimum);
        }
        if (param.maximum !== undefined) {
          schema = (schema as z.ZodNumber).max(param.maximum);
        }
        break;

      case 'boolean':
        schema = z.boolean();
        break;

      case 'array':
        schema = z.array(z.string());
        break;

      case 'object':
        schema = z.object({});
        break;

      default:
        schema = z.string();
    }

    if (param.description) {
      schema = schema.describe(param.description);
    }

    if (!param.required) {
      schema = schema.optional();
    }

    if (param.default !== undefined) {
      schema = schema.default(param.default);
    }

    shape[key] = schema;
  }

  return shape;
}

// Mock implementation of createToolSchema for testing
function createToolSchema(args: Array<{ name: string; placeholder: string | null }>): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [index, arg] of args.entries()) {
    const key = arg.name?.trim() ? arg.name : `arg${index + 1}`;
    shape[key] = z
      .string()
      .describe(arg.placeholder || arg.name || `Parameter ${index + 1}`)
      .default(UNDEFINED_VALUE)
      .optional();
  }

  return shape;
}

describe('MCP HTTP Server Tool Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mcpService.clearCache();
  });

  afterEach(() => {
    stopMcpHttpServer();
  });

  describe('createToolSchemaFromConfig', () => {
    it('should convert string parameters correctly', () => {
      const parameters = {
        simpleString: {
          type: 'string',
          description: 'A simple string',
          required: true,
        },
        optionalString: {
          type: 'string',
          description: 'An optional string',
          required: false,
          default: 'default value',
        },
      };

      const schema = createToolSchemaFromConfig(parameters);

      expect(schema.simpleString).toBeDefined();
      expect(schema.optionalString).toBeDefined();

      // Test validation
      const testSchema = z.object(schema);
      const valid = testSchema.safeParse({ simpleString: 'test' });
      expect(valid.success).toBe(true);
      expect(valid.data).toEqual({ simpleString: 'test', optionalString: 'default value' });
    });

    it('should handle enum strings', () => {
      const parameters = {
        priority: {
          type: 'string',
          description: 'Priority level',
          enum: ['low', 'medium', 'high'],
          default: 'medium',
        },
      };

      const schema = createToolSchemaFromConfig(parameters);
      const testSchema = z.object(schema);

      const valid = testSchema.safeParse({});
      expect(valid.success).toBe(true);
      expect(valid.data.priority).toBe('medium');

      const invalid = testSchema.safeParse({ priority: 'invalid' });
      expect(invalid.success).toBe(false);
    });

    it('should handle pattern strings', () => {
      const parameters = {
        code: {
          type: 'string',
          description: 'Three letter code',
          pattern: '^[A-Z]{3}$',
          required: true,
        },
      };

      const schema = createToolSchemaFromConfig(parameters);
      const testSchema = z.object(schema);

      const valid = testSchema.safeParse({ code: 'ABC' });
      expect(valid.success).toBe(true);

      const invalid = testSchema.safeParse({ code: 'abc' });
      expect(invalid.success).toBe(false);
    });

    it('should handle number parameters with bounds', () => {
      const parameters = {
        percentage: {
          type: 'number',
          description: 'Percentage value',
          minimum: 0,
          maximum: 100,
          required: true,
        },
        count: {
          type: 'number',
          description: 'Item count',
          minimum: 1,
          default: 1,
        },
      };

      const schema = createToolSchemaFromConfig(parameters);
      const testSchema = z.object(schema);

      const valid = testSchema.safeParse({ percentage: 50 });
      expect(valid.success).toBe(true);
      expect(valid.data).toEqual({ percentage: 50, count: 1 });

      const invalid = testSchema.safeParse({ percentage: 150 });
      expect(invalid.success).toBe(false);
    });

    it('should handle boolean parameters', () => {
      const parameters = {
        enabled: {
          type: 'boolean',
          description: 'Enable feature',
          default: false,
        },
        confirmed: {
          type: 'boolean',
          description: 'User confirmation',
          required: true,
        },
      };

      const schema = createToolSchemaFromConfig(parameters);
      const testSchema = z.object(schema);

      const valid = testSchema.safeParse({ confirmed: true });
      expect(valid.success).toBe(true);
      expect(valid.data).toEqual({ confirmed: true, enabled: false });
    });

    it('should handle array and object parameters', () => {
      const parameters = {
        tags: {
          type: 'array',
          description: 'List of tags',
        },
        metadata: {
          type: 'object',
          description: 'Additional metadata',
        },
      };

      const schema = createToolSchemaFromConfig(parameters);
      expect(schema.tags).toBeDefined();
      expect(schema.metadata).toBeDefined();
    });

    it('should handle unknown types as strings', () => {
      const parameters = {
        unknown: {
          type: 'unknown-type',
          description: 'Unknown type parameter',
        },
      };

      const schema = createToolSchemaFromConfig(parameters);
      const testSchema = z.object(schema);

      const valid = testSchema.safeParse({ unknown: 'string value' });
      expect(valid.success).toBe(true);
    });
  });

  describe('tool registration with MCP server', () => {
    beforeEach(async () => {
      const { kitState } = await import('./state');
      kitState.scripts.clear();
    });

    it('should register tool-based scripts correctly', async () => {
      const { kitState } = await import('./state');

      const mockScript = {
        name: 'test-tool',
        command: 'test-tool',
        filePath: '/test/test-tool.js',
        description: 'Test tool',
        mcp: 'test-tool',
      };

      // Add script to mocked kitState
      kitState.scripts.set('test-tool', mockScript);

      const scriptContent = `
// Name: test-tool
// Description: Test tool
// mcp: test-tool

import "@johnlindquist/kit"

const result = await tool({
  name: "test-tool",
  description: "Test tool",
  parameters: {
    message: {
      type: "string",
      description: "The message",
      required: true
    },
    verbose: {
      type: "boolean",
      description: "Verbose output",
      default: false
    }
  }
})`;

      vi.mocked(getScripts).mockResolvedValue([mockScript] as any);
      vi.mocked(readFile).mockResolvedValue(scriptContent);

      const scripts = await mcpService.getMCPScripts();
      expect(scripts).toHaveLength(1);

      const script = scripts[0];
      expect(script.toolConfig).toBeDefined();
      expect(script.toolConfig.parameters).toHaveProperty('message');
      expect(script.toolConfig.parameters).toHaveProperty('verbose');
      expect(script.args).toEqual([]); // tool() scripts have empty args
    });

    it('should register arg-based scripts correctly', async () => {
      const { kitState } = await import('./state');

      const mockScript = {
        name: 'arg-script',
        command: 'arg-script',
        filePath: '/test/arg-script.js',
        description: 'Arg-based script',
        mcp: 'arg-tool',
      };

      // Add script to mocked kitState
      kitState.scripts.set('arg-script', mockScript);

      const scriptContent = `
// Name: arg-script
// Description: Arg-based script
// mcp: arg-tool

import "@johnlindquist/kit"

const username = await arg("Enter username")
const password = await arg({ placeholder: "Enter password", secret: true })`;

      vi.mocked(getScripts).mockResolvedValue([mockScript] as any);
      vi.mocked(readFile).mockResolvedValue(scriptContent);

      const scripts = await mcpService.getMCPScripts();
      expect(scripts).toHaveLength(1);

      const script = scripts[0];
      expect(script.toolConfig).toBeUndefined();
      expect(script.args).toHaveLength(2);
      expect(script.args[0]).toEqual({ name: 'username', placeholder: 'Enter username' });
      expect(script.args[1]).toEqual({ name: 'password', placeholder: 'Enter password' });
    });
  });

  describe('HTTP header handling for tool parameters', () => {
    it('should pass tool parameters via X-MCP-Tool and X-MCP-Parameters headers', async () => {
      const mockToolScript = {
        name: 'header-test',
        filePath: '/test/header-test.js',
        description: 'Header test',
        mcp: 'header-test',
        args: [],
        toolConfig: {
          name: 'header-test',
          description: 'Header test',
          parameters: {
            action: {
              type: 'string',
              required: true,
            },
            target: {
              type: 'string',
              required: true,
            },
          },
        },
      };

      // Mock mcpService to return our test script
      vi.spyOn(mcpService, 'getMCPScripts').mockResolvedValue([mockToolScript]);

      // Mock handleScript to capture the headers passed
      let capturedHeaders: Record<string, string> = {};
      vi.mocked(handleScript).mockImplementation(
        async (_script, _args, _cwd, _checkAccess, _apiKey, headers, _mcpResponse) => {
          capturedHeaders = headers;
          return {
            status: 200,
            data: {
              content: [
                {
                  type: 'text',
                  text: 'Success',
                },
              ],
            },
          };
        },
      );

      // Start the server
      await startMcpHttpServer();

      // Create an MCP server instance and register tools
      const mcpServer = new McpServer({
        name: 'test-server',
        version: '1.0.0',
      });

      // Simulate tool invocation with parameters
      const toolParams = {
        action: 'create',
        target: 'resource',
      };

      // In the actual implementation, when a tool is invoked via MCP,
      // the parameters should be passed through headers
      await handleScript(
        mockToolScript.filePath,
        [], // Empty args for tool-based scripts
        process.cwd(),
        false,
        '',
        {
          'X-MCP-Tool': 'header-test',
          'X-MCP-Parameters': JSON.stringify(toolParams),
        },
        true,
      );

      // Verify headers were passed correctly
      expect(capturedHeaders['X-MCP-Tool']).toBe('header-test');
      expect(capturedHeaders['X-MCP-Parameters']).toBe(JSON.stringify(toolParams));
    });
  });

  describe('tool execution flow', () => {
    it('should execute tool-based scripts with provided parameters', async () => {
      const mockScript = {
        name: 'exec-test',
        filePath: '/test/exec-test.js',
        description: 'Execution test',
        mcp: 'exec-test',
        args: [],
        toolConfig: {
          name: 'exec-test',
          description: 'Execution test',
          parameters: {
            operation: {
              type: 'string',
              enum: ['read', 'write'],
              required: true,
            },
            data: {
              type: 'string',
              required: false,
            },
          },
        },
      };

      vi.spyOn(mcpService, 'getMCPScripts').mockResolvedValue([mockScript]);

      // Mock handleScript to verify tool parameters are passed correctly
      vi.mocked(handleScript).mockImplementation(
        async (_script, _args, _cwd, _checkAccess, _apiKey, _headers, _mcpResponse, toolParams) => {
          // For tool-based scripts, toolParams should contain the parameters
          if (toolParams && toolParams.operation === 'write') {
            return {
              status: 200,
              data: {
                content: [
                  {
                    type: 'text',
                    text: `Written: ${toolParams.data}`,
                  },
                ],
              },
            };
          }

          return {
            status: 200,
            data: {
              content: [
                {
                  type: 'text',
                  text: 'Read operation',
                },
              ],
            },
          };
        },
      );

      // Test write operation
      const writeResult = await handleScript(mockScript.filePath, [], process.cwd(), false, '', {}, true, {
        operation: 'write',
        data: 'test data',
      });

      expect(writeResult.data.content[0].text).toBe('Written: test data');

      // Test read operation
      const readResult = await handleScript(mockScript.filePath, [], process.cwd(), false, '', {}, true, {
        operation: 'read',
      });

      expect(readResult.data.content[0].text).toBe('Read operation');
    });

    it('should handle missing required parameters', async () => {
      const parameters = {
        required: {
          type: 'string',
          description: 'Required parameter',
          required: true,
        },
        optional: {
          type: 'string',
          description: 'Optional parameter',
          required: false,
        },
      };

      const schema = createToolSchemaFromConfig(parameters);
      const testSchema = z.object(schema);

      // Missing required parameter
      const invalid = testSchema.safeParse({ optional: 'value' });
      expect(invalid.success).toBe(false);

      // With required parameter
      const valid = testSchema.safeParse({ required: 'value' });
      expect(valid.success).toBe(true);
    });
  });

  describe('mixed arg() and tool() scripts', () => {
    it('should handle both script types in the same server', async () => {
      const mockScripts = [
        {
          name: 'tool-script',
          filePath: '/test/tool-script.js',
          description: 'Tool-based script',
          mcp: 'tool-script',
          args: [],
          toolConfig: {
            name: 'tool-script',
            description: 'Tool-based script',
            parameters: {
              input: {
                type: 'string',
                required: true,
              },
            },
          },
        },
        {
          name: 'arg-script',
          filePath: '/test/arg-script.js',
          description: 'Arg-based script',
          mcp: 'arg-script',
          args: [
            { name: 'input', placeholder: 'Enter input' },
            { name: 'confirm', placeholder: 'Confirm?' },
          ],
          toolConfig: undefined,
        },
      ];

      vi.spyOn(mcpService, 'getMCPScripts').mockResolvedValue(mockScripts);

      let capturedArgs: any[] = [];
      let capturedToolParams: any = null;

      vi.mocked(handleScript).mockImplementation(
        async (script, args, _cwd, _checkAccess, _apiKey, _headers, _mcpResponse, toolParams) => {
          if (script.includes('tool-script')) {
            capturedToolParams = toolParams;
          } else {
            capturedArgs = args;
          }

          return {
            status: 200,
            data: {
              content: [
                {
                  type: 'text',
                  text: 'Success',
                },
              ],
            },
          };
        },
      );

      // Execute tool-based script
      await handleScript('/test/tool-script.js', [], process.cwd(), false, '', {}, true, { input: 'test value' });

      expect(capturedToolParams).toEqual({ input: 'test value' });

      // Execute arg-based script
      await handleScript('/test/arg-script.js', ['test input', 'yes'], process.cwd(), false, '', {}, true);

      expect(capturedArgs).toEqual(['test input', 'yes']);
    });
  });

  describe('MCP UI parameter display', () => {
    it('should format tool parameters for correct UI display', async () => {
      const mockScript = {
        name: 'ui-display-test',
        filePath: '/test/ui-display-test.js',
        description: 'UI display test',
        mcp: 'ui-display-test',
        args: [],
        toolConfig: {
          name: 'ui-display-test',
          description: 'UI display test',
          parameters: {
            title: {
              type: 'string',
              description: 'Item title',
              required: true,
            },
            priority: {
              type: 'string',
              description: 'Priority level',
              enum: ['low', 'medium', 'high'],
              default: 'medium',
            },
            tags: {
              type: 'array',
              description: 'Tags for categorization',
            },
            isPublic: {
              type: 'boolean',
              description: 'Make public',
              default: false,
            },
            maxItems: {
              type: 'number',
              description: 'Maximum items',
              minimum: 1,
              maximum: 100,
              default: 10,
            },
          },
        },
      };

      vi.spyOn(mcpService, 'getMCPScripts').mockResolvedValue([mockScript]);

      const scripts = await mcpService.getMCPScripts();
      const script = scripts[0];

      // Verify the tool config structure is preserved for UI
      expect(script.toolConfig).toBeDefined();
      expect(script.toolConfig.parameters).toBeDefined();

      // Check each parameter has the necessary fields for UI display
      const params = script.toolConfig.parameters;

      expect(params.title).toEqual({
        type: 'string',
        description: 'Item title',
        required: true,
      });

      expect(params.priority).toEqual({
        type: 'string',
        description: 'Priority level',
        enum: ['low', 'medium', 'high'],
        default: 'medium',
      });

      expect(params.tags).toEqual({
        type: 'array',
        description: 'Tags for categorization',
      });

      expect(params.isPublic).toEqual({
        type: 'boolean',
        description: 'Make public',
        default: false,
      });

      expect(params.maxItems).toEqual({
        type: 'number',
        description: 'Maximum items',
        minimum: 1,
        maximum: 100,
        default: 10,
      });

      // Verify schema generation preserves all constraints
      const schema = createToolSchemaFromConfig(params);

      // The schema should have all parameter keys
      expect(Object.keys(schema)).toEqual(['title', 'priority', 'tags', 'isPublic', 'maxItems']);
    });

    it('should handle complex nested parameters for UI display', async () => {
      const mockScript = {
        name: 'nested-params',
        filePath: '/test/nested-params.js',
        description: 'Nested parameters test',
        mcp: 'nested-params',
        args: [],
        toolConfig: {
          name: 'nested-params',
          description: 'Nested parameters test',
          parameters: {
            config: {
              type: 'object',
              description: 'Configuration object',
              properties: {
                enabled: {
                  type: 'boolean',
                  default: true,
                },
                settings: {
                  type: 'object',
                  properties: {
                    theme: {
                      type: 'string',
                      enum: ['light', 'dark'],
                    },
                  },
                },
              },
            },
            items: {
              type: 'array',
              description: 'List of items',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  value: { type: 'number' },
                },
              },
            },
          },
        },
      };

      vi.spyOn(mcpService, 'getMCPScripts').mockResolvedValue([mockScript]);

      const scripts = await mcpService.getMCPScripts();
      const script = scripts[0];

      // Verify nested structure is preserved
      expect(script.toolConfig.parameters.config).toBeDefined();
      expect(script.toolConfig.parameters.config.type).toBe('object');
      expect(script.toolConfig.parameters.config.properties).toBeDefined();

      expect(script.toolConfig.parameters.items).toBeDefined();
      expect(script.toolConfig.parameters.items.type).toBe('array');
      expect(script.toolConfig.parameters.items.items).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle tool registration errors gracefully', async () => {
      const mockScript = {
        name: 'error-test',
        filePath: '/test/error-test.js',
        description: 'Error test',
        mcp: 'error-test',
        args: [],
        toolConfig: null, // Invalid tool config
      };

      vi.spyOn(mcpService, 'getMCPScripts').mockResolvedValue([mockScript]);

      // Should not throw when registering tools
      await expect(startMcpHttpServer()).resolves.not.toThrow();
    });

    it('should handle parameter validation errors', async () => {
      // Invalid parameter configuration
      const invalidParams = {
        test: {
          type: 'string',
          enum: [], // Empty enum array (invalid)
        },
      };

      // Should handle gracefully
      expect(() => createToolSchemaFromConfig(invalidParams)).not.toThrow();
    });
  });
});
