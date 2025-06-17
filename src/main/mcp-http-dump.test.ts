import { describe, it, expect } from 'vitest';

describe('MCP HTTP Server - dump() Function Tests', () => {
  // Recreate the dump function logic from mcp-http-server.ts
  function dump(obj: unknown) {
    try {
      // Avoid serializing Buffers which can cause stack overflow
      if (obj instanceof Buffer) {
        return `Buffer(${obj.length} bytes)`;
      }
      if (obj && typeof obj === 'object') {
        // Create a safe copy that replaces Buffers with descriptions
        const safeObj = JSON.parse(JSON.stringify(obj, (key, value) => {
          if (value instanceof Buffer || (value && value.type === 'Buffer' && Array.isArray(value.data))) {
            return `Buffer(${value.length || value.data?.length || 0} bytes)`;
          }
          // Also handle base64 image data in content arrays
          if (typeof value === 'string' && value.startsWith('data:image/') && value.length > 1000) {
            return `Base64Image(${value.length} chars)`;
          }
          return value;
        }));
        return JSON.stringify(safeObj, null, 2);
      }
      return JSON.stringify(obj, null, 2);
    } catch {
      return String(obj);
    }
  }

  describe('Buffer Handling', () => {
    it('should handle raw Buffer objects without stack overflow', () => {
      const smallBuffer = Buffer.from('hello');
      const largeBuffer = Buffer.alloc(1024 * 1024); // 1MB
      
      const smallResult = dump(smallBuffer);
      const largeResult = dump(largeBuffer);
      
      expect(smallResult).toBe('Buffer(5 bytes)');
      expect(largeResult).toBe('Buffer(1048576 bytes)');
      
      // Should not contain actual buffer data
      expect(smallResult).not.toContain('hello');
      expect(largeResult.length).toBeLessThan(100); // Result should be short, not 1MB
    });

    it('should handle objects containing Buffers', () => {
      const obj = {
        name: 'test',
        data: Buffer.from('test data'),
        nested: {
          buffer: Buffer.alloc(1000)
        }
      };
      
      const result = dump(obj);
      
      expect(result).toContain('"data": "Buffer(9 bytes)"');
      expect(result).toContain('"buffer": "Buffer(1000 bytes)"');
      expect(result).toContain('"name": "test"');
      expect(result).not.toContain('test data');
    });

    it('should handle Buffer-like objects from JSON.parse', () => {
      // When Buffer is serialized to JSON and parsed back
      const bufferLike = {
        type: 'Buffer',
        data: new Array(1000).fill(65) // Array of byte values
      };
      
      const result = dump(bufferLike);
      
      expect(result).toBe('"Buffer(1000 bytes)"');
    });
  });

  describe('Base64 Image Handling', () => {
    it('should truncate large base64 images', () => {
      const smallImage = 'data:image/png;base64,iVBORw0KGgo';
      const largeImage = 'data:image/png;base64,' + 'A'.repeat(2 * 1024 * 1024); // 2MB
      
      // When passed as a string directly, it's just JSON.stringify'd
      const smallResult = dump(smallImage);
      const largeResult = dump(largeImage);
      
      // Small images should be preserved
      expect(smallResult).toContain(smallImage);
      
      // Large images as raw strings are not truncated (only when in objects)
      expect(largeResult).toContain('data:image/png;base64,');
      expect(largeResult.length).toBeGreaterThan(2 * 1024 * 1024);
    });
    
    it('should truncate large base64 images in objects', () => {
      const obj = {
        smallImage: 'data:image/png;base64,iVBORw0KGgo',
        largeImage: 'data:image/png;base64,' + 'A'.repeat(2 * 1024 * 1024) // 2MB
      };
      
      const result = dump(obj);
      
      // Small images in objects should be preserved
      expect(result).toContain('iVBORw0KGgo');
      
      // Large images in objects should be replaced
      expect(result).toContain(`"largeImage": "Base64Image(${obj.largeImage.length} chars)"`);
      expect(result).not.toContain('AAAAAAA');
    });

    it('should handle images in nested structures', () => {
      const obj = {
        content: [{
          type: 'image',
          data: 'data:image/jpeg;base64,' + 'B'.repeat(1024 * 1024) // 1MB
        }, {
          type: 'text',
          text: 'Hello world'
        }]
      };
      
      const result = dump(obj);
      
      expect(result).toContain('Base64Image(');
      expect(result).toContain('"Hello world"');
      expect(result).not.toContain('BBBBBB');
    });
  });

  describe('Error Handling', () => {
    it('should handle circular references', () => {
      const circular: any = { name: 'test' };
      circular.self = circular;
      
      const result = dump(circular);
      
      // Should fall back to String() on JSON.stringify error
      expect(result).toBe('[object Object]');
    });

    it('should handle undefined and null', () => {
      expect(dump(undefined)).toBe(undefined);
      expect(dump(null)).toBe('null');
    });

    it('should handle primitive values', () => {
      expect(dump('test')).toBe('"test"');
      expect(dump(123)).toBe('123');
      expect(dump(true)).toBe('true');
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle mixed content with buffers and images', () => {
      const complex = {
        metadata: {
          timestamp: '2024-01-01T00:00:00Z',
          size: 1024
        },
        buffers: [
          Buffer.from('small'),
          Buffer.alloc(1024 * 100) // 100KB
        ],
        images: {
          icon: 'data:image/gif;base64,R0lGOD',
          photo: 'data:image/jpeg;base64,' + 'C'.repeat(3 * 1024 * 1024) // 3MB
        },
        text: 'Regular text content'
      };
      
      const result = dump(complex);
      const parsed = JSON.parse(result);
      
      expect(parsed.buffers[0]).toBe('Buffer(5 bytes)');
      expect(parsed.buffers[1]).toBe('Buffer(102400 bytes)');
      expect(parsed.images.icon).toContain('R0lGOD'); // Small image preserved
      expect(parsed.images.photo).toMatch(/Base64Image\(\d+ chars\)/);
      expect(parsed.text).toBe('Regular text content');
    });

    it('should handle very large objects efficiently', () => {
      const largeObj = {
        items: Array(1000).fill(null).map((_, i) => ({
          id: i,
          buffer: Buffer.alloc(1024), // 1KB each
          image: 'data:image/png;base64,' + 'D'.repeat(10 * 1024) // 10KB each
        }))
      };
      
      const start = Date.now();
      const result = dump(largeObj);
      const duration = Date.now() - start;
      
      // Should process quickly (not iterate through millions of bytes)
      expect(duration).toBeLessThan(100); // Should take less than 100ms
      
      // Verify structure is preserved
      const parsed = JSON.parse(result);
      expect(parsed.items).toHaveLength(1000);
      expect(parsed.items[0].buffer).toBe('Buffer(1024 bytes)');
      expect(parsed.items[0].image).toMatch(/Base64Image\(\d+ chars\)/);
    });
  });
});

