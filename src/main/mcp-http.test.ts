import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleScript } from './handleScript';
import { mcpService } from './mcp-service';
import type { MCPScript } from './mcp-service';

// Mock dependencies
vi.mock('./mcp-service');
vi.mock('./handleScript');
vi.mock('./logs', () => ({
  serverLog: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock state
vi.mock('./state', () => ({
  kitState: {
    serverRunning: false,
    kenvEnv: {},
  },
}));

describe('MCP HTTP Endpoints', () => {
  let app: express.Application;

  beforeEach(() => {
    // Create a minimal Express app with just MCP routes
    app = express();
    app.use(express.json());

    // Add MCP routes (copied from server.ts)
    app.get('/api/mcp/scripts', async (_req, res, next) => {
      try {
        const scripts = await mcpService.getMCPScripts();
        res.json({ scripts });
      } catch (error) {
        next(error);
      }
    });

    app.post('/api/mcp/execute', async (req, res, next) => {
      try {
        const { script, args = [] } = req.body;

        if (!script) {
          return res.status(400).json({ error: 'Script name is required' });
        }

        const mcpScript = await mcpService.getMCPScript(script);
        if (!mcpScript) {
          return res.status(404).json({ error: `MCP script '${script}' not found` });
        }

        const result = await handleScript(mcpScript.filePath, args, process.cwd(), false, '', {}, true);

        if (result.data) {
          res.json(result.data);
        } else if (result.message) {
          res.status(result.status || 500).json({ error: result.message });
        } else {
          res.status(500).json({ error: 'No response from script' });
        }
      } catch (error) {
        next(error);
      }
    });

    // Add error handler
    app.use((err: any, _req: any, res: any, _next: any) => {
      res.status(500).json({ error: err.message });
    });

    // Clear all mocks
    vi.clearAllMocks();
  });

  describe('GET /api/mcp/scripts', () => {
    it('should return list of MCP scripts', async () => {
      const mockScripts: MCPScript[] = [
        {
          name: 'test-tool',
          filePath: '/path/to/test-tool.js',
          description: 'Test tool description',
          mcp: 'test-tool',
          args: [
            { name: 'name', placeholder: 'Enter name' },
            { name: 'age', placeholder: 'Enter age' },
          ],
        },
      ];

      vi.mocked(mcpService.getMCPScripts).mockResolvedValue(mockScripts);

      const response = await request(app).get('/api/mcp/scripts').expect(200);

      expect(response.body).toEqual({ scripts: mockScripts });
      expect(mcpService.getMCPScripts).toHaveBeenCalledOnce();
    });

    it('should handle errors when getting scripts', async () => {
      vi.mocked(mcpService.getMCPScripts).mockRejectedValue(new Error('Database error'));

      const response = await request(app).get('/api/mcp/scripts').expect(500);

      expect(response.body).toEqual({ error: 'Database error' });
    });
  });

  describe('POST /api/mcp/execute', () => {
    const mockScript: MCPScript = {
      name: 'test-tool',
      filePath: '/path/to/test-tool.js',
      description: 'Test tool',
      mcp: 'test-tool',
      args: [],
    };

    it('should execute MCP script and return result', async () => {
      vi.mocked(mcpService.getMCPScript).mockResolvedValue(mockScript);
      vi.mocked(handleScript).mockResolvedValue({
        status: 200,
        data: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ result: 'success' }),
            },
          ],
        },
      });

      const response = await request(app)
        .post('/api/mcp/execute')
        .send({ script: 'test-tool', args: ['arg1', 'arg2'] })
        .expect(200);

      expect(response.body).toEqual({
        content: [
          {
            type: 'text',
            text: JSON.stringify({ result: 'success' }),
          },
        ],
      });

      expect(mcpService.getMCPScript).toHaveBeenCalledWith('test-tool');
      expect(handleScript).toHaveBeenCalledWith(
        '/path/to/test-tool.js',
        ['arg1', 'arg2'],
        process.cwd(),
        false,
        '',
        {},
        true,
      );
    });

    it('should return 400 if script name is missing', async () => {
      const response = await request(app)
        .post('/api/mcp/execute')
        .send({ args: ['arg1'] })
        .expect(400);

      expect(response.body).toEqual({ error: 'Script name is required' });
      expect(mcpService.getMCPScript).not.toHaveBeenCalled();
    });

    it('should return 404 if script not found', async () => {
      vi.mocked(mcpService.getMCPScript).mockResolvedValue(undefined);

      const response = await request(app).post('/api/mcp/execute').send({ script: 'non-existent' }).expect(404);

      expect(response.body).toEqual({ error: "MCP script 'non-existent' not found" });
      expect(handleScript).not.toHaveBeenCalled();
    });

    it('should handle script execution errors', async () => {
      vi.mocked(mcpService.getMCPScript).mockResolvedValue(mockScript);
      vi.mocked(handleScript).mockResolvedValue({
        status: 500,
        message: 'Script execution failed',
      });

      const response = await request(app).post('/api/mcp/execute').send({ script: 'test-tool' }).expect(500);

      expect(response.body).toEqual({ error: 'Script execution failed' });
    });

    it('should handle unexpected errors', async () => {
      vi.mocked(mcpService.getMCPScript).mockRejectedValue(new Error('Unexpected error'));

      const response = await request(app).post('/api/mcp/execute').send({ script: 'test-tool' }).expect(500);

      expect(response.body).toEqual({ error: 'Unexpected error' });
    });

    it('should handle empty response from script', async () => {
      vi.mocked(mcpService.getMCPScript).mockResolvedValue(mockScript);
      vi.mocked(handleScript).mockResolvedValue({
        status: 200,
        // No data or message
      });

      const response = await request(app).post('/api/mcp/execute').send({ script: 'test-tool' }).expect(500);

      expect(response.body).toEqual({ error: 'No response from script' });
    });
  });

  describe('Integration Tests', () => {
    it('should execute script with complex arguments', async () => {
      const complexScript: MCPScript = {
        name: 'complex-tool',
        filePath: '/path/to/complex.js',
        description: 'Complex tool',
        mcp: 'complex-tool',
        args: [
          { name: 'data', placeholder: 'JSON data' },
          { name: 'options', placeholder: 'Options' },
        ],
      };

      vi.mocked(mcpService.getMCPScript).mockResolvedValue(complexScript);
      vi.mocked(handleScript).mockResolvedValue({
        status: 200,
        data: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  processed: true,
                  timestamp: '2024-01-01T00:00:00Z',
                },
                null,
                2,
              ),
            },
          ],
        },
      });

      const response = await request(app)
        .post('/api/mcp/execute')
        .send({
          script: 'complex-tool',
          args: [JSON.stringify({ key: 'value' }), 'option1,option2'],
        })
        .expect(200);

      expect(response.body.content[0].text).toContain('"processed": true');
    });
  });
});
