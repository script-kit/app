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
});
