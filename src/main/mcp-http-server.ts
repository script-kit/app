import { randomUUID } from 'node:crypto';
import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { handleScript, UNDEFINED_VALUE } from './handleScript';
import { mcpLog as log } from './logs';
import { mcpService, type MCPScript } from './mcp-service';
import { getMcpPort } from './serverTrayUtils';
import { debugMCPResponse } from './debug-mcp-response';

// -----------------------------
// util to build Zod schema from script args
// -----------------------------
function createToolSchema(args: Array<{ name: string; placeholder: string | null }>): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [index, arg] of args.entries()) {
    const key = arg.name?.trim() ? arg.name : `arg${index + 1}`;

    log.info(`[createToolSchema] arg: ${arg.name} ${arg.placeholder}`);
    shape[key] = z
      .string()
      .describe(arg.placeholder || arg.name || `Parameter ${index + 1}`)
      .default(UNDEFINED_VALUE)
      .optional();
  }

  return shape;
}

// -----------------------------
// Create tool schema from tool() config or params() inputSchema
// -----------------------------
function createToolSchemaFromConfig(parameters: Record<string, any>, required?: string[]): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, param] of Object.entries(parameters)) {
    let schema: z.ZodTypeAny;

    // Map parameter types to Zod schemas
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

    if (!param.required) {
      schema = schema.optional();
    }

    // Add description
    if (param.description) {
      schema = schema.describe(param.description);
    }

    // Handle required/optional
    // Check if this parameter is in the required array (for inputSchema)
    // or if param.required is false (for toolConfig)
    // const isRequired = required ? required.includes(key) : param.required !== false;
    // if (!isRequired) {
    //   schema = schema.optional();
    // }

    // Handle default values
    if (param.default !== undefined) {
      schema = schema.default(param.default);
    }

    shape[key] = schema;
  }

  return shape;
}

// -----------------------------
// Server state
// -----------------------------
let httpServer: http.Server | null = null;

// Health tracking
let mcpStartTime: Date | null = null;
let mcpRequestCount = 0;
let mcpErrorCount = 0;

const transports: Record<string, StreamableHTTPServerTransport> = {};

// Map of MCP server instances per session
const mcpServers: Record<string, McpServer> = {};

// Active SSE transports keyed by sessionId (supports multiple concurrent SSE clients)
const sseTransports: Record<string, SSEServerTransport> = {};

