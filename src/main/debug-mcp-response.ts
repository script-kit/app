/**
 * Debug helper to analyze MCP response structure
 */

function analyzeObject(obj: any, path: string = 'root', visited = new WeakSet()): void {
  if (obj === null || obj === undefined) {
    console.log(`${path}: ${obj}`);
    return;
  }

  if (typeof obj !== 'object') {
    if (typeof obj === 'string' && obj.length > 100) {
      console.log(`${path}: string(${obj.length} chars)`);
    } else {
      console.log(`${path}: ${typeof obj} = ${obj}`);
    }
    return;
  }

  // Check for circular reference
  if (visited.has(obj)) {
    console.log(`${path}: [CIRCULAR REFERENCE]`);
    return;
  }
  visited.add(obj);

  // Handle arrays
  if (Array.isArray(obj)) {
    console.log(`${path}: Array(${obj.length})`);
    obj.forEach((item, index) => {
      if (index < 3 || index === obj.length - 1) {
        // Show first 3 and last
        analyzeObject(item, `${path}[${index}]`, visited);
      } else if (index === 3) {
        console.log(`${path}[3..${obj.length - 2}]: ... (skipped)`);
      }
    });
    return;
  }

  // Handle Buffer
  if (Buffer.isBuffer(obj)) {
    console.log(`${path}: Buffer(${obj.length} bytes)`);
    return;
  }

  // Handle regular objects
  const keys = Object.keys(obj);
  console.log(`${path}: Object(${keys.length} keys)`);

  for (const key of keys) {
    const value = obj[key];

    // Special handling for image data
    if (key === 'data' && typeof value === 'string' && value.startsWith('data:image/')) {
      console.log(`${path}.${key}: Base64Image(${value.length} chars)`);
    } else {
      analyzeObject(value, `${path}.${key}`, visited);
    }
  }
}

// Export for use in debugging
export function debugMCPResponse(response: any): void {
  console.log('=== MCP Response Structure Analysis ===');
  analyzeObject(response);
  console.log('=== End Analysis ===');

  // Check if it can be stringified
  console.log('\nStringify test:');
  try {
    // Don't actually stringify if it's too large
    if (response?.content && Array.isArray(response.content)) {
      let estimatedSize = 0;
      for (const item of response.content) {
        if (item?.type === 'image' && item?.data && typeof item.data === 'string') {
          estimatedSize += item.data.length;
        }
      }
      if (estimatedSize > 1024 * 1024) {
        // 1MB
        console.log(
          `⚠ Response contains large image data (~${(estimatedSize / (1024 * 1024)).toFixed(2)}MB), skipping stringify test`,
        );
        return;
      }
    }
    const str = JSON.stringify(response);
    console.log(`✓ Can stringify (size: ${str.length} chars)`);
  } catch (error) {
    console.log(`✗ Cannot stringify: ${error.message}`);
  }
}
