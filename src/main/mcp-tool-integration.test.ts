import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractMCPToolParameters } from './mcp-parameter-extractor';

describe('MCP Tool Integration', () => {
  describe('extractMCPToolParameters', () => {
    it('should extract tool() configuration', async () => {
      const code = `
        import "@johnlindquist/kit"
        
        const { operation, a, b } = await tool({
          name: "calculator",
          description: "Perform calculations",
          parameters: {
            operation: {
              type: "string",
              enum: ["add", "subtract"],
              required: true
            },
            a: { type: "number", required: true },
            b: { type: "number", required: true }
          }
        })
      `;

      const result = await extractMCPToolParameters(code);
      
      expect(result).toHaveProperty('toolConfig');
      if ('toolConfig' in result) {
        expect(result.toolConfig).toEqual({
          name: "calculator",
          description: "Perform calculations",
          parameters: {
            operation: {
              type: "string",
              enum: ["add", "subtract"],
              required: true
            },
            a: { type: "number", required: true },
            b: { type: "number", required: true }
          }
        });
      }
    });

    it('should extract traditional arg() calls', async () => {
      const code = `
        import "@johnlindquist/kit"
        
        const name = await arg("Enter your name")
        const age = await arg({
          placeholder: "Enter your age"
        })
      `;

      const result = await extractMCPToolParameters(code);
      
      expect(Array.isArray(result)).toBe(true);
      if (Array.isArray(result)) {
        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
          name: "name",
          placeholder: "Enter your name"
        });
        expect(result[1]).toEqual({
          name: "age",
          placeholder: "Enter your age"
        });
      }
    });

    it('should handle complex object literals in tool config', async () => {
      const code = `
        await tool({
          name: "file-creator",
          parameters: {
            path: {
              type: "string",
              pattern: "^[a-zA-Z0-9_\\-\\/\\.]+$"
            },
            options: {
              type: "object",
              properties: {
                encoding: {
                  type: "string",
                  enum: ["utf8", "base64"],
                  default: "utf8"
                }
              }
            }
          }
        })
      `;

      const result = await extractMCPToolParameters(code);
      
      expect(result).toHaveProperty('toolConfig');
      if ('toolConfig' in result) {
        expect(result.toolConfig.parameters.path.pattern).toBe("^[a-zA-Z0-9_-/.]+$");
        expect(result.toolConfig.parameters.options.type).toBe("object");
        expect(result.toolConfig.parameters.options.properties).toEqual({
          encoding: {
            type: "string",
            enum: ["utf8", "base64"],
            default: "utf8"
          }
        });
      }
    });
  });
});