// Cache for script metadata to speed up server creation
let cachedScripts: MCPScript[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5000; // 5 seconds cache TTL

// =====================
// Verbose logging helper
// =====================
function dump(obj: unknown) {
  try {
    // Avoid serializing Buffers which can cause stack overflow
    if (obj instanceof Buffer) {
      return `Buffer(${obj.length} bytes)`;
    }
    if (obj && typeof obj === 'object') {
      // Create a safe copy that replaces Buffers with descriptions
      const safeObj = JSON.parse(JSON.stringify(obj, (key, value) => {
        if (value instanceof Buffer || (value && value.type === 'Buffer' && Array.isArray(value.data))) {
          return `Buffer(${value.length || value.data?.length || 0} bytes)`;
        }
        // Also handle base64 image data in content arrays
        if (typeof value === 'string' && value.startsWith('data:image/') && value.length > 1000) {
          return `Base64Image(${value.length} chars)`;
        }
        return value;
      }));
      return JSON.stringify(safeObj, null, 2);
    }
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

async function createMcpServerForSession(forceRefresh = false): Promise<McpServer> {
  const startTime = Date.now();
  log.info('Creating new MCP server instance for session…');
  log.debug(`Process PID: ${process.pid}`);

  const server = new McpServer({
    name: 'script-kit',
    version: '1.0.0',
  });

  await registerToolsForServer(server, forceRefresh);
  const duration = Date.now() - startTime;
  log.info(`MCP server instance created in ${duration}ms`);
  return server;
}

async function registerToolsForServer(server: McpServer, forceRefresh = false) {
  const startTime = Date.now();
  log.info('[registerTools] start for server instance');
  try {
    // Use cached scripts if available, not forcing refresh, and cache is fresh
    let scripts: MCPScript[];
    const now = Date.now();
    const cacheExpired = now - cacheTimestamp > CACHE_TTL;

    if (!forceRefresh && cachedScripts && !cacheExpired) {
      scripts = cachedScripts;
      log.info(`Using cached MCP scripts (${scripts.length} scripts, age: ${Math.round((now - cacheTimestamp) / 1000)}s)`);
    } else {
      if (cacheExpired) {
        log.info('Cache expired, refreshing scripts');
      }
      log.info(`Loading MCP scripts${forceRefresh ? ' (force refresh)' : ''}`);
      scripts = await mcpService.getMCPScripts(forceRefresh);
      cachedScripts = scripts; // Update cache
      cacheTimestamp = now;
    }
    const loadDuration = Date.now() - startTime;

    log.info(`[registerTools] loaded ${scripts.length} scripts in ${loadDuration}ms`);

    for (const script of scripts) {
      log.info(`[registerTools] registering script: ${script.name}`);
      try {
        // Create schema based on script type
        let schema: Record<string, z.ZodTypeAny>;
        if (script.inputSchema?.properties) {
          // For params() based scripts, convert inputSchema to Zod schema
          schema = createToolSchemaFromConfig(script.inputSchema.properties, script.inputSchema.required);
          log.info(`Using inputSchema for ${script.name}`);
        } else if (script.toolConfig?.parameters) {
          // For tool() based scripts, convert parameters to Zod schema
          schema = createToolSchemaFromConfig(script.toolConfig.parameters);
          log.info(`Using tool config schema for ${script.name}`);
        } else {
          // For traditional arg() based scripts
          schema = createToolSchema(script.args);
          log.info(`Using arg-based schema for ${script.name}`);
        }

        // Register tool with this specific MCP server instance
        server.tool(script.name, script.description || "No description metadata provided", schema, async (params: Record<string, any>) => {
          log.info(`Executing MCP tool ${script.name}`);
          log.info(`Raw params: ${Object.keys(params).join(', ')}`);

          let ordered: string[] = [];
          let toolParams: Record<string, any> | null = null;

          if (script.inputSchema && script.inputSchema.properties) {
            // For params() based scripts, pass parameters as-is
            toolParams = params;
            log.info(`Using params() parameters for ${script.name}: ${Object.keys(toolParams).join(', ')}`);
          } else if (script.toolConfig && script.toolConfig.parameters) {
            // For tool() based scripts, pass parameters as-is
            toolParams = params;
            log.info(`Using tool params for ${script.name}: ${Object.keys(toolParams).join(', ')}`);
          } else {
            // For traditional arg() scripts, assemble ordered args
            for (let i = 0; i < script.args.length; i++) {
              const meta = script.args[i];
              const key = meta.name?.trim() ? meta.name : `arg${i + 1}`;
              ordered.push(params[key] ?? UNDEFINED_VALUE);
            }
            log.info(`Using ordered args for ${script.name}: [${ordered.length} args]`);
          }

          try {
            // ========= NEW CODE (start) =========
            /**
             * When we call a script that uses `tool()`, add two headers so the helper
             * can bypass the interactive prompts:
             *
             *   X-MCP-Tool        – the tool's public name
             *   X-MCP-Parameters  – JSON-string of the argument object
             */
            const mcpHeaders: Record<string, string> = {};

            if (toolParams) {
              mcpHeaders['X-MCP-Tool'] = script.name;
              mcpHeaders['X-MCP-Parameters'] = JSON.stringify(toolParams);
            }

            let result;
            try {
              result = await handleScript(
                script.filePath,
                toolParams ? [] : ordered,     // still pass positional args for arg()
                process.cwd(),
                false,                         // checkAccess
                '',                            // apiKey
                mcpHeaders,                    // <-- now has the sentinel keys
                true                           // mcpResponse
              );
            } catch (scriptError) {
              log.error(`Error in handleScript for ${script.name}:`, scriptError);
              throw scriptError;
            }
            // ========= NEW CODE (end) =========

            // handleScript returns { data, status, message }
            log.info(`handleScript result keys: ${Object.keys(result || {})}`);

            // Debug the response structure when it contains images
            if (result?.data && typeof result.data === 'object' && 'content' in result.data) {
              const content = (result.data as any).content;
              if (Array.isArray(content)) {
                const hasImage = content.some((item: any) => item?.type === 'image');
                if (hasImage) {
                  log.info('=== Debugging image response ===');
                  debugMCPResponse(result.data);
                  log.info('=== End debug ===');
                }
                
                for (const item of content) {
                  if (item.type === 'image' && item.data && typeof item.data === 'string') {
                    const sizeInMB = (item.data.length / (1024 * 1024)).toFixed(2);
                    log.info(`Returning image content: ${sizeInMB}MB`);
                  }
                }
              }
            }
            if (result?.data && typeof result.data === 'object' && 'content' in result.data) {
              // Check for large responses without stringifying
              const content = (result.data as any).content;
              if (Array.isArray(content)) {
                let estimatedSize = 0;
                for (const item of content) {
                  if (item.type === 'image' && item.data && typeof item.data === 'string') {
                    estimatedSize += item.data.length;
                  } else if (item.type === 'text' && item.text && typeof item.text === 'string') {
                    estimatedSize += item.text.length;
                  }
                }
                if (estimatedSize > 10 * 1024 * 1024) { // 10MB threshold
                  log.warn(`Large response detected: ~${(estimatedSize / (1024 * 1024)).toFixed(2)}MB`);
                }
              }
              
              // Return the data directly - the transport will handle serialization
              log.info('About to return MCP response with content');
              
              // Create a completely clean response by reconstructing the content array
              const cleanContent = [];
              
              if (Array.isArray(result.data.content)) {
                for (const [idx, item] of result.data.content.entries()) {
                  if (item.type === 'image' && item.data && item.mimeType) {
                    log.info(`Content[${idx}]: image with ${item.data.length} chars of base64 data`);
                    // Create a fresh object with no prototype chain
                    cleanContent.push({
                      type: 'image',
                      data: String(item.data), // Ensure it's a primitive string
                      mimeType: String(item.mimeType)
                    });
                  } else if (item.type === 'text' && item.text) {
                    cleanContent.push({
                      type: 'text',
                      text: String(item.text)
                    });
                  } else {
                    // Pass through other types as-is
                    cleanContent.push(item);
                  }
                }
              }
              
              // Create a completely fresh response object
              const response = Object.create(null);
              response.content = cleanContent;
              
              // Copy any additional properties if they exist
              if (result.data.isError !== undefined) response.isError = result.data.isError;
              if (result.data.structuredContent !== undefined) response.structuredContent = result.data.structuredContent;
              if (result.data._meta !== undefined) response._meta = result.data._meta;
              
              return response;
            }

            return {
              content: [
                {
                  type: 'text',
                  text: typeof result.data === 'string' 
                    ? result.data 
                    : (() => {
                        try {
                          // Use the safe dump function for non-string data
                          return dump(result.data);
                        } catch {
                          return '[Unable to serialize response]';
                        }
                      })(),
                },
              ],
            };
          } catch (err) {
            const error = err as Error;
            log.error(`Error executing script ${script.name}`, error);
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
        // Log schema keys instead of full objects to avoid verbose output
        log.debug(`Schema keys for ${script.name}: ${Object.keys(schema).join(', ')}`);
      } catch (err) {
        log.error(`Failed to register tool ${script.name}`, err);
        log.error(`[registerTools] stack for ${script.name}:`, (err as Error)?.stack || err);
      }
    }
    const totalDuration = Date.now() - startTime;
    log.info(`[registerTools] completed registration in ${totalDuration}ms`);
  } catch (err) {
    log.error('Failed to register MCP tools', err);
  }
}

// -----------------------------
// HTTP Handlers
// -----------------------------
async function onRequest(req: IncomingMessage, res: ServerResponse) {
  // Track requests
  mcpRequestCount++;
  res.on('finish', () => {
    if (res.statusCode >= 400) {
      mcpErrorCount++;
    }
  });

  // Handle health check immediately without logging
  if (req.url === '/health') {
    const health = getMcpHealth();
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(health));
    return;
  }

  log.info(`HTTP ${req.method} ${req.url}`);
  log.debug(`Headers: ${Object.keys(req.headers || {}).join(', ')}`);

  // Only handle /mcp endpoint
  if (!req.url?.startsWith('/mcp')) {
    // Handle /ready endpoint to check if scripts are loaded
    if (req.url === '/ready') {
      const isReady = cachedScripts !== null;
      if (isReady) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
          .end(JSON.stringify({ ready: true, scripts: cachedScripts?.length || 0 }));
      } else {
        res.writeHead(503, { 'Content-Type': 'application/json' })
          .end(JSON.stringify({ ready: false, message: 'Scripts still loading' }));
      }
      return;
    }

    // Handle /endpoints to help clients understand available endpoints
    if (req.url === '/endpoints') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({
          endpoints: {
            '/mcp': 'StreamableHTTP transport (POST for initialize, GET/DELETE for sessions)',
            '/sse': 'Server-Sent Events transport (GET only)',
            '/messages': 'SSE message endpoint (POST with sessionId)',
            '/health': 'Health check',
            '/ready': 'Check if scripts are loaded'
          }
        }));
      return;
    }

    // Inspector CLI defaults to /sse for SSE transport
    if (req.url?.startsWith('/sse')) {
      // SSE requires GET method for event stream
      if (req.method === 'GET') {
        try {
          // Establish Event-Source stream for the new client. The second argument MUST be the
          // Response object that will remain open for streaming events.
          const transport = new SSEServerTransport('/messages', res as unknown as ServerResponse);

          // When the HTTP connection closes, make sure to remove the transport.
          const sid = transport.sessionId;
          sseTransports[sid] = transport;
          res.on('close', () => {
            delete sseTransports[sid];
            delete mcpServers[sid];
            log.info(`SSE connection closed – session ${sid}`);
          });

          // Create a new MCP server instance for this SSE session
          // Force refresh scripts for new sessions to pick up any changes
          const server = await createMcpServerForSession(true);
          mcpServers[sid] = server;

          await server.connect(transport);

          log.info(`SSE transport connected. sessionId=${sid}`);
        } catch (err) {
          log.error('Error initializing SSE transport:', err);
          if (!res.headersSent) {
            res.writeHead(500).end('Internal Server Error');
          }
        }
      } else {
        // POST to /sse should initialize SSE differently
        log.warn(`Unexpected ${req.method} to /sse endpoint`);
        res.writeHead(405, { 'Content-Type': 'text/plain' }).end('Method Not Allowed');
      }

      // Connection handled; do not continue processing
      return;
    }

    // ----  SSE /messages endpoint (client → server RPC via POST)  ----
    if (req.url?.startsWith('/messages')) {
      if (req.method !== 'POST') {
        res.writeHead(405).end('Method Not Allowed');
        return;
      }

      try {
        const urlObj = new URL(req.url, 'http://localhost');
        const sid = urlObj.searchParams.get('sessionId') || '';

        const transport = sseTransports[sid];
        if (!transport) {
          res.writeHead(400).end('Bad Request: Unknown sessionId');
          return;
        }

        await transport.handlePostMessage(
          req as unknown as IncomingMessage,
          res as unknown as ServerResponse,
        );
      } catch (err) {
        log.error('Error handling /messages request', err);
        if (!res.headersSent) {
          res.writeHead(500).end('Internal Server Error');
        }
      }

      // /messages handled; do not continue processing
      return;
    }

    res.writeHead(404).end('Not Found');
    return;
  }

  // Determine session
  const sessionIdHeader = req.headers['mcp-session-id'] as string | undefined;
  let transport: StreamableHTTPServerTransport | undefined;
  if (sessionIdHeader && transports[sessionIdHeader]) {
    transport = transports[sessionIdHeader];
  } else if (req.url?.includes('sessionId=')) {
    try {
      const urlObj = new URL(req.url, 'http://localhost');
      const sid = urlObj.searchParams.get('sessionId') || undefined;
      if (sid && transports[sid]) {
        transport = transports[sid];
      }
    } catch { }
  }

  // Fast-path GET or DELETE for existing sessions (SSE stream & termination)
  if (req.method === 'GET' || req.method === 'DELETE') {
    if (!transport) {
      res
        .writeHead(400, {
          'Content-Type': 'application/json',
        })
        .end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Bad Request: No valid session ID provided',
            },
            id: null,
          }),
        );
      return;
    }

    try {
      await transport.handleRequest(req, res, undefined);
    } catch (err) {
      log.error('Transport error (GET/DELETE)', err);
      if (!res.headersSent) {
        res.writeHead(500).end('Internal Server Error');
      }
    }
    return; // GET or DELETE handled, exit
  }

  // Create new transport if needed for initialise
  const chunks: Buffer[] = [];
  req
    .on('data', (chunk) => chunks.push(chunk))
    .on('end', async () => {
      const bodyStr = Buffer.concat(chunks).toString();
      log.debug(`Request body: ${bodyStr.slice(0, 500)}`);
      let bodyJson: unknown;
      try {
        bodyJson = bodyStr ? JSON.parse(bodyStr) : undefined;
      } catch (err) {
        // ignore parse if not needed
      }

      let newSessionId: string | undefined;

      if (!transport) {
        log.debug('No existing transport, will attempt to create new one');
        // Only POST with initialize can create new session
        if (req.method !== 'POST' || !bodyJson || !isInitializeRequest(bodyJson)) {
          res.writeHead(400).end('Bad Request: No existing session');
          return;
        }

        // create transport
        newSessionId = randomUUID();
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => newSessionId!,
          onsessioninitialized: (sid) => {
            log.info(`StreamableHTTP session initialized: ${sid}`);
            if (transport) {
              transports[sid] = transport;
            }
          },
        });

        transport.onclose = () => {
          const sessId = transport?.sessionId;
          log.info(`Transport closed for session ${sessId}`);
          if (sessId) {
            delete transports[sessId];
            delete mcpServers[sessId];
          }
        };

        log.info(`Transport created with pre-assigned session ID: ${newSessionId}`);

        // Create a new MCP server instance for this session
        // Force refresh scripts for new sessions to pick up any changes
        const server = await createMcpServerForSession(true);
        const sessId = transport.sessionId || newSessionId;
        if (sessId) {
          mcpServers[sessId] = server;
        }
        await server.connect(transport);
      }

      try {
        req.headers.accept = 'application/json, text/event-stream';

        // For initialization requests, ensure we add the session ID header
        if (bodyJson && isInitializeRequest(bodyJson)) {
          // Guard against re-patching to prevent stack overflow
          if (!(res as any).__mcpPatched) {
            (res as any).__mcpPatched = true;
            // Override the response to add the Mcp-Session-Id header
            const originalWriteHead = res.writeHead.bind(res);
            res.writeHead = function (statusCode: number, headers?: any) {
              const sessionIdToUse = transport?.sessionId || newSessionId;
              const finalHeaders = {
                ...headers,
                'Mcp-Session-Id': sessionIdToUse
              };
              log.info(`Returning Mcp-Session-Id: ${sessionIdToUse} for initialization`);
              return originalWriteHead.call(this, statusCode, finalHeaders);
            };
          }
        }

        log.debug('Passing request to transport.handleRequest');
        log.debug(`Transport session: ${transport.sessionId}, method: ${req.method}`);
        await transport.handleRequest(req, res, bodyJson as Record<string, unknown> | undefined);
        log.debug(`Request handled for session ${transport.sessionId}`);
      } catch (err) {
        log.error('Transport error', err);
        if (!res.headersSent) {
          res.writeHead(500).end('Internal Server Error');
        }
      }
    });
}

