#!/usr/bin/env node

/**
 * Quick script to run search performance benchmarks and tests
 * Usage: node scripts/bench-search.js
 */

const { execSync } = require('node:child_process');

console.log('🚀 Running Search Performance Analysis...\n');

try {
  console.log('📊 Running Pure Benchmarks (.bench.ts)...');
  execSync('pnpm vitest bench src/main/search-performance.bench.ts --run', {
    encoding: 'utf8',
    stdio: 'inherit',
  });

  console.log('\n🧪 Running Performance Tests (.test.ts)...');
  execSync('pnpm vitest run src/main/search-performance.test.ts', {
    encoding: 'utf8',
    stdio: 'inherit',
  });

  console.log('\n✅ All performance analysis completed successfully!');
} catch (error) {
  console.error('\n❌ Performance analysis failed:', error.message);
  process.exit(1);
}