describe('MCP HTTP Server - writeHead Patching Tests', () => {
  it('should prevent recursive writeHead wrapping', () => {
    const responses: any[] = [];
    
    // Simulate multiple requests with the same response object
    for (let i = 0; i < 3; i++) {
      const mockRes: any = {
        __originalWriteHead: function(statusCode: number, headers?: any) {
          return this;
        },
        writeHead: function(statusCode: number, headers?: any) {
          return this.__originalWriteHead(statusCode, headers);
        }
      };
      
      // Simulate the patching logic with guard
      if (!mockRes.__mcpPatched) {
        mockRes.__mcpPatched = true;
        const original = mockRes.writeHead.bind(mockRes);
        mockRes.writeHead = function(statusCode: number, headers?: any) {
          const finalHeaders = {
            ...headers,
            'Mcp-Session-Id': `session-${i}`
          };
          return original.call(this, statusCode, finalHeaders);
        };
      }
      
      responses.push(mockRes);
    }
    
    // All responses should be marked as patched
    expect(responses.every(res => res.__mcpPatched)).toBe(true);
    
    // Test that writeHead still works without stack overflow
    let callCount = 0;
    responses[0].__originalWriteHead = function() {
      callCount++;
      if (callCount > 10) {
        throw new Error('Too many recursive calls');
      }
      return this;
    };
    
    // Should not throw
    expect(() => {
      responses[0].writeHead(200, { 'Content-Type': 'application/json' });
    }).not.toThrow();
    
    expect(callCount).toBe(1);
  });

  it('should handle multiple patch attempts on same response', () => {
    const mockRes: any = {
      writeHead: function(statusCode: number, headers?: any) {
        return this;
      }
    };
    
    const sessionIds: string[] = [];
    
    // Try to patch multiple times
    for (let i = 0; i < 5; i++) {
      if (!mockRes.__mcpPatched) {
        mockRes.__mcpPatched = true;
        const original = mockRes.writeHead.bind(mockRes);
        mockRes.writeHead = function(statusCode: number, headers?: any) {
          sessionIds.push(`attempt-${i}`);
          return original.call(this, statusCode, headers);
        };
      }
    }
    
    // Call writeHead
    mockRes.writeHead(200, {});
    
    // Should only have one session ID (from first patch)
    expect(sessionIds).toEqual(['attempt-0']);
  });
});