export async function startMcpHttpServer(): Promise<void> {
  const startTime = Date.now();
  if (httpServer) {
    log.warn('MCP HTTP server already running');
    return;
  }

  log.info('Starting MCP HTTP server...');

  const port = getMcpPort();

  httpServer = http.createServer(onRequest);

  // Add error handling for server startup
  httpServer.on('error', (err) => {
    log.error('MCP HTTP server error:', err);
  });

  httpServer.listen(port, '127.0.0.1', () => {
    const totalDuration = Date.now() - startTime;
    mcpStartTime = new Date();
    log.info(`MCP HTTP server listening on http://localhost:${port}/mcp (startup took ${totalDuration}ms)`);
    log.debug(`Environment KIT_MCP_PORT=${process.env.KIT_MCP_PORT}`);

    // Pre-load MCP scripts asynchronously after server is ready
    setImmediate(async () => {
      const preloadStart = Date.now();
      try {
        const scripts = await mcpService.getMCPScripts();
        cachedScripts = scripts; // Populate cache
        cacheTimestamp = Date.now(); // Set cache timestamp
        const preloadDuration = Date.now() - preloadStart;
        log.info(`Pre-loaded ${scripts.length} MCP scripts in ${preloadDuration}ms`);
      } catch (error) {
        log.error('Failed to pre-load MCP scripts:', error);
      }
    });

    // Verify server is actually accepting connections
    const testReq = http.get(`http://127.0.0.1:${port}/health`, (res) => {
      if (res.statusCode === 200) {
        log.info('MCP HTTP server health check passed - ready for connections');
      }
    });
    testReq.on('error', (err) => {
      log.error('MCP HTTP server health check failed:', err);
    });
    testReq.end();
  });
}

