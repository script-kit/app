# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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