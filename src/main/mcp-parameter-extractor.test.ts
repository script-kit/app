import { describe, it, expect } from 'vitest';
import { extractMCPToolParameters } from './mcp-parameter-extractor';

const script = `
import "@johnlindquist/kit"
const name = await arg("What's your name?")
const age = await arg("What's your age?")
const favoriteColor = await arg({ placeholder: "What's your favorite color?", choices: ["red","blue"] })
`;

describe('extractMCPToolParameters', () => {
    it('should return variable names with placeholders', async () => {
        const params = await extractMCPToolParameters(script);
        expect(params).toEqual([
            { name: 'name', placeholder: "What's your name?" },
            { name: 'age', placeholder: "What's your age?" },
            { name: 'favoriteColor', placeholder: "What's your favorite color?" },
        ]);
    });

    describe('tool() function parsing', () => {
        it('should extract tool config from plain tool() call', async () => {
            const code = `
import "@johnlindquist/kit"

const result = await tool({
    name: "plain-tool",
    description: "A plain tool",
    parameters: {
        input: {
            type: "string",
            description: "Input string",
        },
    },
});
`;

            const result = await extractMCPToolParameters(code);
            
            expect(result).toHaveProperty('toolConfig');
            expect((result as any).toolConfig).toMatchObject({
                name: 'plain-tool',
                description: 'A plain tool',
            });
        });

        it('should extract tool config from tool() with as MCPTool type assertion', async () => {
            const code = `
// Name: Testing MCP Tool
// mcp: testing-mcp-tool

import "@johnlindquist/kit"

const result = await tool({
    name: "testing-mcp-tool",
    description: "A tool for testing MCP",
    parameters: {
        text: {
            type: "string",
            description: "Just give me any string",
            default: "Hello, world!",
        },
        number: {
            type: "number",
            description: "Just give me any number",
            default: 100,
        },
    },
} as MCPTool);
`;

            const result = await extractMCPToolParameters(code);
            
            expect(result).toHaveProperty('toolConfig');
            expect((result as any).toolConfig).toMatchObject({
                name: 'testing-mcp-tool',
                description: 'A tool for testing MCP',
                parameters: {
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
        });
    });
});
