import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { addTextSnippet, snippetMap, parseSnippet } from './tick';

// Mock dependencies
vi.mock('node:fs/promises');
vi.mock('./logs', () => ({
  tickLog: {
    info: vi.fn(),
    verbose: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
  snippetLog: {
    info: vi.fn(),
    silly: vi.fn(),
    error: vi.fn(),
  },
}));

describe('addTextSnippet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear the snippet map before each test
    snippetMap.clear();
  });

  it('should add a text snippet with basic metadata', async () => {
    const filePath = '/test/snippets/hello.txt';
    const fileContent = `# Snippet: hello
# Description: Test snippet

Hello, world!`;

    vi.mocked(readFile).mockResolvedValue(fileContent);
    
    await addTextSnippet(filePath);
    
    expect(snippetMap.has('hello')).toBe(true);
    const snippet = snippetMap.get('hello');
    expect(snippet).toEqual({
      filePath,
      postfix: false,
      txt: true,
    });
  });

  it('should add a text snippet with expand metadata', async () => {
    const filePath = '/test/snippets/expand.txt';
    const fileContent = `// Expand: exp
// Description: Expansion test

This will expand`;

    vi.mocked(readFile).mockResolvedValue(fileContent);
    
    await addTextSnippet(filePath);
    
    expect(snippetMap.has('exp')).toBe(true);
    const snippet = snippetMap.get('exp');
    expect(snippet).toEqual({
      filePath,
      postfix: false,
      txt: true,
    });
  });

  it('should handle postfix snippets with asterisk', async () => {
    const filePath = '/test/snippets/postfix.txt';
    const fileContent = `# Snippet: *post
# Description: Postfix snippet

This is a postfix snippet`;

    vi.mocked(readFile).mockResolvedValue(fileContent);
    
    await addTextSnippet(filePath);
    
    expect(snippetMap.has('post')).toBe(true);
    const snippet = snippetMap.get('post');
    expect(snippet).toEqual({
      filePath,
      postfix: true,
      txt: true,
    });
  });

  it('should remove existing snippet before adding new one', async () => {
    const filePath = '/test/snippets/update.txt';
    
    // First add
    vi.mocked(readFile).mockResolvedValue(`# Snippet: old
Content 1`);
    await addTextSnippet(filePath);
    expect(snippetMap.has('old')).toBe(true);
    
    // Update with new trigger
    vi.mocked(readFile).mockResolvedValue(`# Snippet: new
Content 2`);
    await addTextSnippet(filePath);
    
    expect(snippetMap.has('old')).toBe(false);
    expect(snippetMap.has('new')).toBe(true);
  });

  it('should handle files without snippet metadata', async () => {
    const filePath = '/test/snippets/no-metadata.txt';
    const fileContent = `Just plain text without metadata`;

    vi.mocked(readFile).mockResolvedValue(fileContent);
    
    await addTextSnippet(filePath);
    
    // Should not add anything to the map
    expect(snippetMap.size).toBe(0);
  });

  it('should handle multiple snippets with same file', async () => {
    const filePath = '/test/snippets/multi.txt';
    
    // Add with one trigger
    vi.mocked(readFile).mockResolvedValue(`# Snippet: trigger1
Content`);
    await addTextSnippet(filePath);
    
    // Update with different trigger
    vi.mocked(readFile).mockResolvedValue(`# Snippet: trigger2
Content`);
    await addTextSnippet(filePath);
    
    // Should only have the latest trigger
    expect(snippetMap.has('trigger1')).toBe(false);
    expect(snippetMap.has('trigger2')).toBe(true);
    expect(snippetMap.size).toBe(1);
  });

  it('should handle case variations in metadata keys', async () => {
    const filePath = '/test/snippets/case.txt';
    const fileContent = `# SNIPPET: upper
# snippet: lower
# Snippet: proper

Content`;

    vi.mocked(readFile).mockResolvedValue(fileContent);
    
    await addTextSnippet(filePath);
    
    // Should use the first valid snippet metadata (case-insensitive)
    expect(snippetMap.has('upper')).toBe(true);
  });

  it('should handle empty trigger', async () => {
    const filePath = '/test/snippets/empty.txt';
    const fileContent = `# Snippet: 
# Description: Empty trigger

Content`;

    vi.mocked(readFile).mockResolvedValue(fileContent);
    
    await addTextSnippet(filePath);
    
    // Should not add snippet with empty trigger
    expect(snippetMap.size).toBe(0);
  });

  it('should handle file read errors gracefully', async () => {
    const filePath = '/test/snippets/error.txt';
    
    vi.mocked(readFile).mockRejectedValue(new Error('File not found'));
    
    await expect(addTextSnippet(filePath)).rejects.toThrow('File not found');
    
    // Should not add anything to the map
    expect(snippetMap.size).toBe(0);
  });

  it('should handle special characters in triggers', async () => {
    const filePath = '/test/snippets/special.txt';
    const fileContent = `# Snippet: ,,
# Description: Comma trigger

Special trigger content`;

    vi.mocked(readFile).mockResolvedValue(fileContent);
    
    await addTextSnippet(filePath);
    
    expect(snippetMap.has(',,')).toBe(true);
    const snippet = snippetMap.get(',,');
    expect(snippet).toEqual({
      filePath,
      postfix: false,
      txt: true,
    });
  });

  it('should handle triggers with spaces', async () => {
    const filePath = '/test/snippets/spaces.txt';
    const fileContent = `# Snippet: hello world
# Description: Multi-word trigger

Content with spaces in trigger`;

    vi.mocked(readFile).mockResolvedValue(fileContent);
    
    await addTextSnippet(filePath);
    
    expect(snippetMap.has('hello world')).toBe(true);
  });
});

