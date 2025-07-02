import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Mock electron before importing modules that use it
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(),
    getName: vi.fn(() => 'ScriptKit'),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
  clipboard: {
    readText: vi.fn(),
    writeText: vi.fn(),
  },
  shell: {
    openPath: vi.fn(),
  },
  Notification: vi.fn(),
}));

vi.mock('electron-context-menu', () => ({
  default: vi.fn(),
}));

vi.mock('electron-log', () => ({
  default: {
    create: vi.fn(() => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
      silly: vi.fn(),
    })),
  },
}));

// Mock dependencies
vi.mock('node:fs/promises');
vi.mock('./tick', () => ({
  removeSnippet: vi.fn(),
  addTextSnippet: vi.fn(),
}));
vi.mock('./logs', () => ({
  watcherLog: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// Now import the modules after mocks are set up
import { handleSnippetFileChange } from './watcher';
import { removeSnippet, addTextSnippet } from './tick';

describe('handleSnippetFileChange', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call removeSnippet when event is unlink', async () => {
    const snippetPath = '/test/snippets/test.txt';
    
    await handleSnippetFileChange('unlink', snippetPath);
    
    expect(removeSnippet).toHaveBeenCalledWith(snippetPath);
    expect(addTextSnippet).not.toHaveBeenCalled();
  });

  it('should call addTextSnippet when event is add', async () => {
    const snippetPath = '/test/snippets/test.txt';
    
    await handleSnippetFileChange('add', snippetPath);
    
    expect(addTextSnippet).toHaveBeenCalledWith(snippetPath);
    expect(removeSnippet).not.toHaveBeenCalled();
  });

  it('should call addTextSnippet when event is change', async () => {
    const snippetPath = '/test/snippets/test.txt';
    
    await handleSnippetFileChange('change', snippetPath);
    
    expect(addTextSnippet).toHaveBeenCalledWith(snippetPath);
    expect(removeSnippet).not.toHaveBeenCalled();
  });

  it('should handle .txt files with snippet metadata', async () => {
    const snippetPath = '/test/snippets/hello.txt';
    const fileContent = `# Snippet: hello
# Description: Test snippet

Hello, world!`;

    vi.mocked(readFile).mockResolvedValue(fileContent);
    
    await handleSnippetFileChange('add', snippetPath);
    
    expect(addTextSnippet).toHaveBeenCalledWith(snippetPath);
  });

  it('should handle .txt files with postfix snippet metadata', async () => {
    const snippetPath = '/test/snippets/expand.txt';
    const fileContent = `// Snippet: *expand
// Description: Postfix expansion snippet

This text will expand after typing`;

    vi.mocked(readFile).mockResolvedValue(fileContent);
    
    await handleSnippetFileChange('add', snippetPath);
    
    expect(addTextSnippet).toHaveBeenCalledWith(snippetPath);
  });

  it('should handle files with both comment formats', async () => {
    const snippetPath1 = '/test/snippets/hash-comment.txt';
    const snippetPath2 = '/test/snippets/slash-comment.txt';
    
    await handleSnippetFileChange('add', snippetPath1);
    await handleSnippetFileChange('add', snippetPath2);
    
    expect(addTextSnippet).toHaveBeenCalledTimes(2);
    expect(addTextSnippet).toHaveBeenCalledWith(snippetPath1);
    expect(addTextSnippet).toHaveBeenCalledWith(snippetPath2);
  });

  it('should handle file paths with spaces', async () => {
    const snippetPath = '/test/snippets/my snippet file.txt';
    
    await handleSnippetFileChange('add', snippetPath);
    
    expect(addTextSnippet).toHaveBeenCalledWith(snippetPath);
  });

  it('should handle removing and re-adding the same file', async () => {
    const snippetPath = '/test/snippets/test.txt';
    
    // First add
    await handleSnippetFileChange('add', snippetPath);
    expect(addTextSnippet).toHaveBeenCalledWith(snippetPath);
    
    // Remove
    await handleSnippetFileChange('unlink', snippetPath);
    expect(removeSnippet).toHaveBeenCalledWith(snippetPath);
    
    // Re-add
    await handleSnippetFileChange('add', snippetPath);
    expect(addTextSnippet).toHaveBeenCalledTimes(2);
  });

  it('should handle multiple snippet files in sequence', async () => {
    const snippetPaths = [
      '/test/snippets/snippet1.txt',
      '/test/snippets/snippet2.txt',
      '/test/snippets/snippet3.txt',
    ];
    
    for (const path of snippetPaths) {
      await handleSnippetFileChange('add', path);
    }
    
    expect(addTextSnippet).toHaveBeenCalledTimes(3);
    snippetPaths.forEach((path) => {
      expect(addTextSnippet).toHaveBeenCalledWith(path);
    });
  });

  it('should handle changing a file multiple times', async () => {
    const snippetPath = '/test/snippets/test.txt';
    
    await handleSnippetFileChange('add', snippetPath);
    await handleSnippetFileChange('change', snippetPath);
    await handleSnippetFileChange('change', snippetPath);
    
    expect(addTextSnippet).toHaveBeenCalledTimes(3);
    expect(addTextSnippet).toHaveBeenCalledWith(snippetPath);
  });

  it('should not process other event types', async () => {
    const snippetPath = '/test/snippets/test.txt';
    
    // These events should be ignored
    await handleSnippetFileChange('addDir' as any, snippetPath);
    await handleSnippetFileChange('unlinkDir' as any, snippetPath);
    
    expect(addTextSnippet).not.toHaveBeenCalled();
    expect(removeSnippet).not.toHaveBeenCalled();
  });
});