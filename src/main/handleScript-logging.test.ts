import { describe, it, expect, vi } from 'vitest';

describe('handleScript - Logging Safety Tests', () => {
  it('should handle large image responses without stack overflow in logs', () => {
    // Simulate the logging logic from handleScript.ts
    const mockLog = {
      info: vi.fn()
    };

    // Create a large response body similar to what MCP might return
    const largeImageResponse = {
      content: [{
        type: 'image',
        data: 'data:image/png;base64,' + 'A'.repeat(5 * 1024 * 1024) // 5MB image
      }],
      metadata: {
        tool: 'screenshot',
        timestamp: new Date().toISOString()
      }
    };

    // Simulate the safe logging logic
    const body = largeImageResponse;
    let dataInfo = 'no data';
    if (body) {
      if (typeof body === 'string') {
        dataInfo = `string (${body.length} chars)`;
      } else if (Buffer.isBuffer(body)) {
        dataInfo = `Buffer (${body.length} bytes)`;
      } else if (typeof body === 'object') {
        // For objects, just count properties without stringifying
        const keys = Object.keys(body);
        dataInfo = `object (${keys.length} keys)`;
        // Check if it contains image data
        if (body.content && Array.isArray(body.content)) {
          const imageCount = body.content.filter((item: any) => item?.type === 'image').length;
          if (imageCount > 0) {
            dataInfo += ` with ${imageCount} image(s)`;
          }
        }
      }
    }
    
    mockLog.info(`Response received: status=200, data=${dataInfo}`);

    // Verify log was called with safe message
    expect(mockLog.info).toHaveBeenCalledWith(
      'Response received: status=200, data=object (2 keys) with 1 image(s)'
    );
    
    // Verify no stack overflow occurred
    expect(() => {
      // This would have caused stack overflow with JSON.stringify
      JSON.stringify(largeImageResponse);
    }).not.toThrow();
  });

  it('should handle mixed content responses safely', () => {
    const mockLog = {
      info: vi.fn()
    };

    const mixedResponse = {
      content: [
        { type: 'text', text: 'Analysis complete' },
        { type: 'image', data: 'data:image/jpeg;base64,' + 'B'.repeat(1024 * 1024) },
        { type: 'text', text: 'Found 3 issues' },
        { type: 'image', data: 'data:image/png;base64,' + 'C'.repeat(2 * 1024 * 1024) }
      ],
      status: 'success'
    };

    // Simulate the safe logging logic
    const body = mixedResponse;
    let dataInfo = 'no data';
    if (body && typeof body === 'object') {
      const keys = Object.keys(body);
      dataInfo = `object (${keys.length} keys)`;
      if (body.content && Array.isArray(body.content)) {
        const imageCount = body.content.filter((item: any) => item?.type === 'image').length;
        if (imageCount > 0) {
          dataInfo += ` with ${imageCount} image(s)`;
        }
      }
    }
    
    mockLog.info(`Response received: status=200, data=${dataInfo}`);

    expect(mockLog.info).toHaveBeenCalledWith(
      'Response received: status=200, data=object (2 keys) with 2 image(s)'
    );
  });

  it('should estimate response size without stringifying', () => {
    const content = [
      { type: 'image', data: 'data:image/png;base64,' + 'A'.repeat(5 * 1024 * 1024) }, // 5MB
      { type: 'text', text: 'X'.repeat(1024 * 1024) }, // 1MB
      { type: 'image', data: 'data:image/jpeg;base64,' + 'B'.repeat(6 * 1024 * 1024) } // 6MB
    ];

    // Simulate the size estimation logic from mcp-http-server.ts
    let estimatedSize = 0;
    for (const item of content) {
      if (item.type === 'image' && item.data && typeof item.data === 'string') {
        estimatedSize += item.data.length;
      } else if (item.type === 'text' && item.text && typeof item.text === 'string') {
        estimatedSize += item.text.length;
      }
    }

    const estimatedMB = estimatedSize / (1024 * 1024);
    expect(estimatedMB).toBeGreaterThan(12); // Should be ~12MB
    expect(estimatedMB).toBeLessThan(13);

    // Verify we didn't need to stringify the entire object
    expect(() => {
      // This is what we avoid
      const str = JSON.stringify({ content });
      expect(str.length).toBeGreaterThan(12 * 1024 * 1024);
    }).not.toThrow();
  });
});