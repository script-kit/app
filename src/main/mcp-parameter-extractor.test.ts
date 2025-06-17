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

    describe('params() function parsing', () => {
        it('should extract inputSchema from params() call', async () => {
            const code = `
import "@johnlindquist/kit"

const result = await params({
    type: "object",
    properties: {
        input: {
            type: "string",
            description: "Input string",
        },
        count: {
            type: "number",
            description: "Count value",
            default: 10,
        },
    },
    required: ["input"]
});
`;

            const result = await extractMCPToolParameters(code);

            expect(result).toHaveProperty('inputSchema');
            expect((result as any).inputSchema).toMatchObject({
                type: 'object',
                properties: {
                    input: {
                        type: 'string',
                        description: 'Input string',
                    },
                    count: {
                        type: 'number',
                        description: 'Count value',
                        default: 10,
                    },
                },
                required: ['input']
            });
        });

        it('should extract inputSchema from params() with TypeScript generics', async () => {
            const code = `
// Name: Testing MCP Params
// mcp: testing-mcp-params

import "@johnlindquist/kit"

interface MyParams {
    text: string
    number: number
}

const result = await params<MyParams>({
    type: "object",
    properties: {
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
});
`;

            const result = await extractMCPToolParameters(code);

            expect(result).toHaveProperty('inputSchema');
            expect((result as any).inputSchema).toMatchObject({
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
        });
    });

    describe('simple schema extraction', () => {
        it('should extract and expand simple params schema', async () => {
            const code = `
import "@johnlindquist/kit"

const result = await params({
    name: "Your full name",
    age: 21,
    agree: true,
    isStudent: {
        type: "boolean",
        description: "Are you a student?"
    },
    dates: {
        type: "array",
        description: "Enter your dates",
        items: { type: "string" }
    }
})
`;
            const result = await extractMCPToolParameters(code);
            expect(result).toHaveProperty('inputSchema');
            const { inputSchema } = result as any;
            expect(inputSchema).toMatchObject({
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Your full name' },
                    age: { type: 'number', description: '21', default: 21 },
                    agree: { type: 'boolean', description: '', default: true },
                    isStudent: { type: 'boolean', description: 'Are you a student?' },
                    dates: { type: 'array', description: 'Enter your dates', items: { type: 'string' } }
                },
                required: ['name', 'age', 'agree', 'isStudent', 'dates']
            });
        });
    });

    describe('simple schema extraction with as const', () => {
        it('should extract and expand simple params schema with as const', async () => {
            const code = `
import "@johnlindquist/kit"

const result = await params({
    name: "Enter your name",
    age: {
        type: "number",
        description: "Enter your age"
    },
    isStudent: {
        type: "boolean",
        description: "Are you a student?"
    },
    dates: {
        type: "array",
        description: "Enter your dates",
        items: {
            type: "string",
        }
    }
} as const)
`;
            const result = await extractMCPToolParameters(code);
            expect(result).toHaveProperty('inputSchema');
            const { inputSchema } = result as any;
            expect(inputSchema).toMatchObject({
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Enter your name' },
                    age: { type: 'number', description: 'Enter your age' },
                    isStudent: { type: 'boolean', description: 'Are you a student?' },
                    dates: { type: 'array', description: 'Enter your dates', items: { type: 'string' } }
                },
                required: ['name', 'age', 'isStudent', 'dates']
            });
        });
    });
});
