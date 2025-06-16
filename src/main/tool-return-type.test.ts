import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock the kit module's params function
vi.mock('@johnlindquist/kit/api/params', () => {
  return {
    params: vi.fn(async (inputSchema) => {
      // Check if we're being called via MCP headers
      if (global.headers && global.headers['X-MCP-Parameters']) {
        try {
          const parameters = JSON.parse(global.headers['X-MCP-Parameters']);
          return parameters;
        } catch (error) {
          // Ignore JSON parse errors
        }
      }

      // Fallback: if all declared parameters are already present in global.headers
      const parameterNames = inputSchema?.properties ? Object.keys(inputSchema.properties) : [];
      if (
        global.headers &&
        parameterNames.length > 0 &&
        parameterNames.every(k => k in global.headers)
      ) {
        return global.headers;
      }

      // Check environment variable
      if (process.env.KIT_MCP_CALL) {
        try {
          const mcpCall = JSON.parse(process.env.KIT_MCP_CALL);
          return mcpCall.parameters;
        } catch (error) {
          // Ignore JSON parse errors
        }
      }

      // Return empty object as fallback
      return {};
    }),
  };
});

describe('params() function return type verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset global state
    delete (global as any).headers;
    delete process.env.KIT_MCP_CALL;
  });

  it('should return an object with keys matching the parameters when called via MCP headers', async () => {
    // Mock the global headers that would be set by MCP
    (global as any).headers = {
      'X-MCP-Parameters': JSON.stringify({
        text: 'Hello from MCP',
        number: 42,
      }),
    };

    const { params } = await import('@johnlindquist/kit/api/params');

    const result = await params({
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

    const { params } = await import('@johnlindquist/kit/api/params');

    const result = await params({
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
    });

    expect(result).toEqual({
      text: 'Fallback text',
      number: 99,
    });
  });

  it('should return typed object when called via environment variable', async () => {
    process.env.KIT_MCP_CALL = JSON.stringify({
      parameters: {
        enabled: true,
        items: ['apple', 'banana'],
        count: 5,
      },
    });

    const { params } = await import('@johnlindquist/kit/api/params');

    interface ToolParams {
      enabled: boolean;
      items: string[];
      count: number;
    }

    const result = await params<ToolParams>({
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        items: { type: 'array' },
        count: { type: 'number' },
      },
    });

    // TypeScript would enforce this at compile time
    expect(result.enabled).toBe(true);
    expect(result.items).toEqual(['apple', 'banana']);
    expect(result.count).toBe(5);
  });

  it('should handle complex nested parameter structures', async () => {
    (global as any).headers = {
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

    const { params } = await import('@johnlindquist/kit/api/params');

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

    const result = await params<ComplexParams>({
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
      'X-MCP-Parameters': JSON.stringify({
        stringParam: 'hello',
        numberParam: 123.45,
        booleanParam: true,
        arrayParam: [1, 2, 3],
        nullParam: null,
        objectParam: { key: 'value' },
      }),
    };

    const { params } = await import('@johnlindquist/kit/api/params');

    const result = await params({
      type: 'object',
      properties: {
        stringParam: { type: 'string' },
        numberParam: { type: 'number' },
        booleanParam: { type: 'boolean' },
        arrayParam: { type: 'array' },
        nullParam: { type: 'null' },
        objectParam: { type: 'object' },
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