import { describe, it, expect } from 'vitest';
import { extractArgPlaceholders } from './arg-placeholder-parser';

// Mock script from user showing various arg() usages
const mockScript = `
import "@johnlindquist/kit"

// Script Kit will prompt for these if not provided via MCP
const name = await arg("What's your name?")
const age = await arg("What's your age?")
const favoriteColor = await arg({
    placeholder: "What's your favorite color?",
    choices: ["red", "blue", "green", "yellow", "purple"]
})
`;

describe('extractArgPlaceholders', () => {
  it('should detect three args and capture placeholder from config object', async () => {
    const placeholders = await extractArgPlaceholders(mockScript);
    expect(placeholders.length).toBe(3);
    expect(placeholders[0]).toEqual({ name: 'arg1', placeholder: "What's your name?" });
    expect(placeholders[1]).toEqual({ name: 'arg2', placeholder: "What's your age?" });
    expect(placeholders[2]).toEqual({ name: 'arg3', placeholder: "What's your favorite color?" });
  });
});
