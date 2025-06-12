import { readFile } from 'node:fs/promises';
import { getScripts } from '@johnlindquist/kit/core/db';
import type { Script } from '@johnlindquist/kit/types/core';
import { extractMCPToolParameters } from './mcp-parameter-extractor';
import { mcpLog as log } from './logs';

export interface MCPScript {
  name: string;
  filePath: string;
  description: string;
  mcp: string;
  args: Array<{
    name: string;
    placeholder: string | null;
  }>;
}

class MCPService {
  private mcpScripts: MCPScript[] = [];
  private lastRefresh = 0;
  private refreshInterval = 60000; // 1 minute cache

  async getMCPScripts(force = false): Promise<MCPScript[]> {
    const startTime = Date.now();
    log.info(`[getMCPScripts] force? ${force}`);
    const now = Date.now();

    // Return cached scripts if fresh
    if (!force && this.mcpScripts.length > 0 && now - this.lastRefresh < this.refreshInterval) {
      log.info(`[getMCPScripts] returning cached list (${this.mcpScripts.length})`);
      return this.mcpScripts;
    }

    try {
      log.info('[getMCPScripts] fetching scripts from kit db…');
      // Get all scripts
      const dbStart = Date.now();
      const allScripts = await getScripts(false);
      const dbDuration = Date.now() - dbStart;
      log.info(`[getMCPScripts] loaded ${allScripts.length} total scripts from db in ${dbDuration}ms`);

      // Filter MCP-enabled scripts
      const mcpScripts = allScripts.filter((script: Script) => script.mcp);
      log.info(`[getMCPScripts] found ${mcpScripts.length} mcp-enabled scripts`);

      // Process each script to extract args
      const processStart = Date.now();
      const processedScripts = await Promise.all(
        mcpScripts.map(async (script) => {
          log.info(`[getMCPScripts] processing script ${script.filePath}`);
          try {
            // Read script content
            const content = await readFile(script.filePath, 'utf-8');

            // Extract arg placeholders using AST parser
            const placeholders = await extractMCPToolParameters(content);

            log.info(`[getMCPScripts] placeholders: ${JSON.stringify(placeholders)}`);

            // Determine tool name
            const toolName = typeof script.mcp === 'string' ? script.mcp : script.command;

            return {
              name: toolName,
              filePath: script.filePath,
              description: script.description || `Run the ${script.name} script`,
              mcp: script.mcp,
              args: placeholders,
            };
          } catch (error) {
            log.error(`Failed to process MCP script ${script.filePath}:`, error);
            return null;
          }
        }),
      );

      // Filter out failed scripts
      this.mcpScripts = processedScripts.filter((script): script is MCPScript => script !== null);
      this.lastRefresh = now;

      const processDuration = Date.now() - processStart;
      const totalDuration = Date.now() - startTime;
      log.info(`Found ${this.mcpScripts.length} MCP-enabled scripts after processing (process: ${processDuration}ms, total: ${totalDuration}ms`);

      return this.mcpScripts;
    } catch (error) {
      log.error('Failed to get MCP scripts:', error);
      throw error;
    }
  }

  async getMCPScript(name: string): Promise<MCPScript | undefined> {
    const scripts = await this.getMCPScripts();
    return scripts.find((script) => script.name === name);
  }

  clearCache(): void {
    this.mcpScripts = [];
    this.lastRefresh = 0;
  }
}

// Export singleton instance
export const mcpService = new MCPService();
