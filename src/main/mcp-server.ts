// NOTE: This stdio-based MCP server is deprecated.
// The application now starts an HTTP-based MCP server automatically (see mcp-http-server.ts).
// This file is kept temporarily for backward-compatibility with CLI usage but will be removed.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createLogger } from './log-utils';
import { mcpService } from './mcp-service';
import { getServerPort } from './serverTrayUtils';

const log = createLogger('mcp-server');

// Create tool schema based on script args
function createToolSchema(args: Array<{ name: string; placeholder: string | null }>) {
  const properties: Record<string, any> = {};

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

export async function startMCPServer() {
  try {
    log.info('Starting MCP server within Script Kit app...');

    // Ensure HTTP server is running first
    const { startServer } = await import('./server');
    await startServer();

    // Give the server a moment to fully initialize
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Create MCP server with oninitialized callback
    const server = new McpServer({
      name: 'script-kit',
      version: '1.0.0',
      oninitialized: async () => {
        log.info('MCP client initialized, rescanning scripts...');
        // Force refresh on each client initialization
        await registerTools(server, true);
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

            // Create schema based on script args
            const schema = createToolSchema(script.args);

            // Register tool with MCP
            mcpServer.tool(script.name, script.description, schema, async (params) => {
              log.info(`Executing MCP tool: ${script.name}`, params);

              // Convert params object to args array
              const args: string[] = [];
              for (let i = 0; i < script.args.length; i++) {
                const argName = `arg${i + 1}`;
                args.push(params[argName] || '');
              }

              try {
                // Execute the script using the HTTP API
                const result = await fetch(`http://localhost:${getServerPort()}/api/mcp/execute`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    script: script.name,
                    args,
                  }),
                }).then((res) => res.json());

                // Return MCP-formatted response
                if (result && typeof result === 'object' && 'content' in result) {
                  return result;
                }

                // Fallback formatting
                return {
                  content: [
                    {
                      type: 'text',
                      text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
                    },
                  ],
                };
              } catch (error: any) {
                log.error(`Error executing script ${script.name}:`, error);
                return {
                  content: [
                    {
                      type: 'text',
                      text: `Error: ${error.message}`,
                    },
                  ],
                };
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