describe('parseSnippet', () => {
  it('should parse snippet with hash comments', () => {
    const content = `# Snippet: test
# Description: Test description
# Author: Test Author

Snippet content here`;

    const result = parseSnippet(content);
    
    expect(result.metadata).toEqual({
      snippet: 'test',
      description: 'Test description',
      author: 'Test Author',
    });
    expect(result.snippet).toBe('Snippet content here');
  });

  it('should parse snippet with slash comments', () => {
    const content = `// Snippet: test
// Description: Test description

Snippet content here`;

    const result = parseSnippet(content);
    
    expect(result.metadata).toEqual({
      snippet: 'test',
      description: 'Test description',
    });
    expect(result.snippet).toBe('Snippet content here');
  });

  it('should handle mixed comment styles', () => {
    const content = `# Snippet: test
// Description: Test description

Content`;

    const result = parseSnippet(content);
    
    expect(result.metadata).toEqual({
      snippet: 'test',
      description: 'Test description',
    });
  });

  it('should handle metadata with extra spaces', () => {
    const content = `#   Snippet:   test   
#  Description:  Test with spaces  

Content`;

    const result = parseSnippet(content);
    
    expect(result.metadata).toEqual({
      snippet: 'test',
      description: 'Test with spaces',
    });
  });

  it('should handle content without metadata', () => {
    const content = `Just plain content
No metadata here`;

    const result = parseSnippet(content);
    
    expect(result.metadata).toEqual({});
    expect(result.snippet).toBe(content);
  });

  it('should handle empty content', () => {
    const content = '';

    const result = parseSnippet(content);
    
    expect(result.metadata).toEqual({});
    expect(result.snippet).toBe('');
  });

  it('should stop parsing at first non-metadata line', () => {
    const content = `# Snippet: test
# Description: Test

This is content
# This is not metadata`;

    const result = parseSnippet(content);
    
    expect(result.metadata).toEqual({
      snippet: 'test',
      description: 'Test',
    });
    expect(result.snippet).toBe('This is content\n# This is not metadata');
  });

  it('should handle malformed metadata lines', () => {
    const content = `# Snippet: test
# No colon here
# Description: Valid
# : Empty key
# Empty value:

Content`;

    const result = parseSnippet(content);
    
    expect(result.metadata).toEqual({
      snippet: 'test',
    });
    expect(result.snippet).toBe('# No colon here\n# Description: Valid\n# : Empty key\n# Empty value:\n\nContent');
  });
});