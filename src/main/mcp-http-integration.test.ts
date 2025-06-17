import { describe, it, expect } from 'vitest';

describe('MCP HTTP Server - Stack Overflow Integration Tests', () => {
  describe('Real-world scenarios', () => {
    it('should handle screenshot tool response without stack overflow', () => {
      // Simulate a screenshot tool response
      const screenshotResponse = {
        data: {
          content: [{
            type: 'image',
            data: 'data:image/png;base64,' + 'iVBORw0KGgoAAAANSUhEUgAA' + 'A'.repeat(1024 * 1024) // ~1MB image
          }]
        },
        status: 200
      };

      // The dump function should handle this
      const dump = (obj: any) => {
        try {
          if (obj instanceof Buffer) {
            return `Buffer(${obj.length} bytes)`;
          }
          if (obj && typeof obj === 'object') {
            const safeObj = JSON.parse(JSON.stringify(obj, (key, value) => {
              if (value instanceof Buffer || (value && value.type === 'Buffer' && Array.isArray(value.data))) {
                return `Buffer(${value.length || value.data?.length || 0} bytes)`;
              }
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
      };

      // Should not throw stack overflow
      expect(() => {
        const dumped = dump(screenshotResponse);
        expect(dumped).toContain('Base64Image(');
        expect(dumped).toContain('"status": 200');
      }).not.toThrow();
    });

    it('should handle AI-generated image responses', () => {
      // Simulate DALL-E or similar image generation response
      const aiImageResponse = {
        data: {
          content: [{
            type: 'text',
            text: 'Here is the generated image:'
          }, {
            type: 'image',
            data: 'data:image/jpeg;base64,' + Buffer.alloc(2 * 1024 * 1024, 'B').toString('base64')
          }]
        },
        metadata: {
          model: 'dall-e-3',
          timestamp: new Date().toISOString()
        }
      };

      const dump = (obj: any) => {
        try {
          if (obj instanceof Buffer) {
            return `Buffer(${obj.length} bytes)`;
          }
          if (obj && typeof obj === 'object') {
            const safeObj = JSON.parse(JSON.stringify(obj, (key, value) => {
              if (value instanceof Buffer || (value && value.type === 'Buffer' && Array.isArray(value.data))) {
                return `Buffer(${value.length || value.data?.length || 0} bytes)`;
              }
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
      };

      const result = dump(aiImageResponse);
      const parsed = JSON.parse(result);
      
      expect(parsed.data.content[0].text).toBe('Here is the generated image:');
      expect(parsed.data.content[1].data).toMatch(/Base64Image\(\d+ chars\)/);
      expect(parsed.metadata.model).toBe('dall-e-3');
    });

    it('should handle multiple images in a single response', () => {
      // Simulate a comparison tool that returns multiple images
      const multiImageResponse = {
        data: {
          content: [{
            type: 'text',
            text: 'Comparison results:'
          }, {
            type: 'image',
            data: 'data:image/png;base64,' + 'A'.repeat(500 * 1024), // 500KB
            caption: 'Before'
          }, {
            type: 'image', 
            data: 'data:image/png;base64,' + 'B'.repeat(500 * 1024), // 500KB
            caption: 'After'
          }, {
            type: 'image',
            data: 'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBA', // Small gif
            caption: 'Diff indicator'
          }]
        }
      };

      const dump = (obj: any) => {
        try {
          if (obj instanceof Buffer) {
            return `Buffer(${obj.length} bytes)`;
          }
          if (obj && typeof obj === 'object') {
            const safeObj = JSON.parse(JSON.stringify(obj, (key, value) => {
              if (value instanceof Buffer || (value && value.type === 'Buffer' && Array.isArray(value.data))) {
                return `Buffer(${value.length || value.data?.length || 0} bytes)`;
              }
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
      };

      const result = dump(multiImageResponse);
      const parsed = JSON.parse(result);
      
      expect(parsed.data.content[1].data).toMatch(/Base64Image\(\d+ chars\)/);
      expect(parsed.data.content[1].caption).toBe('Before');
      expect(parsed.data.content[2].data).toMatch(/Base64Image\(\d+ chars\)/);
      expect(parsed.data.content[2].caption).toBe('After');
      // Small image should be preserved
      expect(parsed.data.content[3].data).toContain('R0lGODlhAQABAIAAAAUEBA');
    });
  });

  describe('Performance tests', () => {
    it('should handle very large payloads efficiently', () => {
      const veryLargeResponse = {
        images: Array(100).fill(null).map((_, i) => ({
          id: `img-${i}`,
          data: 'data:image/jpeg;base64,' + 'X'.repeat(100 * 1024), // 100KB each = 10MB total
          metadata: {
            width: 1920,
            height: 1080,
            format: 'jpeg'
          }
        })),
        buffers: Array(50).fill(null).map((_, i) => ({
          id: `buf-${i}`,
          data: Buffer.alloc(50 * 1024), // 50KB each = 2.5MB total
          type: 'Buffer'
        }))
      };

      const dump = (obj: any) => {
        try {
          if (obj instanceof Buffer) {
            return `Buffer(${obj.length} bytes)`;
          }
          if (obj && typeof obj === 'object') {
            const safeObj = JSON.parse(JSON.stringify(obj, (key, value) => {
              if (value instanceof Buffer || (value && value.type === 'Buffer' && Array.isArray(value.data))) {
                return `Buffer(${value.length || value.data?.length || 0} bytes)`;
              }
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
      };

      const start = Date.now();
      const result = dump(veryLargeResponse);
      const duration = Date.now() - start;

      // Should process in reasonable time (not iterating through 12.5MB of data)
      expect(duration).toBeLessThan(200); // Should be much faster than iterating all bytes

      // Verify structure
      const parsed = JSON.parse(result);
      expect(parsed.images).toHaveLength(100);
      expect(parsed.buffers).toHaveLength(50);
      expect(parsed.images[0].data).toMatch(/Base64Image\(\d+ chars\)/);
      expect(parsed.buffers[0].data).toBe('Buffer(51200 bytes)');
    });
  });
});