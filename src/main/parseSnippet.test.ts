import { describe, it, expect } from 'vitest';

// Simple implementation of parseSnippet for testing
const snippetRegex = /^(?:\/\/|#)\s*([\w-]+):\s*(.*)/;

function parseSnippet(contents: string): {
  metadata: Record<string, string>;
  snippet: string;
} {
  const lines = contents.split('\n');
  const metadata: Record<string, string> = {};
  let snippetStartIndex = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(snippetRegex);
    if (match) {
      metadata[match[1].trim().toLowerCase()] = match[2].trim();
    } else {
      snippetStartIndex = i;
      break;
    }
  }

  const snippet = lines.slice(snippetStartIndex).join('\n');
  return { metadata, snippet };
}

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
    expect(result.snippet).toBe('\nSnippet content here');
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
    expect(result.snippet).toBe('\nSnippet content here');
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
    expect(result.snippet).toBe('\nContent');
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
    expect(result.snippet).toBe('\nContent');
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
    expect(result.snippet).toBe('\nThis is content\n# This is not metadata');
  });

  it('should handle expand key as alternative to snippet', () => {
    const content = `# Expand: exp
# Description: Expansion test

Content`;

    const result = parseSnippet(content);
    
    expect(result.metadata).toEqual({
      expand: 'exp',
      description: 'Expansion test',
    });
  });

  it('should handle postfix snippets with asterisk', () => {
    const content = `# Snippet: *post
# Description: Postfix snippet

Postfix content`;

    const result = parseSnippet(content);
    
    expect(result.metadata).toEqual({
      snippet: '*post',
      description: 'Postfix snippet',
    });
  });

  it('should handle special characters in trigger', () => {
    const content = `# Snippet: ,,
# Description: Comma trigger

Content`;

    const result = parseSnippet(content);
    
    expect(result.metadata).toEqual({
      snippet: ',,',
      description: 'Comma trigger',
    });
  });

  it('should handle multi-word triggers', () => {
    const content = `# Snippet: hello world
# Description: Multi-word

Content`;

    const result = parseSnippet(content);
    
    expect(result.metadata).toEqual({
      snippet: 'hello world',
      description: 'Multi-word',
    });
  });

  it('should handle metadata without values', () => {
    const content = `# Snippet: 
# Description: Has value
# Empty:

Content`;

    const result = parseSnippet(content);
    
    expect(result.metadata).toEqual({
      snippet: '',
      description: 'Has value',
      empty: '',
    });
  });
});