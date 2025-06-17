/**
 * Test to understand why JSON.stringify is failing with large images
 */

// Test 1: Large base64 string
console.log('Test 1: Large base64 string');
try {
  const largeImage = {
    type: 'image',
    data: 'data:image/png;base64,' + 'A'.repeat(5 * 1024 * 1024) // 5MB
  };
  const str = JSON.stringify(largeImage);
  console.log('✓ Successfully stringified 5MB image');
} catch (error) {
  console.log('✗ Failed to stringify 5MB image:', error.message);
}

// Test 2: Nested structure with large image
console.log('\nTest 2: Nested structure');
try {
  const nested = {
    content: [{
      type: 'image',
      data: 'data:image/png;base64,' + 'B'.repeat(5 * 1024 * 1024)
    }]
  };
  const str = JSON.stringify(nested);
  console.log('✓ Successfully stringified nested structure');
} catch (error) {
  console.log('✗ Failed to stringify nested structure:', error.message);
}

// Test 3: Very large image (10MB)
console.log('\nTest 3: Very large image (10MB)');
try {
  const veryLarge = {
    content: [{
      type: 'image',
      data: 'data:image/png;base64,' + 'C'.repeat(10 * 1024 * 1024)
    }]
  };
  const str = JSON.stringify(veryLarge);
  console.log('✓ Successfully stringified 10MB image');
} catch (error) {
  console.log('✗ Failed to stringify 10MB image:', error.message);
}

// Test 4: Check for Buffer issues
console.log('\nTest 4: Buffer in object');
try {
  const withBuffer = {
    content: [{
      type: 'buffer',
      data: Buffer.alloc(1024 * 1024)
    }]
  };
  const str = JSON.stringify(withBuffer);
  console.log('✓ Successfully stringified Buffer');
  console.log('Buffer serialized to:', str.slice(0, 100) + '...');
} catch (error) {
  console.log('✗ Failed to stringify Buffer:', error.message);
}

// Test 5: Circular reference
console.log('\nTest 5: Circular reference');
try {
  const circular: any = {
    content: [{
      type: 'text',
      text: 'hello'
    }]
  };
  circular.self = circular;
  const str = JSON.stringify(circular);
  console.log('✓ Successfully stringified circular reference');
} catch (error) {
  console.log('✗ Failed to stringify circular reference:', error.message);
}