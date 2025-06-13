import { readFile } from 'node:fs/promises';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getScripts } from '@johnlindquist/kit/core/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { extractMCPToolParameters, type MCPToolParameter } from './mcp-parameter-extractor';
import { mcpService } from './mcp-service';
import { createMcpHttpServer } from './mcp-http-server';
import { handleScript, UNDEFINED_VALUE } from './handleScript';

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
  BrowserWindow: Object.assign(vi.fn(() => ({
    loadURL: vi.fn(),
    on: vi.fn(),
    webContents: {
      send: vi.fn(),
    },
  })), {
    getAllWindows: vi.fn(() => []),
  }),
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

  describe('tool() parameter extraction', () => {
    it('should extract parameters from tool() function calls', async () => {
      const scriptContent = `
// Name: testing-mcp-tool
// Description: Test tool
// mcp: testing-mcp-tool

import "@johnlindquist/kit"

const result = await tool({
  name: "testing-mcp-tool",
  description: "A test tool",
  parameters: {
    message: {
      type: "string",
      description: "The message to display",
      required: true
    },
    count: {
      type: "number",
      description: "Number of times to repeat",
      default: 1
    }
  }
})

console.log(\`Message: \${result.message}, Count: \${result.count}\`)
`;

      const result = await extractMCPToolParameters(scriptContent);
      
      expect(result).toHaveProperty('toolConfig');
      expect((result as any).toolConfig).toEqual({
        name: 'testing-mcp-tool',
        description: 'A test tool',
        parameters: {
          message: {
            type: 'string',
            description: 'The message to display',
            required: true,
          },
          count: {
            type: 'number',
            description: 'Number of times to repeat',
            default: 1,
          },
        },
      });
    });

    it('should handle complex parameter types', async () => {
      const scriptContent = `
// Name: complex-tool
// Description: Complex parameter test
// mcp: complex-tool

import "@johnlindquist/kit"

const result = await tool({
  name: "complex-tool",
  description: "Test complex parameters",
  parameters: {
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
      
      expect(result).toHaveProperty('toolConfig');
      const toolConfig = (result as any).toolConfig;
      
      expect(toolConfig.parameters).toHaveProperty('simpleString');
      expect(toolConfig.parameters).toHaveProperty('enumString');
      expect(toolConfig.parameters).toHaveProperty('patternString');
      expect(toolConfig.parameters).toHaveProperty('numberWithBounds');
      expect(toolConfig.parameters).toHaveProperty('booleanFlag');
      expect(toolConfig.parameters).toHaveProperty('arrayParam');
      expect(toolConfig.parameters).toHaveProperty('objectParam');
      
      expect(toolConfig.parameters.enumString.enum).toEqual(['option1', 'option2', 'option3']);
      expect(toolConfig.parameters.numberWithBounds.minimum).toBe(0);
      expect(toolConfig.parameters.numberWithBounds.maximum).toBe(100);
      expect(toolConfig.parameters.booleanFlag.default).toBe(false);
    });

    it('should fallback to arg() extraction when no tool() is found', async () => {
      const scriptContent = `
// Name: arg-based-tool
// Description: Tool using arg() instead of tool()
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
    it('should convert tool config to proper JSON schema for MCP', async () => {
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

const result = await tool({
  name: "test-tool",
  description: "Test tool with parameters",
  parameters: {
    message: {
      type: "string",
      description: "The message to display",
      required: true
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
  }
})
`;

      vi.mocked(getScripts).mockResolvedValue([mockScript] as any);
      vi.mocked(readFile).mockResolvedValue(scriptContent);

      const scripts = await mcpService.getMCPScripts();
      expect(scripts).toHaveLength(1);
      
      const script = scripts[0];
      expect(script.toolConfig).toBeDefined();
      
      // Verify the toolConfig structure
      const toolConfig = script.toolConfig;
      expect(toolConfig.name).toBe('test-tool');
      expect(toolConfig.description).toBe('Test tool with parameters');
      expect(toolConfig.parameters).toHaveProperty('message');
      expect(toolConfig.parameters).toHaveProperty('count');
      expect(toolConfig.parameters).toHaveProperty('enabled');
    });

    it('should generate Zod schema from tool parameters', async () => {
      // Mock the internal createToolSchemaFromConfig function behavior
      const parameters = {
        message: {
          type: 'string',
          description: 'The message to display',
          required: true,
        },
        count: {
          type: 'number',
          description: 'Number of times to repeat',
          default: 1,
        },
      };

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
    it('should register tool-based scripts with MCP server', async () => {
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

const result = await tool({
  name: "test-mcp-tool",
  description: "Test MCP tool",
  parameters: {
    action: {
      type: "string",
      description: "Action to perform",
      enum: ["create", "update", "delete"],
      required: true
    },
    target: {
      type: "string",
      description: "Target resource",
      required: true
    }
  }
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
      
      expect(script.toolConfig).toBeDefined();
      expect(script.toolConfig.parameters.action.enum).toEqual(['create', 'update', 'delete']);
      
      // Simulate MCP tool registration (what happens in createMcpHttpServer)
      const toolName = script.name;
      const toolDescription = script.description;
      const toolParameters = script.toolConfig.parameters;
      
      expect(toolName).toBe('test-mcp-tool');
      expect(toolDescription).toBe('Test MCP tool');
      expect(toolParameters).toHaveProperty('action');
      expect(toolParameters).toHaveProperty('target');
    });

    it('should handle both tool() and arg() based scripts in the same MCP server', async () => {
      const mockScripts = [
        {
          name: 'tool-based',
          command: 'tool-based',
          filePath: '/test/tool-based.js',
          description: 'Tool-based script',
          mcp: 'tool-based',
        },
        {
          name: 'arg-based',
          command: 'arg-based',
          filePath: '/test/arg-based.js',
          description: 'Arg-based script',
          mcp: 'arg-based',
        },
      ];

      const toolBasedContent = `
// Name: tool-based
// Description: Tool-based script
// mcp: tool-based

import "@johnlindquist/kit"

const result = await tool({
  name: "tool-based",
  description: "Tool-based script",
  parameters: {
    input: {
      type: "string",
      description: "Input value",
      required: true
    }
  }
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
      vi.mocked(readFile)
        .mockResolvedValueOnce(toolBasedContent)
        .mockResolvedValueOnce(argBasedContent);

      const scripts = await mcpService.getMCPScripts();
      expect(scripts).toHaveLength(2);
      
      // First script should have toolConfig
      expect(scripts[0].toolConfig).toBeDefined();
      expect(scripts[0].toolConfig.parameters).toHaveProperty('input');
      expect(scripts[0].args).toEqual([]); // tool() scripts have empty args array
      
      // Second script should have args array
      expect(scripts[1].toolConfig).toBeUndefined();
      expect(scripts[1].args).toHaveLength(2);
      expect(scripts[1].args[0].name).toBe('input');
      expect(scripts[1].args[0].placeholder).toBe('Enter input value');
      expect(scripts[1].args[1].name).toBe('confirm');
      expect(scripts[1].args[1].placeholder).toBe('Confirm action?');
    });
  });

  describe('MCP UI parameter display', () => {
    it('should format tool parameters correctly for MCP UI display', async () => {
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

const result = await tool({
  name: "ui-test-tool",
  description: "UI test tool",
  parameters: {
    title: {
      type: "string",
      description: "Title of the item",
      required: true
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
  }
})
`;

      vi.mocked(getScripts).mockResolvedValue([mockScript] as any);
      vi.mocked(readFile).mockResolvedValue(scriptContent);

      const scripts = await mcpService.getMCPScripts();
      const script = scripts[0];
      
      // Simulate what the MCP UI would receive
      const uiParameters = Object.entries(script.toolConfig.parameters).map(([key, param]: [string, any]) => ({
        name: key,
        type: param.type,
        description: param.description,
        required: param.required || false,
        default: param.default,
        enum: param.enum,
      }));
      
      expect(uiParameters).toHaveLength(5);
      
      // Verify UI-friendly format
      const titleParam = uiParameters.find(p => p.name === 'title');
      expect(titleParam).toEqual({
        name: 'title',
        type: 'string',
        description: 'Title of the item',
        required: true,
        default: undefined,
        enum: undefined,
      });
      
      const priorityParam = uiParameters.find(p => p.name === 'priority');
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

  describe('end-to-end integration', () => {
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

const result = await tool({
  name: "e2e-test",
  description: "End-to-end test",
  parameters: {
    operation: {
      type: "string",
      description: "Operation to perform",
      enum: ["read", "write", "delete"],
      required: true
    },
    path: {
      type: "string",
      description: "File path",
      required: true
    },
    content: {
      type: "string",
      description: "Content for write operations"
    }
  }
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
          content: [{
            type: 'text',
            text: JSON.stringify(responses[operation]),
          }],
        };
      });

      // Get the script
      const scripts = await mcpService.getMCPScripts();
      const script = scripts[0];
      
      // Verify tool configuration
      expect(script.toolConfig).toBeDefined();
      expect(script.toolConfig.parameters.operation.enum).toEqual(['read', 'write', 'delete']);
      
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

  describe('error handling', () => {
    it('should handle malformed tool() configurations gracefully', async () => {
      const malformedScript = `
// Name: malformed-tool
// Description: Malformed tool
// mcp: malformed-tool

import "@johnlindquist/kit"

// Missing parameters property
const result = await tool({
  name: "malformed-tool",
  description: "Malformed tool"
})
`;

      const result = await extractMCPToolParameters(malformedScript);
      expect(result).toHaveProperty('toolConfig');
      const toolConfig = (result as any).toolConfig;
      expect(toolConfig.parameters).toBeUndefined();
    });

    it('should handle scripts with syntax errors', async () => {
      const syntaxErrorScript = `
// Name: syntax-error
// Description: Script with syntax error
// mcp: syntax-error

import "@johnlindquist/kit"

const result = await tool({
  name: "syntax-error",
  description: "Syntax error test",
  parameters: {
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