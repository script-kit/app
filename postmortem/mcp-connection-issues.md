# MCP Connection Issues Postmortem

## Date: December 6, 2025

## Summary
Fixed multiple issues with the MCP (Model Context Protocol) HTTP server that were causing connection failures, response delivery problems, and stale metadata caching.

## Issues Identified

### 1. MCP Server Response Delivery Failure
**Problem**: Multiple MCP clients connecting to the same server instance were experiencing response delivery failures. Responses intended for one client were being sent to another client.

**Root Cause**: All clients were sharing a single MCP server instance, causing transport connections to be overwritten when new clients connected.

**Fix**: Created separate MCP server instances for each session, ensuring proper isolation between clients.

### 2. Missing Timestamps in Logs
**Problem**: Log entries lacked timestamps, making it difficult to diagnose startup performance and connection timing issues.

**Root Cause**: The electron-log configuration wasn't set up to include timestamps in the log format.

**Fix**: 
- Configured electron-log format to include timestamps: `[YYYY-MM-DD HH:MM:SS.mmm] [level] message`
- Applied format to both main log and all specialized log instances
- Added performance metrics to track operation durations

### 3. Slow MCP Server Startup
**Problem**: The MCP HTTP server was blocking on script loading during startup, causing delays in accepting connections.

**Root Cause**: Scripts were being loaded synchronously before the server could start accepting connections.

**Fix**:
- Server now starts immediately without waiting for script loading
- Scripts are pre-loaded asynchronously after server is ready
- Added caching for script metadata to speed up server instance creation
- Added `/ready` endpoint to check if scripts are loaded

### 4. Streamable HTTP Session Management
**Problem**: Clients were getting "No server info found" errors when using the streamableHttp transport, causing them to fall back to SSE after a 60-second timeout.

**Root Cause**: The server wasn't returning the `Mcp-Session-Id` header in initialization responses as required by the MCP specification.

**Fix**:
- Pre-generate session IDs when creating transports
- Intercept initialization responses to add the `Mcp-Session-Id` header
- Properly handle session ID in subsequent requests

### 5. Stale Script Metadata Cache
**Problem**: When users disconnected, modified script metadata, and reconnected, they were still getting the old cached version of the scripts.

**Root Cause**: Script metadata was cached indefinitely without any refresh mechanism.

**Fix**:
- Force refresh scripts when creating new sessions
- Added 30-second cache TTL (time-to-live)
- Cache timestamp tracking with age logging

### 6. Missing MCP Status in System Tray
**Problem**: Users had no visibility into MCP server status or available scripts.

**Root Cause**: The system tray menu didn't include any MCP-specific information.

**Fix**:
- Added MCP server port display
- Created dedicated MCP submenu showing:
  - Count of MCP-enabled scripts
  - Details for individual scripts (name, description, path, args)
  - Refresh option to reload script list

## Performance Improvements

1. **Startup Time**: Server now starts in milliseconds instead of waiting for script loading
2. **Connection Time**: New sessions connect in 1-2ms (previously 60+ second timeouts)
3. **Script Loading**: Cached scripts load in 0ms, fresh loads typically complete in 100-300ms
4. **Session Creation**: MCP server instances created in 1-2ms with cached scripts

## Key Metrics Added

- MCP server startup duration
- Script loading duration (both database fetch and processing)
- Tool registration time
- Cache age when using cached data
- Session initialization timing

## Technical Details

### Architecture Changes
- Moved from single shared MCP server to per-session instances
- Implemented proper HTTP session management with session IDs
- Added script metadata caching with TTL
- Separated server startup from script loading

### New Endpoints
- `/health` - Simple health check
- `/ready` - Check if scripts are loaded
- `/endpoints` - Document available API endpoints

### Logging Improvements
- All logs now include millisecond-precision timestamps
- Added performance metrics throughout the stack
- Better error messages for debugging

## Lessons Learned

1. **Session Isolation**: Always create separate server instances for concurrent clients to avoid state mixing
2. **Spec Compliance**: Following the MCP specification exactly (especially headers) is crucial for client compatibility
3. **Async Loading**: Never block server startup on potentially slow operations
4. **Cache Management**: Always implement cache expiration for data that can change
5. **Observability**: Detailed timing logs are essential for diagnosing performance issues

## Future Considerations

1. Consider implementing connection pooling for better resource management
2. Add metrics collection for monitoring MCP server health
3. Implement more granular cache invalidation based on file watchers
4. Consider adding retry logic for script loading failures