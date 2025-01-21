# Overview
- A comprehensive file watching system that monitors various directories and files for changes
- Uses the `chokidar` library to handle file system events across different platforms
- Primarily focused on watching script-related directories and configuration files

# Core Types and Interfaces
- **WatchEvent**: Represents possible file system events
  - Includes: 'add', 'addDir', 'change', 'unlink', 'unlinkDir'
- **WatchSource**: Identifies the source of changes
  - Can be either 'app' or 'kenv'
- **WatchOptions**: Configuration options for watchers
  - Contains `ignoreInitial` flag to control initial scan behavior
- **WatcherCallback**: Function type for handling watch events
  - Async function receiving event name, file path, and optional source

# Main Function: startWatching
- Primary entry point that sets up all file system watchers
- Returns an array of FSWatcher instances
- Handles six distinct watching scenarios:

## 1. Kit Database Watching
- Watches the kit/db folder at top level only
- Depth limited to 0 for direct changes only

## 2. Run/Ping File Watching
- Monitors `run.txt` and `ping.txt` in the kit path
- Tracks these specific files for any changes

## 3. Main Kenv Root Watching
- Watches the kenv root directory at depth 0
- Filters for specific configuration files:
  - All `.env*` files
  - `globals.ts`
  - `package.json`
- Extensible design for watching additional root-level files

## 4. Main Kenv Script Directories
- Monitors three main directories:
  - scripts/
  - snippets/
  - scriptlets/
- Root-level watching only (depth: 0)
- Follows symbolic links

## 5. Sub-Kenv Management
- Watches the kenvs root directory for new/removed sub-kenvs
- Dynamically creates watchers for each sub-kenv's:
  - scripts/ (root-level only)
  - snippets/ (root-level only)
  - scriptlets/ (root-level only)
- Handles cleanup when sub-kenvs are removed

## 6. Application Directory Watching
- Platform-specific watching of application directories
- On macOS:
  - Watches /Applications and ~/Applications
- On Windows:
  - Watches Program Files directories
  - Monitors AppData locations (Local and Roaming)

# Helper Functions
- **getConfigFiles**: Returns list of config files to watch in kenv root
- **createSubKenvWatchers**: Creates root-level watchers for a single sub-kenv
- **getAppDirectories**: Returns platform-specific app directories

# Key Behaviors
- All watchers follow symbolic links
- Sub-kenv watchers are managed in a Map for easy cleanup
- Each watcher emits detailed logs for monitoring and debugging
- Platform-specific paths are normalized using slash function
- Errors are caught and logged without crashing the system

# Technical Details
- Uses Node.js native modules (path, os, fs)
- Implements root-level watching (depth: 0) for all script directories
- Maintains references to all watchers for proper cleanup
- Handles both synchronous and asynchronous operations
- Provides comprehensive logging through a custom logger 
