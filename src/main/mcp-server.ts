// NOTE: This stdio-based MCP server is deprecated.
// The application now starts an HTTP-based MCP server automatically (see mcp-http-server.ts).
// This file is kept temporarily for backward-compatibility with CLI usage but will be removed.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { type ZodObject, type ZodRawShape, z } from 'zod';
import { mcpService, type MCPScript } from './mcp-service';
import { getServerPort } from './serverTrayUtils';
import { mcpLog as log } from "./logs"


// Create tool schema based on script args
function createToolSchema(args: Array<{ name: string; placeholder: string | null }>): ZodObject<ZodRawShape> {
  const properties: ZodRawShape = {};

  // Create properties for each arg
  args.forEach((arg, index) => {
    const argName = `arg${index + 1}`;
    properties[argName] = z
      .string()
      .optional()
      .describe(arg.placeholder || `Parameter ${index + 1}`);
  });

  return z.object(properties);
}

interface ParameterSchema {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: string[];
  pattern?: string;
  minimum?: number;
  maximum?: number;
  required?: boolean;
  default?: unknown;
}


// Create tool schema from tool() config or params() inputSchema
function createToolSchemaFromConfig(
  parameters: Record<string, ParameterSchema>,
  required?: string[],
): ZodObject<ZodRawShape> {
  const properties: ZodRawShape = {};

  for (const [key, param] of Object.entries(parameters)) {
    let schema: z.ZodTypeAny;

    // Map parameter types to Zod schemas
    switch (param.type) {
      case 'string': {
        schema = z.string();
        if (param.enum) {
          schema = z.enum(param.enum as [string, ...string[]]);
        }
        if (param.pattern) {
          schema = (schema as z.ZodString).regex(new RegExp(param.pattern));
        }
        break;
      }

      case 'number': {
        schema = z.number();
        if (param.minimum !== undefined) {
          schema = (schema as z.ZodNumber).min(param.minimum);
        }
        if (param.maximum !== undefined) {
          schema = (schema as z.ZodNumber).max(param.maximum);
        }
        break;
      }

      case 'boolean':
        schema = z.boolean();
        break;

      case 'array':
        // Simple array support for now
        schema = z.array(z.string());
        break;

      case 'object':
        // Simple object support for now
        schema = z.object({});
        break;

      default:
        schema = z.string();
    }

    // Add description
    if (param.description) {
      schema = schema.describe(param.description);
    }

    // Handle required/optional
    // Check if this parameter is in the required array (for inputSchema)
    // or if param.required is false (for toolConfig)
    const isRequired = required ? required.includes(key) : param.required !== false;
    if (!isRequired) {
      schema = schema.optional();
    }

    // Handle default values
    if (param.default !== undefined) {
      schema = schema.default(param.default);
    }

    properties[key] = schema;
  }

  return z.object(properties);
}

export async function startMCPServer() {
  try {
    log.info('Starting MCP server within Script Kit app...');

    // Ensure HTTP server is running first
    const { startServer } = await import('./server');
    await startServer();

    // Give the server a moment to fully initialize
    await new Promise<void>((resolve) => setTimeout(resolve, 1000));

    // Create MCP server with oninitialized callback
    const server = new McpServer({
      name: 'script-kit',
      version: '1.0.0',
      oninitialized: () => {
        log.info('MCP client initialized, rescanning scripts...');
        // Force refresh on each client initialization
        registerTools(server, true).catch((error) => {
          log.error('Failed to register tools on client initialization:', error);
        });
      },
    });

    // Function to register all tools
    async function registerTools(mcpServer: McpServer, forceRefresh = false) {
      try {
        log.info(`Fetching MCP scripts${forceRefresh ? ' (force refresh)' : ''}...`);

        // Get all MCP scripts
        const mcpScripts = await mcpService.getMCPScripts(forceRefresh);
        log.info(`Found ${mcpScripts.length} MCP-enabled scripts`);

        // Track registered tools
        const registeredTools = new Set<string>();

        // Register each script as a tool
        for (const script of mcpScripts) {
          try {
            registeredTools.add(script.name);

            // Create schema based on script type
            let schema: ZodObject<ZodRawShape>;
            if (script.inputSchema?.properties) {
              // For params() based scripts, convert inputSchema to Zod schema
              schema = createToolSchemaFromConfig(script.inputSchema.properties, script.inputSchema.required);
            } else if (script.toolConfig?.parameters) {
              // For tool() based scripts, convert parameters to Zod schema
              schema = createToolSchemaFromConfig(script.toolConfig.parameters);
            } else {
              // For traditional arg() based scripts
              schema = createToolSchema(script.args);
            }

            // Register tool with MCP - use raw properties object instead of ZodObject
            const schemaShape = schema._def.shape();
            mcpServer.tool(script.name, script.description, schemaShape, async (params, _extra) => {
              log.info(`Executing MCP tool: ${script.name}`, params);

              const args: string[] = [];
              let toolParams: Record<string, unknown> | null = null;

              if (script.inputSchema?.properties) {
                // For params() based scripts, pass parameters as JSON
                toolParams = params;
              } else if (script.toolConfig?.parameters) {
                // For tool() based scripts, pass parameters as JSON
                toolParams = params;
              } else {
                // For traditional arg() scripts, convert params to array
                for (let i = 0; i < script.args.length; i++) {
                  const argName = `arg${i + 1}`;
                  args.push((params[argName] as string) || '');
                }
              }

              try {
                // Execute the script using the HTTP API
                const body = toolParams ? { script: script.name, toolParams } : { script: script.name, args };

                const result = await fetch(`http://localhost:${getServerPort()}/api/mcp/execute`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify(body),
                }).then((res) => res.json());

                // Return MCP-formatted response
                if (result && typeof result === 'object' && 'content' in result) {
                  return result as CallToolResult;
                }

                // Fallback formatting
                const response: CallToolResult = {
                  content: [
                    {
                      type: 'text' as const,
                      text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
                    },
                  ],
                };
                return response;
              } catch (error) {
                log.error(`Error executing script ${script.name}:`, error);
                const errorResponse: CallToolResult = {
                  content: [
                    {
                      type: 'text' as const,
                      text: `Error: ${error instanceof Error ? error.message : String(error)}`,
                    },
                  ],
                  isError: true,
                };
                return errorResponse;
              }
            });

            log.info(`Registered MCP tool: ${script.name}`);
          } catch (error) {
            log.error(`Failed to register tool ${script.name}:`, error);
          }
        }
      } catch (error) {
        log.error('Failed to register MCP tools:', error);
      }
    }

    // Register tools initially
    await registerTools(server);

    // Connect to stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);

    log.info('MCP server is running within Script Kit app');

    return server;
  } catch (error) {
    log.error('Failed to start MCP server:', error);
    throw error;
  }
}
