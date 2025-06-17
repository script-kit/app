/**
 * Test the exact structure created by sendResult with image data
 */

// Simulate what sendResult does based on the SDK code
function simulateSendResult(content: any) {
  let toolResult: any;
  
  if (typeof content === 'string') {
    toolResult = {
      content: [{
        type: 'text',
        text: content
      }]
    };
  } else if (Array.isArray(content)) {
    toolResult = {
      content: content
    };
  } else {
    // Single object - this is what the mcp-arg.ts script uses
    const { type, isError, structuredContent, _meta, ...contentData } = content;
    
    const contentItem = { type, ...contentData };
    
    toolResult = {
      content: [contentItem]
    };
    
    if (isError !== undefined) toolResult.isError = isError;
    if (structuredContent !== undefined) toolResult.structuredContent = structuredContent;
    if (_meta !== undefined) toolResult._meta = _meta;
  }
  
  // This is what gets sent via Channel.RESPONSE
  return {
    body: toolResult,
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json'
    }
  };
}

// Test with image data like mcp-arg.ts
const testImageData = 'A'.repeat(1.9 * 1024 * 1024); // Simulate 1.9MB base64

const result = simulateSendResult({
  type: 'image',
  data: testImageData,
  mimeType: 'image/png'
});

console.log('Result structure:');
console.log('- body:', typeof result.body, Object.keys(result.body));
console.log('- body.content:', Array.isArray(result.body.content), result.body.content.length);
console.log('- body.content[0]:', Object.keys(result.body.content[0]));
console.log('- body.content[0].data length:', result.body.content[0].data.length);

// Now test what handleScript returns
const handleScriptResult = {
  status: result.statusCode,
  data: result.body,
  headers: result.headers
};

console.log('\nhandleScript result structure:');
console.log('- data:', typeof handleScriptResult.data, Object.keys(handleScriptResult.data));
console.log('- data.content:', Array.isArray(handleScriptResult.data.content));

// Test if it can be stringified
console.log('\nStringify test:');
try {
  const str = JSON.stringify(handleScriptResult.data);
  console.log(`✓ Can stringify (size: ${(str.length / (1024 * 1024)).toFixed(2)}MB)`);
} catch (error) {
  console.log(`✗ Cannot stringify:`, error);
}

// Test the full response that would be sent by MCP
console.log('\nFull MCP response test:');
try {
  const fullResponse = {
    jsonrpc: '2.0',
    id: 'test-id',
    result: handleScriptResult.data
  };
  const str = JSON.stringify(fullResponse);
  console.log(`✓ Can stringify full response (size: ${(str.length / (1024 * 1024)).toFixed(2)}MB)`);
} catch (error) {
  console.log(`✗ Cannot stringify full response:`, error);
}