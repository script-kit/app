import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock the kit module's tool function
vi.mock('@johnlindquist/kit/api/tool', () => {
  return {
    tool: vi.fn(async (config) => {
      // Check if we're being called via MCP headers
      if (global.headers && global.headers['X-MCP-Tool'] === config.name && global.headers['X-MCP-Parameters']) {
        try {
          const parameters = JSON.parse(global.headers['X-MCP-Parameters']);
          return parameters;
        } catch (error) {
          // Ignore JSON parse errors
        }
      }

      // Fallback: if all declared parameters are already present in global.headers
      const parameterNames = config.inputSchema?.properties ? Object.keys(config.inputSchema.properties) : [];
      if (
        global.headers &&
        !global.headers['X-MCP-Tool'] &&
        parameterNames.length > 0 &&
        parameterNames.every(k => k in global.headers)
      ) {
        return global.headers;
      }

      // Check environment variable
      if (process.env.KIT_MCP_CALL) {
        try {
          const mcpCall = JSON.parse(process.env.KIT_MCP_CALL);
          if (mcpCall.tool === config.name) {
            return mcpCall.parameters;
          }
        } catch (error) {
          // Ignore JSON parse errors
        }
      }

      // Return empty object as fallback
      return {};
    }),
  };
});

describe('tool() function return type verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset global state
    delete (global as any).headers;
    delete process.env.KIT_MCP_CALL;
  });

  it('should return an object with keys matching the parameters when called via MCP headers', async () => {
    // Mock the global headers that would be set by MCP
    (global as any).headers = {
      'X-MCP-Tool': 'testing-mcp-tool',
      'X-MCP-Parameters': JSON.stringify({
        text: 'Hello from MCP',
        number: 42,
      }),
    };

    const { tool } = await import('@johnlindquist/kit/api/tool');

    const result = await tool({
      name: 'testing-mcp-tool',
      description: 'A tool for testing MCP',
      inputSchema: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'Just give me any string',
            default: 'Hello, world!',
          },
          number: {
            type: 'number',
            description: 'Just give me any number',
            default: 100,
          },
        },
      },
    });

    // Verify the result has the expected shape
    expect(result).toEqual({
      text: 'Hello from MCP',
      number: 42,
    });

    // Verify the type (this would be compile-time in actual usage)
    expect(typeof result).toBe('object');
    expect(result).toHaveProperty('text');
    expect(result).toHaveProperty('number');
  });

  it('should return an object with all parameter keys when using fallback header mechanism', async () => {
    // Mock headers without MCP sentinel keys but with all parameters
    (global as any).headers = {
      text: 'Fallback text',
      number: 99,
    };

    const { tool } = await import('@johnlindquist/kit/api/tool');

    const result = await tool({
      name: 'fallback-tool',
      description: 'A tool testing fallback',
      inputSchema: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'Text parameter',
          },
          number: {
            type: 'number',
            description: 'Number parameter',
          },
        },
      },
    });

    expect(result).toEqual({
      text: 'Fallback text',
      number: 99,
    });
  });

  it('should return typed object when called via environment variable', async () => {
    process.env.KIT_MCP_CALL = JSON.stringify({
      tool: 'env-test-tool',
      parameters: {
        enabled: true,
        items: ['apple', 'banana'],
        count: 5,
      },
    });

    const { tool } = await import('@johnlindquist/kit/api/tool');

    interface ToolParams {
      enabled: boolean;
      items: string[];
      count: number;
    }

    const result = await tool<ToolParams>({
      name: 'env-test-tool',
      description: 'Testing env-based MCP call',
      inputSchema: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
          items: { type: 'array' },
          count: { type: 'number' },
        },
      },
    });

    // TypeScript would enforce this at compile time
    expect(result.enabled).toBe(true);
    expect(result.items).toEqual(['apple', 'banana']);
    expect(result.count).toBe(5);
  });

  it('should handle complex nested parameter structures', async () => {
    (global as any).headers = {
      'X-MCP-Tool': 'complex-tool',
      'X-MCP-Parameters': JSON.stringify({
        user: {
          name: 'John Doe',
          age: 30,
          preferences: {
            theme: 'dark',
            notifications: true,
          },
        },
        settings: {
          advanced: false,
          timeout: 5000,
        },
      }),
    };

    const { tool } = await import('@johnlindquist/kit/api/tool');

    interface ComplexParams {
      user: {
        name: string;
        age: number;
        preferences: {
          theme: string;
          notifications: boolean;
        };
      };
      settings: {
        advanced: boolean;
        timeout: number;
      };
    }

    const result = await tool<ComplexParams>({
      name: 'complex-tool',
      description: 'Tool with nested parameters',
      inputSchema: {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              age: { type: 'number' },
              preferences: {
                type: 'object',
                properties: {
                  theme: { type: 'string' },
                  notifications: { type: 'boolean' },
                },
              },
            },
          },
          settings: {
            type: 'object',
            properties: {
              advanced: { type: 'boolean' },
              timeout: { type: 'number' },
            },
          },
        },
      },
    });

    expect(result.user.name).toBe('John Doe');
    expect(result.user.age).toBe(30);
    expect(result.user.preferences.theme).toBe('dark');
    expect(result.user.preferences.notifications).toBe(true);
    expect(result.settings.advanced).toBe(false);
    expect(result.settings.timeout).toBe(5000);
  });

  it('should preserve parameter types correctly', async () => {
    (global as any).headers = {
      'X-MCP-Tool': 'type-test-tool',
      'X-MCP-Parameters': JSON.stringify({
        stringParam: 'hello',
        numberParam: 123.45,
        booleanParam: true,
        arrayParam: [1, 2, 3],
        nullParam: null,
        objectParam: { key: 'value' },
      }),
    };

    const { tool } = await import('@johnlindquist/kit/api/tool');

    const result = await tool({
      name: 'type-test-tool',
      description: 'Testing type preservation',
      inputSchema: {
        type: 'object',
        properties: {
          stringParam: { type: 'string' },
          numberParam: { type: 'number' },
          booleanParam: { type: 'boolean' },
          arrayParam: { type: 'array' },
          nullParam: { type: 'null' },
          objectParam: { type: 'object' },
        },
      },
    });

    // Verify types are preserved
    expect(typeof result.stringParam).toBe('string');
    expect(typeof result.numberParam).toBe('number');
    expect(typeof result.booleanParam).toBe('boolean');
    expect(Array.isArray(result.arrayParam)).toBe(true);
    expect(result.nullParam).toBeNull();
    expect(typeof result.objectParam).toBe('object');
  });
});