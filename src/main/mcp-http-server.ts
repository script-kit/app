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
// Server state
// -----------------------------
let httpServer: http.Server | null = null;

const transports: Record<string, StreamableHTTPServerTransport> = {};

// Map of MCP server instances per session
const mcpServers: Record<string, McpServer> = {};

// Active SSE transports keyed by sessionId (supports multiple concurrent SSE clients)
const sseTransports: Record<string, SSEServerTransport> = {};

// Cache for script metadata to speed up server creation
let cachedScripts: MCPScript[] | null = null;

// =====================
// Verbose logging helper
// =====================
function dump(obj: unknown) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

async function createMcpServerForSession(): Promise<McpServer> {
  const startTime = Date.now();
  log.info('Creating new MCP server instance for session…');
  log.debug(`Process PID: ${process.pid}`);

  const server = new McpServer({
    name: 'script-kit',
    version: '1.0.0',
  });

  await registerToolsForServer(server);
  const duration = Date.now() - startTime;
  log.info(`MCP server instance created in ${duration}ms`);
  return server;
}

async function registerToolsForServer(server: McpServer, forceRefresh = false) {
  const startTime = Date.now();
  log.info('[registerTools] start for server instance');
  try {
    // Use cached scripts if available and not forcing refresh
    let scripts: MCPScript[];
    if (!forceRefresh && cachedScripts) {
      scripts = cachedScripts;
      log.info(`Using cached MCP scripts (${scripts.length} scripts)`);
    } else {
      log.info(`Loading MCP scripts${forceRefresh ? ' (force refresh)' : ''}`);
      scripts = await mcpService.getMCPScripts(forceRefresh);
      cachedScripts = scripts; // Update cache
    }
    const loadDuration = Date.now() - startTime;

    log.info(`[registerTools] loaded ${scripts.length} scripts in ${loadDuration}ms`);

    for (const script of scripts) {
      log.info(`[registerTools] registering script: ${script.name}`);
      try {
        const schema = createToolSchema(script.args);

        // Register tool with this specific MCP server instance
        server.tool(script.name, script.description || "No description metadata provided", schema, async (params: Record<string, string>) => {
          log.info(`Executing MCP tool ${script.name}`);
          log.info(`Raw params: ${dump(params)}`);

          // Assemble ordered args
          const ordered: string[] = [];
          for (let i = 0; i < script.args.length; i++) {
            const meta = script.args[i];
            const key = meta.name?.trim() ? meta.name : `arg${i + 1}`;
            ordered.push(params[key] ?? UNDEFINED_VALUE);
          }

          try {
            const result = await handleScript(script.filePath, ordered, process.cwd(), false, '', {}, true);

            // handleScript returns { data, status, message }
            log.info(`handleScript result keys: ${Object.keys(result || {})}`);
            if (result?.data && typeof result.data === 'object' && 'content' in result.data) {
              return result.data;
            }

            return {
              content: [
                {
                  type: 'text',
                  text: typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2),
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
  // Handle health check immediately without logging
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
    return;
  }
  
  log.info(`HTTP ${req.method} ${req.url}`);
  log.debug(`Headers: ${dump(req.headers)}`);

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
          const server = await createMcpServerForSession();
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

      if (!transport) {
        log.debug('No existing transport, will attempt to create new one');
        // Only POST with initialize can create new session
        if (req.method !== 'POST' || !bodyJson || !isInitializeRequest(bodyJson)) {
          res.writeHead(400).end('Bad Request: No existing session');
          return;
        }

        // create transport
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
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

        log.info(`Transport created for session ${transport.sessionId}`);

        // Create a new MCP server instance for this session
        const server = await createMcpServerForSession();
        const sessId = transport.sessionId;
        if (sessId) {
          mcpServers[sessId] = server;
        }
        await server.connect(transport);
      }

      try {
        req.headers.accept = 'application/json, text/event-stream';

        log.debug('Passing request to transport.handleRequest');
        await transport.handleRequest(req, res, bodyJson as Record<string, unknown> | undefined);
      } catch (err) {
        log.error('Transport error', err);
        res.writeHead(500).end('Internal Server Error');
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
    log.info(`MCP HTTP server listening on http://localhost:${port}/mcp (startup took ${totalDuration}ms)`);
    log.debug(`Environment KIT_MCP_PORT=${process.env.KIT_MCP_PORT}`);
    
    // Pre-load MCP scripts asynchronously after server is ready
    setImmediate(async () => {
      const preloadStart = Date.now();
      try {
        const scripts = await mcpService.getMCPScripts();
        cachedScripts = scripts; // Populate cache
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
  }
}
