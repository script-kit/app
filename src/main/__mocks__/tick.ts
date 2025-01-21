import { vi } from 'vitest';

export const subs = [];

export const addSnippet = vi.fn();
export const removeSnippet = vi.fn();
export const addTextSnippet = vi.fn();

export const subSnippet = vi.fn();
export const subIsTyping = vi.fn();

export const snippetMap = new Map();
