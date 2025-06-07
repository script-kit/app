# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Script Kit App

This is the main Electron app for Script Kit.

## Commands

### Development
```bash
pnpm dev        # Start development server with hot reload
pnpm build      # Build using Kit SDK build script
pnpm vite-dev   # Alternative development script
```

### Testing
```bash
pnpm test       # Run all tests
pnpm bench      # Run benchmarks
pnpm coverage   # Run tests with coverage report
```

### Code Quality
```bash
pnpm format:check  # Check code formatting without changes
pnpm format:fix    # Fix code formatting issues
```

### Platform-Specific Builds
```bash
pnpm package:mac:arm64          # Build for macOS ARM64
pnpm build-and-install:mac      # Build and install on macOS
pnpm build-and-install:windows:x64  # Build and install on Windows x64
```

### Utility Commands
```bash
pnpm rebuild           # Rebuild native dependencies
pnpm clear-cache       # Clear Vite cache (useful when rebuilding Kit SDK)
pnpm rebuild-node-pty  # Rebuild node-pty specifically
```

## Architecture Overview

### Project Structure
- **Electron App**: Uses electron-vite for building, with main/preload/renderer process separation
- **Main Process** (`src/main/`): Handles system integration, process management, IPC, and native functionality
- **Renderer Process** (`src/renderer/`): React-based UI with Tailwind CSS
- **Shared** (`src/shared/`): Common types, enums, and utilities used across processes

### Key Components

#### Process Management (`src/main/process.ts`)
- Manages child processes for running scripts
- Handles process pools and lifecycle
- Integrates with PTY (pseudo-terminal) for terminal emulation

#### Search System (`src/main/search.ts`)
- QuickScore-based fuzzy search with fallback to manual string matching
- Complex choice filtering (miss, pass, info, hideWithoutInput types)
- Grouped search results with exact match headers
- Extensive test coverage in `src/main/search.test.ts`

#### Watcher System (`src/main/watcher.ts`)
- Uses Chokidar for file system monitoring
- Watches kenv directories for script changes
- Handles symlinked sub-kenvs
- Manages watcher lifecycle and refresh

#### IPC Communication (`src/main/ipc.ts`)
- Handles all inter-process communication
- Channel-based messaging system
- Integration with prompt system

#### Logging System (`src/main/logs.ts`)
- Comprehensive logging to `~/Library/Logs/ScriptKit/`
- Separate log files for different components (main, term, process, error, etc.)
- Console statements preserved using stored variables to prevent Biome removal

#### PTY Management (`src/main/pty.ts`, `src/main/invoke-pty.ts`)
- Pool-based PTY management for efficient terminal operations
- Handles script execution in pseudo-terminals
- Manages PTY lifecycle and cleanup

### Important Notes

#### Console Statement Preservation
Files like `logs.ts` are in the formatter ignore list to preserve console statements. If console statements are being removed by Biome:
```typescript
const consoleLog = console.log;
const consoleWarn = console.warn;
// Use consoleLog(...) instead of console.log(...)
```

#### Native Dependencies
Some dependencies require build scripts configured in `package.json` under `pnpm.onlyBuiltDependencies`. Run `pnpm rebuild` if you see build script warnings.

#### Development Workflow
- Main process changes require restart (`pnpm dev`)
- Renderer changes should hot reload (close/reopen window if needed)
- Use `pnpm clear-cache` when rebuilding Kit SDK due to Vite caching issues

#### Platform-Specific Issues
- **macOS Homebrew**: Install `python-setuptools` if using Python 3.12
- **Windows**: Requires Desktop Development with C++ workload and MSVC v143 tools
- **Linux**: May need to manually end Electron process (`killall Electron`) or clear Vite cache
- **Linux ARM64**: May need to uninstall `uiohook-napi` to avoid errors

#### Testing Strategy
- Uses Vitest with separate configs for main and renderer
- Real implementations used for realistic behavior (QuickScore, utility functions)
- Strategic mocking for timing (debounce) and external dependencies
- Tests assume current implementation is correct for safe refactoring

## Debugging

When debugging issues:
1. Ask user to run Script Kit app first
2. Wait for confirmation and issue reproduction
3. Check relevant logs in `~/Library/Logs/ScriptKit/`:
   - `main.log` for general application issues
   - `term.log` for terminal/PTY issues
   - `error.log` for errors across components
   - `process.log` for process management
   - `ipc.log` for inter-process communication

## SDK Integration
- The app integrates with `@johnlindquist/kit` SDK
- SDK location: https://github.com/johnlindquist/kit
- Kit paths managed through core utils (kitPath, kenvPath, etc.)

---

# Creating Tests for Script Kit

This guide will help you create and run tests for the Script Kit application.

## Test Framework