export function stopMcpHttpServer() {
  if (httpServer) {
    httpServer.close(() => {
      log.info('MCP HTTP server stopped');
    });
    httpServer = null;
    mcpStartTime = null;
    mcpRequestCount = 0;
    mcpErrorCount = 0;
  }
}

// Get MCP server health information
export function getMcpHealth() {
  if (!httpServer || !mcpStartTime) {
    return {
      status: 'stopped',
      uptime: 0,
      requests: 0,
      errors: 0,
      sessions: 0,
      scripts: 0,
    };
  }

  const uptimeMs = Date.now() - mcpStartTime.getTime();
  const uptimeSeconds = Math.floor(uptimeMs / 1000);
  const uptimeMinutes = Math.floor(uptimeSeconds / 60);
  const uptimeHours = Math.floor(uptimeMinutes / 60);

  const activeSessions = Object.keys(mcpServers).length + Object.keys(sseTransports).length;

  return {
    status: 'running',
    uptime: {
      ms: uptimeMs,
      seconds: uptimeSeconds,
      minutes: uptimeMinutes,
      hours: uptimeHours,
      formatted: uptimeHours > 0
        ? `${uptimeHours}h ${uptimeMinutes % 60}m`
        : uptimeMinutes > 0
          ? `${uptimeMinutes}m ${uptimeSeconds % 60}s`
          : `${uptimeSeconds}s`,
    },
    requests: mcpRequestCount,
    errors: mcpErrorCount,
    sessions: activeSessions,
    scripts: cachedScripts?.length || 0,
    port: getMcpPort(),
    url: `http://localhost:${getMcpPort()}/mcp`,
  };
}
