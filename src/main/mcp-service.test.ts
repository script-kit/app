import { readFile } from 'node:fs/promises';
import { getScripts } from '@johnlindquist/kit/core/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mcpService } from './mcp-service';

// Mock dependencies
vi.mock('@johnlindquist/kit/core/db');
vi.mock('fs/promises');
vi.mock('./log-utils', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}));

describe('MCP Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mcpService.clearCache();
  });

  describe('getMCPScripts', () => {
    it('should return MCP-enabled scripts with parsed args', async () => {
      const mockScripts = [
        {
          name: 'test-script',
          command: 'test-script',
          filePath: '/path/to/test-script.js',
          description: 'Test script',
          mcp: 'test-tool',
        },
        {
          name: 'non-mcp-script',
          command: 'non-mcp',
          filePath: '/path/to/non-mcp.js',
          description: 'Non-MCP script',
          mcp: undefined,
        },
      ];

      vi.mocked(getScripts).mockResolvedValue(mockScripts as any);
      vi.mocked(readFile).mockResolvedValue(`
        const arg1 = await arg("Enter arg1");
        const arg2 = await arg({ placeholder: "Enter arg2" });
      `);

      const result = await mcpService.getMCPScripts();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: 'test-tool',
        filePath: '/path/to/test-script.js',
        description: 'Test script',
        mcp: 'test-tool',
        args: [
          { name: 'arg1', placeholder: 'Enter arg1' },
          { name: 'arg2', placeholder: 'Enter arg2' },
        ],
      });

      expect(getScripts).toHaveBeenCalledWith(false);
      expect(readFile).toHaveBeenCalledWith('/path/to/test-script.js', 'utf-8');
    });

    it('should use cached scripts when not forced', async () => {
      const mockScripts = [
        {
          name: 'cached-script',
          command: 'cached',
          filePath: '/path/to/cached.js',
          description: 'Cached script',
          mcp: 'cached-tool',
        },
      ];

      vi.mocked(getScripts).mockResolvedValue(mockScripts as any);
      vi.mocked(readFile).mockResolvedValue('script content');

      // First call
      await mcpService.getMCPScripts();

      // Second call should use cache
      const result = await mcpService.getMCPScripts();

      expect(result).toHaveLength(1);
      expect(getScripts).toHaveBeenCalledTimes(1); // Only called once
    });

    it('should force refresh when requested', async () => {
      const mockScripts = [
        {
          name: 'script',
          command: 'script',
          filePath: '/path/to/script.js',
          description: 'Script',
          mcp: true,
        },
      ];

      vi.mocked(getScripts).mockResolvedValue(mockScripts as any);
      vi.mocked(readFile).mockResolvedValue('script content');

      // First call
      await mcpService.getMCPScripts();

      // Force refresh
      await mcpService.getMCPScripts(true);

      expect(getScripts).toHaveBeenCalledTimes(2);
    });

    it('should handle script processing errors gracefully', async () => {
      const mockScripts = [
        {
          name: 'good-script',
          command: 'good',
          filePath: '/path/to/good.js',
          description: 'Good script',
          mcp: 'good-tool',
        },
        {
          name: 'bad-script',
          command: 'bad',
          filePath: '/path/to/bad.js',
          description: 'Bad script',
          mcp: 'bad-tool',
        },
      ];

      vi.mocked(getScripts).mockResolvedValue(mockScripts as any);
      vi.mocked(readFile).mockResolvedValueOnce('good content').mockRejectedValueOnce(new Error('File not found'));

      const result = await mcpService.getMCPScripts();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('good-tool');
    });
  });

  describe('getMCPScript', () => {
    it('should return specific MCP script by name', async () => {
      const mockScripts = [
        {
          name: 'script1',
          command: 'script1',
          filePath: '/path/to/script1.js',
          description: 'Script 1',
          mcp: 'tool1',
        },
        {
          name: 'script2',
          command: 'script2',
          filePath: '/path/to/script2.js',
          description: 'Script 2',
          mcp: 'tool2',
        },
      ];

      vi.mocked(getScripts).mockResolvedValue(mockScripts as any);
      vi.mocked(readFile).mockResolvedValue('script content');

      const result = await mcpService.getMCPScript('tool2');

      expect(result).toBeDefined();
      expect(result?.name).toBe('tool2');
    });

    it('should return undefined for non-existent script', async () => {
      vi.mocked(getScripts).mockResolvedValue([]);

      const result = await mcpService.getMCPScript('non-existent');

      expect(result).toBeUndefined();
    });
  });
});