Script Kit uses [Vitest](https://vitest.dev/) as its testing framework with the following key features:
- Fast execution with HMR support
- Jest-compatible API
- Built-in mocking capabilities
- TypeScript support out of the box

## Directory Structure

Tests should be placed alongside the source files they test:
```
src/
├── main/
│   ├── process.ts
│   ├── process.test.ts        # Unit tests
│   ├── search.ts
│   ├── search.test.ts
│   ├── search-integration.test.ts  # Integration tests
│   └── search-performance.test.ts  # Performance tests
```

## Test File Naming Conventions

- **Unit tests**: `filename.test.ts`
- **Integration tests**: `filename-integration.test.ts`
- **Performance tests**: `filename-performance.test.ts`
- **Benchmark tests**: `filename.bench.ts`

## Creating a Basic Test

### 1. Import Test Utilities

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
```

### 2. Basic Test Structure

```typescript
describe('ModuleName', () => {
  describe('functionName', () => {
    it('should do something specific', () => {
      // Arrange
      const input = 'test';
      
      // Act
      const result = myFunction(input);
      
      // Assert
      expect(result).toBe('expected output');
    });
  });
});
```

## Mocking Dependencies

### Mocking Node Modules

```typescript
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn()
}));
```

### Mocking Electron

```typescript
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/path'),
    quit: vi.fn()
  },
  BrowserWindow: vi.fn().mockImplementation(() => ({
    loadURL: vi.fn(),
    on: vi.fn(),
    webContents: {
      send: vi.fn()
    }
  })),
  Notification: vi.fn().mockImplementation(() => ({
    show: vi.fn(),
    on: vi.fn()
  }))
}));
```

### Mocking Internal Modules

```typescript
vi.mock('./logs', () => ({
  mainLog: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  },
  errorLog: {
    error: vi.fn()
  }
}));
```

### Mocking Kit Utilities

```typescript
vi.mock('@johnlindquist/kit/core/utils', () => ({
  kitPath: vi.fn((subpath?: string) => 
    subpath ? `/mock/kit/path/${subpath}` : '/mock/kit/path'
  ),
  kenvPath: vi.fn((subpath?: string) => 
    subpath ? `/mock/kenv/path/${subpath}` : '/mock/kenv/path'
  )
}));
```

## Common Testing Patterns

### Testing Async Functions

```typescript
it('should handle async operations', async () => {
  const mockData = { value: 'test' };
  vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockData));
  
  const result = await readJsonFile('path/to/file.json');
  
  expect(result).toEqual(mockData);
  expect(fs.readFile).toHaveBeenCalledWith('path/to/file.json', 'utf8');
});
```

### Testing Error Handling

```typescript
it('should handle errors gracefully', async () => {
  const error = new Error('File not found');
  vi.mocked(fs.readFile).mockRejectedValue(error);
  
  await expect(readJsonFile('path/to/file.json')).rejects.toThrow('File not found');
});
```

### Testing Event Emitters

```typescript
it('should emit events correctly', () => {
  const mockListener = vi.fn();
  emitter.on('test-event', mockListener);
  
  emitter.emit('test-event', { data: 'test' });
  
  expect(mockListener).toHaveBeenCalledWith({ data: 'test' });
});
```

### Testing with Timers

```typescript
it('should handle delayed operations', async () => {
  vi.useFakeTimers();
  
  const callback = vi.fn();
  setTimeout(callback, 1000);
  
  // Fast-forward time
  await vi.advanceTimersByTimeAsync(1000);
  
  expect(callback).toHaveBeenCalled();
  
  vi.useRealTimers();
});
```

### Testing Platform-Specific Code

```typescript
describe('Platform-specific behavior', () => {
  let originalPlatform: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  });

  afterEach(() => {
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
  });

  it('should handle macOS specific code', () => {
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
      configurable: true
    });
    
    const result = getPlatformSpecificPath();
    expect(result).toBe('/Users/username/Library/Application Support');
  });

  it('should handle Windows specific code', () => {
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      configurable: true
    });
    
    const result = getPlatformSpecificPath();
    expect(result).toBe('C:\\Users\\username\\AppData\\Roaming');
  });
});
```

## Testing Best Practices

### 1. Isolate Tests
- Clear all mocks between tests: `vi.clearAllMocks()`
- Reset module state in `beforeEach`
- Don't rely on test execution order

### 2. Use Descriptive Test Names
```typescript
// ❌ Bad
it('should work', () => {});

// ✅ Good
it('should return user data when valid ID is provided', () => {});
```

### 3. Test One Thing at a Time
```typescript
// ❌ Bad - testing multiple behaviors
it('should validate and save user', () => {
  const user = { name: 'John', email: 'invalid' };
  expect(validateUser(user)).toBe(false);
  expect(() => saveUser(user)).toThrow();
});

// ✅ Good - separate tests
it('should return false for invalid email', () => {
  const user = { name: 'John', email: 'invalid' };
  expect(validateUser(user)).toBe(false);
});

it('should throw error when saving invalid user', () => {
  const user = { name: 'John', email: 'invalid' };
  expect(() => saveUser(user)).toThrow();
});
```

### 4. Use Test Helpers for Complex Setup
```typescript
// Test helper
function createMockProcess(overrides = {}) {
  return {
    pid: 1234,
    scriptPath: '/test/script.js',
    child: {
      send: vi.fn(),
      kill: vi.fn(),
      on: vi.fn()
    },
    ...overrides
  };
}

// Usage in tests
it('should handle process termination', () => {
  const process = createMockProcess({ pid: 5678 });
  terminateProcess(process);
  expect(process.child.kill).toHaveBeenCalled();
});
```

## Running Tests

### Run All Tests
```bash
pnpm test
```

### Run Tests in Watch Mode
```bash
pnpm test:watch
```

### Run Specific Test File
```bash
pnpm test src/main/process.test.ts
```

### Run Tests with Coverage
```bash
pnpm coverage
```

### Run Tests Matching a Pattern
```bash
pnpm test --run --grep "should handle errors"
```

## Debugging Tests

### 1. Use Console Logs
Tests will display console output. Use it for debugging:
```typescript
it('should process data', () => {
  const data = processData(input);
  console.log('Processed data:', data);
  expect(data).toBeDefined();
});
```

### 2. Use VSCode Debugger
Add a breakpoint in your test and use VSCode's "Debug Test" feature.

### 3. Run Single Test
Focus on a single test while debugging:
```typescript
it.only('should debug this test', () => {
  // This test will run in isolation
});
```

### 4. Skip Tests Temporarily
```typescript
it.skip('should fix this later', () => {
  // This test will be skipped
});
```

## Integration Testing Example

For more complex scenarios involving multiple modules:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProcessMonitor } from './process-monitor';
import { processScanner } from './process-scanner';
import { kitState } from './state';

describe('Process Monitoring Integration', () => {
  let monitor: ProcessMonitor;

  beforeEach(() => {
    // Reset state
    kitState.suspended = false;
    kitState.processMonitorEnabled = false;
    
    // Create fresh instance
    monitor = new ProcessMonitor();
  });

  afterEach(async () => {
    // Cleanup
    await monitor.stop();
    vi.clearAllMocks();
  });

  it('should detect and report high process count', async () => {
    // Mock system state
    vi.mocked(processScanner.scanProcesses).mockReturnValue(
      Array(25).fill({}).map((_, i) => ({
        pid: 1000 + i,
        name: 'Script Kit',
        command: `/Applications/Script Kit.app/process${i}`
      }))
    );

    // Start monitoring
    await monitor.start();

    // Verify notification was triggered
    expect(Notification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Script Kit Process Warning',
        body: expect.stringContaining('25 processes')
      })
    );
  });
});
```

## Performance Testing

For performance-critical code:

```typescript
import { bench, describe } from 'vitest';
import { searchChoices } from './search';

describe('Search Performance', () => {
  const choices = Array(10000).fill({}).map((_, i) => ({
    name: `Choice ${i}`,
    value: i
  }));

  bench('search with fuzzy matching', () => {
    searchChoices(choices, 'choice 500');
  });

  bench('search with exact matching', () => {
    searchChoices(choices, 'Choice 5000', { fuzzy: false });
  });
});
```

## Common Gotchas

### 1. Async Test Timeouts
For long-running tests, increase the timeout:
```typescript
it('should handle long operation', async () => {
  // Test implementation
}, 10000); // 10 second timeout
```

### 2. Module State Leakage
Always reset module state between tests to avoid flaky tests:
```typescript
beforeEach(() => {
  // Reset any module-level variables
  processCache.clear();
  activeConnections = [];
});
```

### 3. Mock Implementation vs Mock Return Value
```typescript
// Mock return value for simple cases
vi.mocked(getValue).mockReturnValue('test');

// Mock implementation for complex logic
vi.mocked(getValue).mockImplementation((key) => {
  if (key === 'special') return 'special value';
  return 'default';
});
```

### 4. Cleaning Up Resources
Always clean up resources to prevent test interference:
```typescript
afterEach(() => {
  // Close open connections
  server?.close();
  
  // Clear timers
  vi.clearAllTimers();
  
  // Remove event listeners
  emitter.removeAllListeners();
});
```

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [Jest Matchers Reference](https://jestjs.io/docs/expect) (mostly compatible with Vitest)

## Contributing

When adding new features:
1. Write tests first (TDD approach encouraged)
2. Ensure all tests pass before submitting PR
3. Maintain or improve code coverage
4. Update this guide if you discover new patterns worth sharing