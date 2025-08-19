This file is a merged representation of a subset of the codebase, containing specifically included files, combined into a single document by Repomix.
The content has been processed where line numbers have been added.

# File Summary

## Purpose
This file contains a packed representation of a subset of the repository's contents that is considered the most important context.
It is designed to be easily consumable by AI systems for analysis, code review,
or other automated processes.

## File Format
The content is organized as follows:
1. This summary section
2. Repository information
3. Directory structure
4. Repository files (if enabled)
5. Multiple file entries, each consisting of:
  a. A header with the file path (## File: path/to/file)
  b. The full contents of the file in a code block

## Usage Guidelines
- This file should be treated as read-only. Any changes should be made to the
  original repository files, not this packed version.
- When processing this file, use the file path to distinguish
  between different files in the repository.
- Be aware that this file may contain sensitive information. Handle it with
  the same level of security as you would the original repository.

## Notes
- Some files may have been excluded based on .gitignore rules and Repomix's configuration
- Binary files are not included in this packed representation. Please refer to the Repository Structure section for a complete list of file paths, including binary files
- Only files matching these patterns are included: **/input.tsx, **/avatar-cache.ts, **/image-cache.ts, **/prompt.set-prompt-data.ts, **/prompt.init-utils.ts, **/watcher.ts, **/app-core.ts, **/ipc.ts, **/enums.ts
- Files matching patterns in .gitignore are excluded
- Files matching default ignore patterns are excluded
- Line numbers have been added to the beginning of each line
- Files are sorted by Git change count (files with more changes are at the bottom)

# Directory Structure
```
src/
  main/
    avatar-cache.ts
    ipc.ts
    prompt.init-utils.ts
    prompt.set-prompt-data.ts
    watcher.ts
  renderer/
    src/
      components/
        input.tsx
      state/
        atoms/
          app-core.ts
          ipc.ts
        services/
          ipc.ts
      utils/
        image-cache.ts
  shared/
    enums.ts
```

# Files

## File: src/main/avatar-cache.ts
```typescript
  1: /**
  2:  * Avatar cache managed by the main process
  3:  * Persists across browser windows
  4:  */
  5: 
  6: import { app } from 'electron';
  7: import { readFile, writeFile, mkdir } from 'node:fs/promises';
  8: import path from 'node:path';
  9: import axios from 'axios';
 10: import { mainLog } from './logs';
 11: 
 12: const CACHE_DIR = path.join(app.getPath('userData'), 'avatar-cache');
 13: const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days
 14: 
 15: interface CacheEntry {
 16:   dataUrl: string;
 17:   timestamp: number;
 18:   url: string;
 19: }
 20: 
 21: // In-memory cache for quick access
 22: const memoryCache = new Map<string, CacheEntry>();
 23: 
 24: async function ensureCacheDir() {
 25:   try {
 26:     await mkdir(CACHE_DIR, { recursive: true });
 27:   } catch (error) {
 28:     mainLog.error('Failed to create avatar cache directory:', error);
 29:   }
 30: }
 31: 
 32: function getCacheFilePath(url: string): string {
 33:   // Create a safe filename from URL
 34:   const sanitized = url.replace(/[^a-zA-Z0-9]/g, '_');
 35:   return path.join(CACHE_DIR, `${sanitized}.json`);
 36: }
 37: 
 38: export async function getCachedAvatar(avatarUrl: string): Promise<string | null> {
 39:   if (!avatarUrl) return null;
 40: 
 41:   try {
 42:     // Check memory cache first
 43:     const memCached = memoryCache.get(avatarUrl);
 44:     if (memCached && Date.now() - memCached.timestamp < CACHE_DURATION) {
 45:       mainLog.info(`Avatar cache hit (memory): ${avatarUrl}`);
 46:       return memCached.dataUrl;
 47:     }
 48: 
 49:     // Check disk cache
 50:     const cachePath = getCacheFilePath(avatarUrl);
 51:     try {
 52:       const cacheData = await readFile(cachePath, 'utf-8');
 53:       const entry: CacheEntry = JSON.parse(cacheData);
 54:       
 55:       if (Date.now() - entry.timestamp < CACHE_DURATION) {
 56:         mainLog.info(`Avatar cache hit (disk): ${avatarUrl}`);
 57:         // Store in memory for next time
 58:         memoryCache.set(avatarUrl, entry);
 59:         return entry.dataUrl;
 60:       }
 61:     } catch {
 62:       // Cache miss or invalid cache file
 63:     }
 64: 
 65:     // Fetch and cache the avatar
 66:     mainLog.info(`Fetching avatar: ${avatarUrl}`);
 67:     const response = await axios.get(avatarUrl, {
 68:       responseType: 'arraybuffer',
 69:       timeout: 5000,
 70:       headers: {
 71:         'User-Agent': 'Script-Kit-App'
 72:       }
 73:     });
 74: 
 75:     // Convert to base64 data URL
 76:     const base64 = Buffer.from(response.data).toString('base64');
 77:     const contentType = response.headers['content-type'] || 'image/png';
 78:     const dataUrl = `data:${contentType};base64,${base64}`;
 79: 
 80:     // Save to cache
 81:     const entry: CacheEntry = {
 82:       dataUrl,
 83:       timestamp: Date.now(),
 84:       url: avatarUrl
 85:     };
 86: 
 87:     // Save to memory cache
 88:     memoryCache.set(avatarUrl, entry);
 89: 
 90:     // Save to disk cache
 91:     await ensureCacheDir();
 92:     await writeFile(cachePath, JSON.stringify(entry), 'utf-8');
 93:     
 94:     mainLog.info(`Avatar cached: ${avatarUrl}`);
 95:     return dataUrl;
 96: 
 97:   } catch (error) {
 98:     mainLog.error('Failed to get cached avatar:', error);
 99:     // Return original URL as fallback
100:     return avatarUrl;
101:   }
102: }
103: 
104: export async function clearAvatarCache(): Promise<void> {
105:   try {
106:     memoryCache.clear();
107:     // Could also clear disk cache here if needed
108:     mainLog.info('Avatar cache cleared');
109:   } catch (error) {
110:     mainLog.error('Failed to clear avatar cache:', error);
111:   }
112: }
```

## File: src/main/watcher.ts
```typescript
   1: import { existsSync, readdirSync } from 'node:fs';
   2: import { lstat, readFile, readdir, rm } from 'node:fs/promises';
   3: import path from 'node:path';
   4: import { getUserJson } from '@johnlindquist/kit/core/db';
   5: import { Channel, Env } from '@johnlindquist/kit/core/enum';
   6: import type { Script, Scriptlet } from '@johnlindquist/kit/types';
   7: import { Notification, shell } from 'electron';
   8: import { globby } from 'globby';
   9: import { debounce } from 'lodash-es';
  10: import { isEqual, omit } from 'lodash-es';
  11: import madge, { type MadgeModuleDependencyGraph } from 'madge';
  12: import { packageUp } from 'package-up';
  13: import { snapshot } from 'valtio';
  14: import { subscribeKey } from 'valtio/utils';
  15: 
  16: import { getKenvFromPath, kenvPath, kitPath, parseScript, resolveToScriptPath } from '@johnlindquist/kit/core/utils';
  17: 
  18: import chokidar, { type FSWatcher } from 'chokidar';
  19: import { shortcutScriptChanged, unlinkShortcuts } from './shortcuts';
  20: 
  21: import { backgroundScriptChanged, removeBackground } from './background';
  22: import { cancelSchedule, scheduleScriptChanged } from './schedule';
  23: import { debounceSetScriptTimestamp, kitState, sponsorCheck } from './state';
  24: import { systemScriptChanged, unlinkEvents } from './system-events';
  25: import { removeWatch, watchScriptChanged } from './watch';
  26: 
  27: import { clearInterval, setInterval } from 'node:timers';
  28: import { AppChannel, Trigger } from '../shared/enums';
  29: import { KitEvent, emitter } from '../shared/events';
  30: import { compareArrays, diffArrays } from '../shared/utils';
  31: import { reloadApps } from './apps';
  32: import { sendToAllPrompts } from './channel';
  33: import { type WatchEvent, getWatcherManager, startWatching } from './chokidar';
  34: import { pathExists, pathExistsSync, writeFile } from './cjs-exports';
  35: import { actualHideDock, showDock } from './dock';
  36: import { loadKenvEnvironment } from './env-utils';
  37: import { isInDirectory } from './helpers';
  38: import { cacheMainScripts, debounceCacheMainScripts } from './install';
  39: import { runScript } from './kit';
  40: import { getFileImports } from './npm';
  41: import { kenvChokidarPath, kitChokidarPath, slash } from './path-utils';
  42: import {
  43:   clearIdleProcesses,
  44:   ensureIdleProcess,
  45:   sendToAllActiveChildren,
  46:   spawnShebang,
  47:   updateTheme,
  48: } from './process';
  49: import { setKitStateAtom } from './prompt';
  50: import { clearPromptCache, clearPromptCacheFor } from './prompt.cache';
  51: import { setCSSVariable } from './theme';
  52: import { removeSnippet, snippetScriptChanged, addTextSnippet } from './tick';
  53: 
  54: import { watcherLog as log, scriptLog } from './logs';
  55: import { prompts } from './prompts';
  56: import { createIdlePty } from './pty';
  57: 
  58: // Add a map to track recently processed files
  59: const recentlyProcessedFiles = new Map<string, number>();
  60: 
  61: /**
  62:  * Normalize a file path to ensure consistent comparison across platforms
  63:  * This handles differences between Windows and Unix-style paths
  64:  */
  65: const normalizePath = (filePath: string): string => {
  66:   // Convert to forward slashes for consistency
  67:   const normalized = filePath.replace(/\\/g, '/');
  68:   // Ensure case-insensitive comparison on Windows
  69:   return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
  70: };
  71: 
  72: // Helper to check if a file was recently processed
  73: const wasRecentlyProcessed = (filePath: string): boolean => {
  74:   const normalizedPath = normalizePath(filePath);
  75: 
  76:   // Check for exact match first
  77:   let timestamp = recentlyProcessedFiles.get(normalizedPath);
  78: 
  79:   // If no exact match, check if any stored path resolves to the same file
  80:   if (!timestamp) {
  81:     for (const [storedPath, storedTimestamp] of recentlyProcessedFiles.entries()) {
  82:       // For Windows, do case-insensitive comparison
  83:       if (normalizePath(storedPath) === normalizedPath) {
  84:         timestamp = storedTimestamp;
  85:         break;
  86:       }
  87:     }
  88:   }
  89: 
  90:   if (!timestamp) {
  91:     return false;
  92:   }
  93: 
  94:   const now = Date.now();
  95:   const fiveSecondsAgo = now - 5000; // 5 second cooldown
  96: 
  97:   // If the file was processed in the last 5 seconds, ignore it
  98:   return timestamp > fiveSecondsAgo;
  99: };
 100: 
 101: // Helper to mark a file as processed
 102: const markFileAsProcessed = (filePath: string): void => {
 103:   const normalizedPath = normalizePath(filePath);
 104:   recentlyProcessedFiles.set(normalizedPath, Date.now());
 105: 
 106:   // Schedule cleanup of old entries
 107:   setTimeout(() => {
 108:     recentlyProcessedFiles.delete(normalizedPath);
 109:   }, 5000);
 110: };
 111: 
 112: const unlinkScript = (filePath: string) => {
 113:   cancelSchedule(filePath);
 114:   unlinkEvents(filePath);
 115:   removeWatch(filePath);
 116:   removeBackground(filePath);
 117:   removeSnippet(filePath);
 118:   unlinkShortcuts(filePath);
 119:   unlinkBin(filePath);
 120: };
 121: 
 122: const logEvents: { event: WatchEvent; filePath: string }[] = [];
 123: 
 124: const logAllEvents = () => {
 125:   const adds: string[] = [];
 126:   const changes: string[] = [];
 127:   const removes: string[] = [];
 128: 
 129:   for (const { event, filePath } of logEvents) {
 130:     if (event === 'add') {
 131:       adds.push(filePath);
 132:     }
 133:     if (event === 'change') {
 134:       changes.push(filePath);
 135:     }
 136:     if (event === 'unlink') {
 137:       removes.push(filePath);
 138:     }
 139:   }
 140: 
 141:   if (adds.length > 0) {
 142:     log.info('adds', adds);
 143:   }
 144:   if (changes.length > 0) {
 145:     log.info('changes', changes);
 146:   }
 147:   if (removes.length > 0) {
 148:     log.info('removes', removes);
 149:   }
 150: 
 151:   adds.length = 0;
 152:   changes.length = 0;
 153:   removes.length = 0;
 154: 
 155:   logEvents.length = 0;
 156: };
 157: 
 158: const debouncedLogAllEvents = debounce(logAllEvents, 1000);
 159: 
 160: let prevFilePath = '';
 161: const logQueue = (event: WatchEvent, filePath: string) => {
 162:   if (prevFilePath !== filePath) {
 163:     logEvents.push({ event, filePath });
 164:     debouncedLogAllEvents();
 165:   }
 166:   prevFilePath = filePath;
 167: };
 168: 
 169: const unlinkBin = (filePath: string) => {
 170:   const binPath = path.resolve(path.dirname(path.dirname(filePath)), 'bin', path.basename(filePath));
 171:   const { dir } = path.parse(binPath);
 172:   if (existsSync(binPath) && dir.endsWith('bin')) {
 173:     log.info(`Removing ${binPath}`);
 174:     rm(binPath);
 175:   }
 176: };
 177: 
 178: const checkFileImports = debounce(async (script: Script) => {
 179:   let imports: string[] = [];
 180:   try {
 181:     imports = await getFileImports(
 182:       script.filePath,
 183:       kenvPath('package.json'),
 184:       script.kenv ? kenvPath('kenvs', script.kenv, 'package.json') : undefined,
 185:     );
 186:   } catch (error) {
 187:     log.error(error);
 188:     imports = [];
 189:   }
 190: 
 191:   log.info({ imports });
 192: 
 193:   if (imports?.length > 0 && kitState.kenvEnv?.KIT_AUTO_INSTALL !== 'false') {
 194:     const scriptDirPath = path.dirname(script.filePath);
 195:     const packagePath = await packageUp({
 196:       cwd: scriptDirPath,
 197:     });
 198:     let cwd = '';
 199:     if (packagePath) {
 200:       cwd = path.dirname(packagePath);
 201:     }
 202:     log.info(`📦 ${script.filePath} missing imports`, imports);
 203:     emitter.emit(KitEvent.RunPromptProcess, {
 204:       scriptPath: kitPath('cli', 'npm.js'),
 205:       args: imports,
 206:       options: {
 207:         force: true,
 208:         trigger: Trigger.Info,
 209:         cwd,
 210:       },
 211:     });
 212:   }
 213: }, 25);
 214: 
 215: let depWatcher: FSWatcher;
 216: let depGraph: MadgeModuleDependencyGraph = {};
 217: const getDepWatcher = () => {
 218:   if (depWatcher) {
 219:     return depWatcher;
 220:   }
 221: 
 222:   depWatcher = chokidar.watch(kenvChokidarPath('package.json'), {
 223:     ignoreInitial: kitState.ignoreInitial,
 224:   });
 225: 
 226:   depWatcher.on('all', async (eventName, filePath) => {
 227:     log.info(
 228:       `🔍 ${filePath} triggered a ${eventName} event. It's a known dependency of one or more scripts. Doing a reverse lookup...`,
 229:     );
 230: 
 231:     // globby requires forward slashes
 232:     const relativeFilePath = path.relative(kenvPath(), filePath).replace(/\\/g, '/');
 233:     const affectedScripts = findEntryScripts(depGraph, relativeFilePath);
 234: 
 235:     log.info(`🔍 ${filePath} is a dependency of these scripts:`, Array.from(affectedScripts));
 236:     log.info('Clearing their respective caches...');
 237: 
 238:     // Mark the dependency file as processed - using normalized path
 239:     markFileAsProcessed(filePath);
 240: 
 241:     for await (const relativeScriptPath of affectedScripts) {
 242:       const fullPath = kenvPath(relativeScriptPath);
 243: 
 244:       // Mark affected scripts as processed to prevent duplicate change events - using normalized path
 245:       markFileAsProcessed(fullPath);
 246: 
 247:       const cachePath = path.join(
 248:         path.dirname(kenvPath(relativeScriptPath)),
 249:         '.cache',
 250:         path.basename(relativeScriptPath) + '.js',
 251:       );
 252:       if (await lstat(cachePath).catch(() => false)) {
 253:         log.info(`🔥 Clearing cache for ${relativeScriptPath} at ${cachePath}`);
 254:         await rm(cachePath);
 255:       } else {
 256:         log.info(`🤔 Cache for ${relativeScriptPath} at ${cachePath} does not exist...`);
 257:       }
 258: 
 259:       log.info(`Sending ${fullPath} to all active children`, {
 260:         event: Channel.SCRIPT_CHANGED,
 261:         state: fullPath,
 262:       });
 263:       sendToAllActiveChildren({
 264:         channel: Channel.SCRIPT_CHANGED,
 265:         state: fullPath,
 266:       });
 267: 
 268:       checkFileImports({
 269:         filePath,
 270:         kenv: getKenvFromPath(filePath),
 271:       } as Script);
 272:     }
 273:   });
 274: 
 275:   return depWatcher;
 276: };
 277: 
 278: function findEntryScripts(
 279:   graph: MadgeModuleDependencyGraph,
 280:   relativeDepPath: string,
 281:   checkedScripts: Set<string> = new Set(),
 282: ): Set<string> {
 283:   const entries = new Set<string>();
 284:   for (const [script, deps] of Object.entries(graph)) {
 285:     if (deps.includes(relativeDepPath) && !checkedScripts.has(script)) {
 286:       log.info(`🔍 Found ${relativeDepPath} as a dependency of`, script);
 287:       checkedScripts.add(script);
 288:       // Recursively find other scripts that depend on this script
 289:       const more = findEntryScripts(graph, script, checkedScripts);
 290:       if (more.size === 0) {
 291:         entries.add(script);
 292:       } else {
 293:         for (const entry of more) {
 294:           entries.add(entry);
 295:         }
 296:       }
 297:     }
 298:   }
 299: 
 300:   return entries;
 301: }
 302: 
 303: const madgeAllScripts = debounce(async (originalFilePath?: string) => {
 304:   const kenvs = await readdir(kenvPath('kenvs'), {
 305:     withFileTypes: true,
 306:   });
 307: 
 308:   const allScriptPaths = await globby([
 309:     slash(kenvPath('scripts', '*')),
 310:     ...kenvs.filter((k) => k.isDirectory()).map((kenv) => slash(kenvPath('kenvs', kenv.name, 'scripts', '*'))),
 311:   ]);
 312: 
 313:   log.info(`🔍 ${allScriptPaths.length} scripts found`);
 314: 
 315:   // Mark all scripts as being processed - using normalized paths
 316:   // EXCEPT the original file that triggered this scan
 317:   for (const scriptPath of allScriptPaths) {
 318:     // Don't mark the original file that triggered this scan
 319:     if (!originalFilePath || normalizePath(scriptPath) !== normalizePath(originalFilePath)) {
 320:       markFileAsProcessed(scriptPath);
 321:     }
 322:   }
 323: 
 324:   const fileMadge = await madge(allScriptPaths, {
 325:     baseDir: kenvChokidarPath(),
 326:     dependencyFilter: (source) => {
 327:       const isInKenvPath = isInDirectory(source, kenvPath());
 328:       const notInKitSDK = !source.includes('.kit');
 329:       const notAURL = !source.includes('://');
 330:       return isInKenvPath && notInKitSDK && notAURL;
 331:     },
 332:   });
 333:   depGraph = fileMadge.obj();
 334: 
 335:   const depWatcher = getDepWatcher();
 336:   const watched = depWatcher.getWatched();
 337:   for (const [dir, files] of Object.entries(watched)) {
 338:     for (const file of files) {
 339:       const filePath = path.join(dir, file);
 340:       log.verbose(`Unwatching ${filePath}`);
 341:       depWatcher.unwatch(filePath);
 342:     }
 343:   }
 344: 
 345:   for (const scriptKey of Object.keys(depGraph)) {
 346:     const deps = depGraph[scriptKey];
 347:     for (const dep of deps) {
 348:       const depKenvPath = kenvChokidarPath(dep);
 349:       log.verbose(`Watching ${depKenvPath}`);
 350:       depWatcher.add(depKenvPath);
 351: 
 352:       // Mark dependencies as processed too - using normalized paths
 353:       markFileAsProcessed(depKenvPath);
 354:     }
 355: 
 356:     if (deps.length > 0) {
 357:       log.info(`${scriptKey} has ${deps.length} dependencies`, deps);
 358:     }
 359:   }
 360: }, 100);
 361: 
 362: let themeWatcher: FSWatcher;
 363: function watchTheme() {
 364:   const themePath: string =
 365:     (kitState.isDark ? kitState.kenvEnv?.KIT_THEME_DARK : kitState.kenvEnv?.KIT_THEME_LIGHT) || '';
 366:   if (themeWatcher) {
 367:     log.info(`🎨 Unwatching ${themePath}`);
 368:     themeWatcher.close();
 369:   }
 370:   if (pathExistsSync(themePath)) {
 371:     log.info(`🎨 Watching ${themePath}`);
 372:     themeWatcher = chokidar.watch(slash(themePath), {
 373:       ignoreInitial: true,
 374:     });
 375:     themeWatcher.on('all', (_eventName, filePath) => {
 376:       log.info(`🎨 ${filePath} changed`);
 377:       updateTheme();
 378:     });
 379:   }
 380: }
 381: 
 382: const settleFirstBatch = debounce(() => {
 383:   kitState.firstBatch = false;
 384:   scriptLog.info('First batch settled ✅');
 385: }, 1000);
 386: 
 387: /**
 388:  * Determines whether we should timestamp the script and notify
 389:  * children about the script change based on the current kit state
 390:  * and whether this script is a result of a rebuild, etc.
 391:  */
 392: function shouldTimestampScript(_event: WatchEvent, rebuilt: boolean, _skipCacheMainMenu: boolean): boolean {
 393:   // If kitState isn't ready or we are rebuilding or still in first batch,
 394:   // we won't timestamp the script and run the standard "change" flow.
 395:   // The return value indicates if we proceed with timestamping.
 396:   return kitState.ready && !rebuilt && !kitState.firstBatch;
 397: }
 398: 
 399: /**
 400:  * Handles the script timestamping and notifying children
 401:  * that a script has changed.
 402:  */
 403: function timestampAndNotifyChildren(event: WatchEvent, script: Script) {
 404:   debounceSetScriptTimestamp({
 405:     filePath: script.filePath,
 406:     changeStamp: Date.now(),
 407:     reason: `${event} ${script.filePath}`,
 408:   });
 409: 
 410:   // Only notify children of a script change if it's actually a change (not an add).
 411:   if (event === 'change') {
 412:     checkFileImports(script);
 413:     sendToAllActiveChildren({
 414:       channel: Channel.SCRIPT_CHANGED,
 415:       state: script.filePath,
 416:     });
 417:   }
 418: }
 419: 
 420: /**
 421:  * Handles the scenario where we're not ready to timestamp or
 422:  * skip the standard steps. We log a message and possibly bail out
 423:  * early if skipCacheMainMenu is false.
 424:  */
 425: function handleNotReady(script: Script, _event: WatchEvent, rebuilt: boolean, skipCacheMainMenu: boolean) {
 426:   log.info(
 427:     `⌚️ ${script.filePath} changed, but main menu hasn't run yet. Skipping compiling TS and/or timestamping...`,
 428:     {
 429:       ready: kitState.ready,
 430:       rebuilt,
 431:       firstBatch: kitState.firstBatch,
 432:     },
 433:   );
 434: 
 435:   // If we can't skip the main menu caching, exit early to avoid
 436:   // the usual add/change flow.
 437:   if (!skipCacheMainMenu) {
 438:     return true; // indicates early return
 439:   }
 440: 
 441:   return false; // indicates we should continue
 442: }
 443: 
 444: /**
 445:  * Perform the additional script-changed logic that happens after
 446:  * the timestamping step is either applied or skipped.
 447:  */
 448: async function finalizeScriptChange(script: Script) {
 449:   // All these calls are side-effects that happen for both add/change
 450:   // once we've either timestamped or decided not to.
 451:   scheduleScriptChanged(script);
 452:   systemScriptChanged(script);
 453:   watchScriptChanged(script);
 454:   backgroundScriptChanged(script);
 455:   snippetScriptChanged(script);
 456:   await shortcutScriptChanged(script);
 457: 
 458:   // Once the script is fully "added" or "changed", let all children know.
 459:   sendToAllActiveChildren({
 460:     channel: Channel.SCRIPT_ADDED,
 461:     state: script.filePath,
 462:   });
 463: 
 464:   // Clear any prompt caches associated with this script.
 465:   clearPromptCacheFor(script.filePath);
 466: }
 467: 
 468: /**
 469:  * If the event is "unlink," perform all necessary cleanup.
 470:  */
 471: function handleUnlinkEvent(script: Script) {
 472:   unlinkScript(script.filePath);
 473: 
 474:   sendToAllActiveChildren({
 475:     channel: Channel.SCRIPT_REMOVED,
 476:     state: script.filePath,
 477:   });
 478: }
 479: 
 480: /**
 481:  * If the event is "add" or "change," we have a specific flow.
 482:  * This function orchestrates whether we timestamp the script,
 483:  * notify children, or skip certain steps.
 484:  */
 485: async function handleAddOrChangeEvent(event: WatchEvent, script: Script, rebuilt: boolean, skipCacheMainMenu: boolean) {
 486:   // Log the queue right away for "add"/"change"
 487:   logQueue(event, script.filePath);
 488: 
 489:   // Decide if we do normal timestamp or skip
 490:   if (shouldTimestampScript(event, rebuilt, skipCacheMainMenu)) {
 491:     timestampAndNotifyChildren(event, script);
 492:   }
 493: 
 494:   // Wrap up the rest of the script-changed logic
 495:   await finalizeScriptChange(script);
 496: }
 497: 
 498: /**
 499:  * Main function to handle script changes. We keep the signature the same
 500:  * so we don't break any existing contracts. Internally, we orchestrate
 501:  * smaller, well-named functions for each part of the flow.
 502:  */
 503: export const onScriptChanged = async (
 504:   event: WatchEvent,
 505:   script: Script,
 506:   rebuilt = false,
 507:   skipCacheMainMenu = false,
 508: ) => {
 509:   scriptLog.info('🚨 onScriptChanged', event, script.filePath);
 510: 
 511:   // Check if this file was recently processed by madgeAllScripts
 512:   // If so, ignore this change event to prevent cascading changes
 513:   if (wasRecentlyProcessed(script.filePath) && !rebuilt) {
 514:     log.info(`🛑 Ignoring change event for ${script.filePath} - recently processed by dependency scanner`);
 515:     return;
 516:   }
 517: 
 518:   // If this is the first batch of scripts, settle that first.
 519:   if (kitState.firstBatch) {
 520:     settleFirstBatch();
 521:   }
 522: 
 523:   // Re-run any dependency checks across scripts
 524:   // Pass the original file path so it won't be marked as processed
 525:   madgeAllScripts(script.filePath);
 526: 
 527:   log.info(`👀 ${event} ${script.filePath}`);
 528: 
 529:   // 1. Handle "unlink" events
 530:   if (event === 'unlink') {
 531:     handleUnlinkEvent(script);
 532:   }
 533: 
 534:   // 2. Handle "add" or "change" events
 535:   if (event === 'change' || event === 'add') {
 536:     await handleAddOrChangeEvent(event, script, rebuilt, skipCacheMainMenu);
 537:   }
 538: 
 539:   // 3. Update the main scripts cache if necessary.
 540:   //    If we added or removed a script, but skipping main menu caching is false,
 541:   //    then trigger the debounced cache re-build.
 542:   if ((event === 'add' || event === 'unlink') && !skipCacheMainMenu) {
 543:     debounceCacheMainScripts('Script added or unlinked');
 544:   }
 545: 
 546:   // 4. Notify MCP clients if this is an MCP-enabled script
 547:   if (script.mcp && (event === 'change' || event === 'add' || event === 'unlink')) {
 548:     emitter.emit(KitEvent.MCPToolChanged, {
 549:       script,
 550:       action: event === 'unlink' ? 'removed' : event === 'add' ? 'added' : 'updated'
 551:     });
 552:   }
 553: };
 554: 
 555: export const checkUserDb = debounce(async (eventName: string) => {
 556:   log.info(`checkUserDb ${eventName}`);
 557: 
 558:   let currentUser: any;
 559: 
 560:   try {
 561:     log.info('🔍 Getting user.json');
 562:     currentUser = await getUserJson();
 563:   } catch (error) {
 564:     log.info('🔍 Error getting user.json', error);
 565:     currentUser = {};
 566:   }
 567: 
 568:   // Check if user data has actually changed
 569:   if (isEqual(currentUser, kitState.user)) {
 570:     log.info('User data unchanged, skipping update');
 571:     return;
 572:   }
 573: 
 574:   kitState.user = currentUser;
 575: 
 576:   // Only run set-login if login value changed
 577:   const prevLogin = kitState.user?.login;
 578:   const newLogin = currentUser?.login;
 579:   log.info('Login status', {
 580:     prevLogin: prevLogin || 'undefined',
 581:     newLogin: newLogin || 'undefined',
 582:   });
 583:   if (prevLogin !== newLogin) {
 584:     log.info('🔍 Running set-login', newLogin || Env.REMOVE);
 585:     await runScript(kitPath('config', 'set-login'), newLogin || Env.REMOVE);
 586:   }
 587: 
 588:   const user = snapshot(kitState.user);
 589:   log.info('Send user.json to prompt', {
 590:     login: user?.login,
 591:     name: user?.name,
 592:   });
 593: 
 594:   sendToAllPrompts(AppChannel.USER_CHANGED, user);
 595: 
 596:   const isSponsor = await sponsorCheck('Login', false);
 597:   log.info(`🔍 Sponsor check result: ${isSponsor ? '✅' : '❌'}`);
 598:   kitState.isSponsor = isSponsor;
 599: }, 500);
 600: 
 601: const triggerRunText = debounce(
 602:   async (eventName: WatchEvent) => {
 603:     const runPath = kitPath('run.txt');
 604:     if (eventName === 'add' || eventName === 'change') {
 605:       const runText = await readFile(runPath, 'utf8');
 606:       const [filePath, ...args] = runText.trim().split(' ');
 607:       log.info(`run.txt ${eventName}`, filePath, args);
 608: 
 609:       try {
 610:         const { shebang } = await parseScript(filePath);
 611: 
 612:         if (shebang) {
 613:           spawnShebang({
 614:             shebang,
 615:             filePath,
 616:           });
 617:         } else {
 618:           emitter.emit(KitEvent.RunPromptProcess, {
 619:             scriptPath: resolveToScriptPath(filePath, kenvPath()),
 620:             args: args || [],
 621:             options: {
 622:               force: true,
 623:               trigger: Trigger.RunTxt,
 624:             },
 625:           });
 626:         }
 627:       } catch (error) {
 628:         log.error(error);
 629:       }
 630:     } else {
 631:       log.info('run.txt removed');
 632:     }
 633:   },
 634:   1000,
 635:   {
 636:     leading: true,
 637:   },
 638: );
 639: 
 640: export const refreshScripts = debounce(
 641:   async () => {
 642:     log.info('🌈 Refreshing Scripts...');
 643:     const scripts = kitState.scripts.values();
 644:     for await (const script of scripts) {
 645:       await onScriptChanged('change', script, true);
 646:     }
 647: 
 648:     const scriptlets = kitState.scriptlets.values();
 649:     for await (const scriptlet of scriptlets) {
 650:       await onScriptChanged('change', scriptlet, true);
 651:     }
 652:   },
 653:   500,
 654:   { leading: true },
 655: );
 656: 
 657: const handleScriptletsChanged = debounce(async (eventName: WatchEvent, filePath: string) => {
 658:   scriptLog.info('🚨 dir.endsWith(scriptlets)', eventName, filePath);
 659:   const exists = await pathExists(filePath);
 660:   if (!exists) {
 661:     scriptLog.info(`Scriptlet file ${filePath} has been deleted.`);
 662:     return;
 663:   }
 664:   const beforeScriptlets = structuredClone(kitState.scriptlets);
 665:   scriptLog.info('🎬 Starting cacheMainScripts...');
 666:   try {
 667:     await cacheMainScripts('File change detected');
 668:   } catch (error) {
 669:     log.error(error);
 670:   }
 671:   scriptLog.info('...cacheMainScripts done 🎬');
 672: 
 673:   const afterScriptlets = kitState.scriptlets;
 674: 
 675:   const changedScriptlets: Scriptlet[] = [];
 676:   for (const [filePath, scriptlet] of afterScriptlets.entries()) {
 677:     if (beforeScriptlets.has(filePath)) {
 678:       const beforeScriptlet = beforeScriptlets.get(filePath);
 679:       if (!isEqual(omit(beforeScriptlet, 'id'), omit(scriptlet, 'id'))) {
 680:         scriptLog.info(`👛 Scriptlet ${filePath} has changed.`);
 681:         changedScriptlets.push(scriptlet);
 682:       }
 683:     } else {
 684:       scriptLog.info(`➕ Scriptlet ${filePath} has been added.`);
 685:       changedScriptlets.push(scriptlet);
 686:     }
 687:   }
 688: 
 689:   for await (const scriptlet of changedScriptlets) {
 690:     await onScriptChanged(eventName, scriptlet);
 691:   }
 692: 
 693:   return;
 694: }, 50);
 695: 
 696: export async function handleSnippetFileChange(eventName: WatchEvent, snippetPath: string) {
 697:   log.info(`handleSnippetFileChange ${eventName} ${snippetPath}`);
 698: 
 699:   if (eventName === 'unlink') {
 700:     removeSnippet(snippetPath);
 701:     return;
 702:   }
 703: 
 704:   // if 'add' or 'change', use the existing addTextSnippet function
 705:   // which properly registers snippets with their snippet key
 706:   if (eventName === 'add' || eventName === 'change') {
 707:     await addTextSnippet(snippetPath);
 708:   }
 709: }
 710: 
 711: const showThemeConflictNotification = () => {
 712:   const notification = new Notification({
 713:     title: 'Theme Configuration Notice',
 714:     body: 'You have both kit.css and theme environment variables set. Your kit.css changes are being applied on top of the selected theme. Click to learn more.',
 715:     silent: true,
 716:   });
 717: 
 718:   notification.on('click', () => {
 719:     // Open the .env file to show the user where the theme variables are set
 720:     const envPath = kenvPath('.env');
 721:     shell.openPath(envPath);
 722:   });
 723: 
 724:   notification.show();
 725: };
 726: 
 727: export const parseEnvFile = debounce(async () => {
 728:   const envData = loadKenvEnvironment();
 729: 
 730:   if (envData?.KIT_LOGIN) {
 731:     log.info('Detected KIT_LOGIN in .env. Setting kitState.kenvEnv.KIT_LOGIN');
 732:     kitState.kenvEnv.KIT_LOGIN = envData?.KIT_LOGIN;
 733:   } else if (kitState.kenvEnv.KIT_LOGIN) {
 734:     log.info('Removing KIT_LOGIN from kitState.kenvEnv');
 735:     kitState.kenvEnv.KIT_LOGIN = undefined;
 736:     kitState.isSponsor = false;
 737:   }
 738: 
 739:   if (envData?.GITHUB_SCRIPTKIT_TOKEN) {
 740:     log.info('Detected GITHUB_SCRIPTKIT_TOKEN in .env. Setting kitState.kenvEnv.GITHUB_SCRIPTKIT_TOKEN');
 741:     kitState.kenvEnv.GITHUB_SCRIPTKIT_TOKEN = envData?.GITHUB_SCRIPTKIT_TOKEN;
 742:   } else if (kitState.kenvEnv.GITHUB_SCRIPTKIT_TOKEN) {
 743:     log.info('Removing GITHUB_SCRIPTKIT_TOKEN from kitState.kenvEnv');
 744:     kitState.kenvEnv.GITHUB_SCRIPTKIT_TOKEN = undefined;
 745:     kitState.isSponsor = false;
 746: 
 747:     checkUserDb('GITHUB_SCRIPTKIT_TOKEN removed');
 748:   }
 749: 
 750:   if (envData?.KIT_API_KEY) {
 751:     log.info('Detected KIT_API_KEY in .env. Setting kitState.kenvEnv.KIT_API_KEY');
 752:     kitState.kenvEnv.KIT_API_KEY = envData?.KIT_API_KEY;
 753:   } else if (kitState.kenvEnv.KIT_API_KEY) {
 754:     log.info('Removing KIT_API_KEY from kitState.kenvEnv');
 755:     kitState.kenvEnv.KIT_API_KEY = undefined;
 756: 
 757:     checkUserDb('KIT_API_KEY removed');
 758:   }
 759: 
 760:   if (envData?.KIT_DOCK) {
 761:     kitState.kenvEnv.KIT_DOCK = envData?.KIT_DOCK;
 762:     if (envData?.KIT_DOCK === 'false') {
 763:       actualHideDock();
 764:     }
 765:     if (envData?.KIT_DOCK === 'true') {
 766:       showDock();
 767:     }
 768:   } else if (kitState.kenvEnv.KIT_DOCK) {
 769:     kitState.kenvEnv.KIT_DOCK = undefined;
 770:     showDock();
 771:   }
 772: 
 773:   let themeVarsChanged = false;
 774: 
 775:   if (envData?.KIT_THEME_LIGHT) {
 776:     log.info('Setting light theme', envData?.KIT_THEME_LIGHT);
 777:     if (kitState.kenvEnv.KIT_THEME_LIGHT !== envData?.KIT_THEME_LIGHT) {
 778:       themeVarsChanged = true;
 779:     }
 780:     kitState.kenvEnv.KIT_THEME_LIGHT = envData?.KIT_THEME_LIGHT;
 781:   } else if (kitState.kenvEnv.KIT_THEME_LIGHT) {
 782:     kitState.kenvEnv.KIT_THEME_LIGHT = undefined;
 783:     log.info('Removing light theme');
 784:   }
 785: 
 786:   if (envData?.KIT_THEME_DARK) {
 787:     log.info('Setting dark theme', envData?.KIT_THEME_DARK);
 788:     if (kitState.kenvEnv.KIT_THEME_DARK !== envData?.KIT_THEME_DARK) {
 789:       themeVarsChanged = true;
 790:     }
 791:     kitState.kenvEnv.KIT_THEME_DARK = envData?.KIT_THEME_DARK;
 792:   } else if (kitState.kenvEnv.KIT_THEME_DARK) {
 793:     kitState.kenvEnv.KIT_THEME_DARK = undefined;
 794:     log.info('Removing dark theme');
 795:   }
 796: 
 797:   // Check if kit.css exists and theme vars were just set
 798:   if (themeVarsChanged && (envData?.KIT_THEME_LIGHT || envData?.KIT_THEME_DARK)) {
 799:     const kitCssPath = kenvPath('kit.css');
 800:     if (await pathExists(kitCssPath)) {
 801:       showThemeConflictNotification();
 802:     }
 803:   }
 804: 
 805:   kitState.tempTheme = '';
 806:   updateTheme();
 807:   watchTheme();
 808: 
 809:   if (envData?.KIT_TERM_FONT) {
 810:     kitState.kenvEnv.KIT_TERM_FONT = envData?.KIT_TERM_FONT;
 811:     sendToAllPrompts(AppChannel.SET_TERM_FONT, envData?.KIT_TERM_FONT);
 812:   } else if (kitState.kenvEnv.KIT_TERM_FONT) {
 813:     kitState.kenvEnv.KIT_TERM_FONT = undefined;
 814:     // Could send a default font here if needed
 815:   }
 816: 
 817:   const defaultKitMono = 'JetBrains Mono';
 818: 
 819:   if (envData?.KIT_MONO_FONT) {
 820:     setCSSVariable('--mono-font', envData?.KIT_MONO_FONT || defaultKitMono);
 821:   } else if (kitState.kenvEnv.KIT_MONO_FONT) {
 822:     kitState.kenvEnv.KIT_MONO_FONT = undefined;
 823:     setCSSVariable('--mono-font', defaultKitMono);
 824:   }
 825: 
 826:   const defaultKitSans = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol'`;
 827:   if (envData?.KIT_SANS_FONT) {
 828:     setCSSVariable('--sans-font', envData?.KIT_SANS_FONT || defaultKitSans);
 829:   } else if (kitState.kenvEnv.KIT_SANS_FONT) {
 830:     kitState.kenvEnv.KIT_SANS_FONT = undefined;
 831:     setCSSVariable('--sans-font', defaultKitSans);
 832:   }
 833: 
 834:   const defaultKitSerif = `'ui-serif', 'Georgia', 'Cambria', '"Times New Roman"', 'Times','serif'`;
 835:   if (envData?.KIT_SERIF_FONT) {
 836:     setCSSVariable('--serif-font', envData?.KIT_SERIF_FONT || defaultKitSerif);
 837:   } else if (kitState.kenvEnv.KIT_SERIF_FONT) {
 838:     kitState.kenvEnv.KIT_SERIF_FONT = undefined;
 839:     setCSSVariable('--serif-font', defaultKitSerif);
 840:   }
 841: 
 842:   if (envData?.KIT_MIC) {
 843:     log.info('Setting mic', envData?.KIT_MIC);
 844:     sendToAllPrompts(AppChannel.SET_MIC_ID, envData?.KIT_MIC);
 845:   }
 846: 
 847:   if (envData?.KIT_WEBCAM) {
 848:     log.info('Setting webcam', envData?.KIT_WEBCAM);
 849:     sendToAllPrompts(AppChannel.SET_WEBCAM_ID, envData?.KIT_WEBCAM);
 850:   }
 851: 
 852:   if (envData?.KIT_TYPED_LIMIT) {
 853:     kitState.typedLimit = Number.parseInt(envData?.KIT_TYPED_LIMIT, 10);
 854:   }
 855: 
 856:   const trustedKenvs = (envData?.[kitState.trustedKenvsKey] || '')
 857:     .split(',')
 858:     .filter(Boolean)
 859:     .map((kenv) => kenv.trim());
 860: 
 861:   log.info('👩‍⚖️ Trusted Kenvs', trustedKenvs);
 862: 
 863:   const trustedKenvsChanged = !compareArrays(trustedKenvs, kitState.trustedKenvs);
 864:   const { added, removed } = diffArrays(kitState.trustedKenvs, trustedKenvs);
 865:   if (added.length > 0 || removed.length > 0) {
 866:     log.info({
 867:       added,
 868:       removed,
 869:     });
 870:   }
 871: 
 872:   kitState.trustedKenvs = trustedKenvs;
 873: 
 874:   if (trustedKenvsChanged) {
 875:     log.info('🍺 Trusted Kenvs changed. Refreshing scripts...');
 876: 
 877:     await refreshScripts();
 878:   }
 879: 
 880:   if (envData?.KIT_NO_PREVIEW) {
 881:     setKitStateAtom({
 882:       noPreview: envData?.KIT_NO_PREVIEW === 'true',
 883:     });
 884:   } else if (kitState.kenvEnv.KIT_NO_PREVIEW) {
 885:     setKitStateAtom({
 886:       noPreview: false,
 887:     });
 888:   }
 889: 
 890:   if (envData?.KIT_WIDTH) {
 891:     kitState.kenvEnv.KIT_WIDTH = envData?.KIT_WIDTH;
 892:   } else if (kitState.kenvEnv.KIT_WIDTH) {
 893:     kitState.kenvEnv.KIT_WIDTH = undefined;
 894:   }
 895: 
 896:   if (envData?.KIT_CACHE_PROMPT) {
 897:     clearPromptCache();
 898:   } else if (kitState.kenvEnv.KIT_CACHE_PROMPT) {
 899:     kitState.kenvEnv.KIT_CACHE_PROMPT = undefined;
 900:     clearPromptCache();
 901:   }
 902: 
 903:   if (envData?.KIT_SUSPEND_WATCHERS) {
 904:     const suspendWatchers = envData?.KIT_SUSPEND_WATCHERS === 'true';
 905:     kitState.suspendWatchers = suspendWatchers;
 906: 
 907:     if (suspendWatchers) {
 908:       log.info('⌚️ Suspending Watchers');
 909:       teardownWatchers('suspendWatchers');
 910:     } else {
 911:       log.info('⌚️ Resuming Watchers');
 912:       setupWatchers('subscribeKey: suspendWatchers: false');
 913:     }
 914:   } else if (kitState.suspendWatchers) {
 915:     kitState.suspendWatchers = false;
 916:     log.info('⌚️ Resuming Watchers');
 917:     setupWatchers('subscribeKey: kitState.suspendWatchers: false');
 918:   }
 919: 
 920:   // VS Code fuzzy search doesn't use these configurations
 921:   // Keeping for backward compatibility but they won't affect search
 922: 
 923:   kitState.kenvEnv = envData;
 924: }, 100);
 925: 
 926: export const restartWatchers = debounce(
 927:   (reason: string) => {
 928:     // Check circuit breaker before doing full system restart
 929:     if (isSystemOverloaded()) {
 930:       log.error(`🚨 System overloaded, skipping full watcher restart for: ${reason}`);
 931:       return;
 932:     }
 933: 
 934:     log.info(`
 935: 
 936:     🔄 Restarting watchers because: ${reason} ----------------------------------------------------------------------
 937: 
 938: `);
 939:     teardownWatchers.cancel();
 940:     setupWatchers.cancel();
 941: 
 942:     try {
 943:       setupWatchers('restartWatchers');
 944:     } catch (error) {
 945:       log.error('❌ Failed to restart watchers:', error);
 946:       recordSystemFailure();
 947:     }
 948:   },
 949:   500,
 950:   { leading: false },
 951: );
 952: 
 953: export function watchKenvDirectory() {
 954:   const kenvFolderWatcher = chokidar.watch(kenvChokidarPath(), {
 955:     ignoreInitial: kitState.ignoreInitial,
 956:     followSymlinks: true,
 957:     depth: 0,
 958:     ignored: (checkPath) => {
 959:       return path.normalize(checkPath) !== path.normalize(kenvChokidarPath());
 960:     },
 961:   });
 962: 
 963:   const watcherHandler = debounce((eventName: WatchEvent, filePath: string) => {
 964:     log.info(`🔄 ${eventName} ${filePath} from kenv folder watcher`);
 965:     if (eventName === 'addDir') {
 966:       if (watchers.length === 0) {
 967:         log.warn(`🔄 ${filePath} added. Setting up watchers...`);
 968:         setupWatchers('addDir');
 969:       } else {
 970:         log.info(`🔄 ${filePath} added, but watchers already exist. No need to setup watchers...`);
 971:       }
 972:     }
 973: 
 974:     if (eventName === 'unlinkDir') {
 975:       log.warn(`🔄 ${filePath} unlinked. Tearing down watchers...`);
 976:       teardownWatchers('unlinkDir');
 977:     }
 978:   }, 500);
 979: 
 980:   const kitFolderWatcher = chokidar.watch(kitChokidarPath(), {
 981:     ignoreInitial: kitState.ignoreInitial,
 982:     followSymlinks: true,
 983:     depth: 0,
 984:     ignored: (checkPath) => {
 985:       return path.normalize(checkPath) !== path.normalize(kitChokidarPath());
 986:     },
 987:   });
 988: 
 989:   kenvFolderWatcher.on('all', watcherHandler);
 990:   kitFolderWatcher.on('all', watcherHandler);
 991: }
 992: 
 993: // ---- Extracted Helper Functions ----
 994: 
 995: function clearAllWatchers(watchers: FSWatcher[]) {
 996:   if (watchers.length === 0) {
 997:     return;
 998:   }
 999: 
1000:   for (const watcher of watchers) {
1001:     try {
1002:       watcher.removeAllListeners();
1003:       watcher.close();
1004:     } catch (error) {
1005:       log.error('Error closing watcher:', error);
1006:     }
1007:   }
1008: 
1009:   log.info(`Cleared ${watchers.length} watchers`);
1010:   watchers.length = 0;
1011: }
1012: 
1013: function stopPingInterval() {
1014:   if (pingInterval) {
1015:     clearInterval(pingInterval);
1016:     pingInterval = null;
1017:   }
1018: }
1019: 
1020: function startPingInterval() {
1021:   stopPingInterval();
1022:   pingInterval = setInterval(async () => {
1023:     if (kitState.waitingForPing) {
1024:       await restartWatchers('No ping response');
1025:       return;
1026:     }
1027: 
1028:     kitState.waitingForPing = true;
1029:     const pingPath = kitPath('ping.txt');
1030:     const currentDate = new Date().toISOString();
1031:     try {
1032:       await writeFile(pingPath, currentDate);
1033:     } catch (error) {
1034:       log.error(`Error writing to ping.txt: ${error}`);
1035:     }
1036:   }, 60000);
1037: }
1038: 
1039: function startCoreWatchers(): FSWatcher[] {
1040:   return startWatching(
1041:     async (eventName: WatchEvent, filePath: string, source) => {
1042:       await handleFileChangeEvent(eventName, filePath, source);
1043:     },
1044:     { ignoreInitial: kitState.ignoreInitial },
1045:   );
1046: }
1047: 
1048: function logActionReason(context: 'Setup' | 'Teardown', reason: string) {
1049:   log.info(`🔄 ${context} watchers because: ${reason}`);
1050: }
1051: 
1052: let pingInterval: NodeJS.Timeout | null = null;
1053: let watchers: FSWatcher[] = [];
1054: let suspendingWatchers: boolean;
1055: 
1056: // ─────────────────────────────────────────────────────────────────────────────
1057: // Granular watcher-health heartbeat with infinite loop protection
1058: // ─────────────────────────────────────────────────────────────────────────────
1059: const HEALTH_INTERVAL = 30_000; // ms
1060: const HEALTH_GRACE = 7_500; // ms after any restart
1061: const MAX_RESTART_ATTEMPTS = 3; // max restarts per watcher per hour
1062: const RESTART_WINDOW = 60 * 60 * 1000; // 1 hour window
1063: const EXPONENTIAL_BACKOFF_BASE = 2; // backoff multiplier
1064: 
1065: let lastRestart = Date.now();
1066: 
1067: // Track restart attempts per watcher key to prevent infinite loops
1068: const restartAttempts = new Map<string, { count: number; firstAttempt: number; lastBackoff: number }>();
1069: 
1070: // Circuit breaker for system-wide failures
1071: const SYSTEM_FAILURE_THRESHOLD = 5; // max system-wide failures per hour
1072: const SYSTEM_FAILURE_WINDOW = 60 * 60 * 1000; // 1 hour
1073: let systemFailures: number[] = []; // timestamps of recent failures
1074: 
1075: const countWatchedFiles = (w: FSWatcher) => Object.values(w.getWatched()).reduce((n, arr) => n + arr.length, 0);
1076: 
1077: /**
1078:  * Check if we can safely restart a watcher without hitting rate limits
1079:  */
1080: function canRestartWatcher(key: string): { canRestart: boolean; waitTime?: number } {
1081:   const now = Date.now();
1082:   const attempts = restartAttempts.get(key);
1083: 
1084:   if (!attempts) {
1085:     // First restart attempt for this watcher
1086:     restartAttempts.set(key, { count: 1, firstAttempt: now, lastBackoff: 0 });
1087:     return { canRestart: true };
1088:   }
1089: 
1090:   // Clean up old attempts outside the window
1091:   if (now - attempts.firstAttempt > RESTART_WINDOW) {
1092:     restartAttempts.set(key, { count: 1, firstAttempt: now, lastBackoff: 0 });
1093:     return { canRestart: true };
1094:   }
1095: 
1096:   // Check if we've hit the max attempts
1097:   if (attempts.count >= MAX_RESTART_ATTEMPTS) {
1098:     const timeUntilReset = RESTART_WINDOW - (now - attempts.firstAttempt);
1099:     log.warn(
1100:       `🛑 Watcher ${key} has hit max restart attempts (${MAX_RESTART_ATTEMPTS}). Backing off for ${Math.round(timeUntilReset / 1000 / 60)} minutes.`,
1101:     );
1102:     return { canRestart: false, waitTime: timeUntilReset };
1103:   }
1104: 
1105:   // Calculate exponential backoff
1106:   const backoffTime = Math.min(
1107:     HEALTH_GRACE * EXPONENTIAL_BACKOFF_BASE ** (attempts.count - 1),
1108:     5 * 60 * 1000, // Max 5 minutes
1109:   );
1110: 
1111:   if (now - attempts.lastBackoff < backoffTime) {
1112:     const waitTime = backoffTime - (now - attempts.lastBackoff);
1113:     return { canRestart: false, waitTime };
1114:   }
1115: 
1116:   // Update attempt count and allow restart
1117:   attempts.count++;
1118:   attempts.lastBackoff = now;
1119:   return { canRestart: true };
1120: }
1121: 
1122: /**
1123:  * Check if the system is experiencing too many failures (circuit breaker)
1124:  */
1125: function isSystemOverloaded(): boolean {
1126:   const now = Date.now();
1127: 
1128:   // Clean up old failures
1129:   systemFailures = systemFailures.filter((timestamp) => now - timestamp < SYSTEM_FAILURE_WINDOW);
1130: 
1131:   if (systemFailures.length >= SYSTEM_FAILURE_THRESHOLD) {
1132:     log.error(
1133:       `🚨 System circuit breaker activated: ${systemFailures.length} failures in the last hour. Suspending watcher restarts.`,
1134:     );
1135:     return true;
1136:   }
1137: 
1138:   return false;
1139: }
1140: 
1141: /**
1142:  * Record a system failure for circuit breaker tracking
1143:  */
1144: function recordSystemFailure() {
1145:   systemFailures.push(Date.now());
1146: }
1147: 
1148: /**
1149:  * Safely restart a watcher with rate limiting and backoff
1150:  */
1151: function safeRestartWatcher(manager: any, key: string, reason: string): boolean {
1152:   // Check circuit breaker first
1153:   if (isSystemOverloaded()) {
1154:     log.warn(`🚨 System overloaded, skipping restart of watcher ${key}`);
1155:     return false;
1156:   }
1157: 
1158:   const { canRestart, waitTime } = canRestartWatcher(key);
1159: 
1160:   if (!canRestart) {
1161:     if (waitTime) {
1162:       log.info(`⏳ Delaying restart of watcher ${key} for ${Math.round(waitTime / 1000)}s (${reason})`);
1163:     }
1164:     return false;
1165:   }
1166: 
1167:   try {
1168:     log.warn(`🔄 Restarting watcher ${key}: ${reason}`);
1169:     manager.restartWatcher(key);
1170:     lastRestart = Date.now();
1171:     return true;
1172:   } catch (error) {
1173:     log.error(`❌ Failed to restart watcher ${key}:`, error);
1174:     recordSystemFailure();
1175:     return false;
1176:   }
1177: }
1178: 
1179: /**
1180:  * Clean up old restart attempt records to prevent memory leaks
1181:  */
1182: function cleanupRestartAttempts() {
1183:   const now = Date.now();
1184:   for (const [key, attempts] of restartAttempts.entries()) {
1185:     if (now - attempts.firstAttempt > RESTART_WINDOW) {
1186:       restartAttempts.delete(key);
1187:     }
1188:   }
1189: }
1190: 
1191: /**
1192:  * Reset circuit breaker when system appears healthy
1193:  */
1194: function checkSystemHealth() {
1195:   const now = Date.now();
1196: 
1197:   // If we haven't had any failures in the last 30 minutes, reset the circuit breaker
1198:   const recentFailures = systemFailures.filter((timestamp) => now - timestamp < 30 * 60 * 1000);
1199: 
1200:   if (recentFailures.length === 0 && systemFailures.length > 0) {
1201:     log.info('🟢 System appears healthy, resetting circuit breaker');
1202:     systemFailures = [];
1203:   }
1204: }
1205: 
1206: // Clean up restart attempts every hour to prevent memory leaks
1207: setInterval(cleanupRestartAttempts, RESTART_WINDOW);
1208: 
1209: // Check system health every 10 minutes
1210: setInterval(checkSystemHealth, 10 * 60 * 1000);
1211: 
1212: setInterval(() => {
1213:   // give new setups a few seconds to settle
1214:   if (Date.now() - lastRestart < HEALTH_GRACE) {
1215:     return;
1216:   }
1217: 
1218:   const manager = getWatcherManager();
1219:   if (!manager) {
1220:     return;
1221:   }
1222: 
1223:   // We don't have the WatcherManager here, but we can introspect each FSWatcher
1224:   for (const w of watchers) {
1225:     const key = manager.keyFor(w);
1226:     if (!key) {
1227:       continue; // Skip if we can't identify the watcher
1228:     }
1229: 
1230:     // CASE 1 – Closed flag flipped
1231:     if ((w as any).closed) {
1232:       if (safeRestartWatcher(manager, key, 'watcher closed unexpectedly')) {
1233:         return; // Exit early after successful restart
1234:       }
1235:       // Continue checking other watchers if restart was rate-limited
1236:     }
1237: 
1238:     // CASE 2 – zero watched files but directory isn't empty (stuck handle)
1239:     const watchedCount = countWatchedFiles(w);
1240:     if (watchedCount === 0) {
1241:       // Acceptable if the root dir truly has no files
1242:       const roots = Object.keys(w.getWatched());
1243:       const rootExists = roots.some((root) => {
1244:         try {
1245:           return readdirSync(root).length > 0;
1246:         } catch {
1247:           return false;
1248:         }
1249:       });
1250: 
1251:       if (rootExists) {
1252:         if (safeRestartWatcher(manager, key, 'watcher saw 0 items but directory has files')) {
1253:           return; // Exit early after successful restart
1254:         }
1255:         // Continue checking other watchers if restart was rate-limited
1256:       }
1257:     }
1258:   }
1259: }, HEALTH_INTERVAL);
1260: 
1261: export const teardownWatchers = debounce(
1262:   (reason: string) => {
1263:     logActionReason('Teardown', reason);
1264:     stopPingInterval();
1265:     clearAllWatchers(watchers);
1266:     lastRestart = Date.now(); // Update restart timestamp
1267:   },
1268:   250,
1269:   { leading: true },
1270: );
1271: 
1272: export const setupWatchers = debounce(
1273:   (reason: string) => {
1274:     logActionReason('Setup', reason);
1275: 
1276:     teardownWatchers('setupWatchers');
1277:     startPingInterval();
1278:     watchers = startCoreWatchers();
1279:     lastRestart = Date.now(); // Update restart timestamp
1280:   },
1281:   1000,
1282:   { leading: true },
1283: );
1284: 
1285: subscribeKey(kitState, 'suspendWatchers', (suspendWatchers) => {
1286:   if (suspendingWatchers === suspendWatchers) {
1287:     return;
1288:   }
1289:   suspendingWatchers = suspendWatchers;
1290: 
1291:   if (suspendWatchers) {
1292:     log.info('⌚️ Suspending Watchers due to state change');
1293:     teardownWatchers('subscribeKey: suspendWatchers');
1294:   } else {
1295:     log.info('⌚️ Resuming Watchers due to state change');
1296:     setupWatchers('subscribeKey: suspendWatchers');
1297:   }
1298: });
1299: 
1300: emitter.on(KitEvent.TeardownWatchers, teardownWatchers);
1301: emitter.on(KitEvent.RestartWatcher, async () => {
1302:   try {
1303:     await setupWatchers('KitEvent.RestartWatcher');
1304:   } catch (error) {
1305:     log.error(error);
1306:   }
1307: });
1308: emitter.on(KitEvent.Sync, () => {
1309:   checkUserDb('sync');
1310: });
1311: 
1312: const COOL_DOWN = 2000;
1313: async function checkValidChange(eventName: WatchEvent, filePath: string): Promise<boolean> {
1314:   if (eventName === 'change') {
1315:     const stats = await stat(filePath).catch(() => {
1316:       return null;
1317:     });
1318: 
1319:     let ignoreTime = COOL_DOWN;
1320:     if (kitState?.kenvEnv?.KIT_CHANGE_COOL_DOWN) {
1321:       ignoreTime = Number.parseInt(kitState?.kenvEnv?.KIT_CHANGE_COOL_DOWN, 10);
1322:     }
1323:     if (stats && stats.mtime.getTime() < Date.now() - ignoreTime) {
1324:       log.info(
1325:         `🛑 Ignoring phantom change event for ${filePath} in handleFileChangeEvent - File hasn't changed since ${stats?.mtime}`,
1326:       );
1327:       return false;
1328:     }
1329:   }
1330:   return true;
1331: }
1332: 
1333: export async function handleFileChangeEvent(eventName: WatchEvent, filePath: string, source: string) {
1334:   // Normalize the file path for consistent handling
1335: 
1336:   const { base, dir, name } = path.parse(filePath);
1337: 
1338:   const validChange = await checkValidChange(eventName, filePath);
1339: 
1340:   if (!validChange) {
1341:     return;
1342:   }
1343: 
1344:   if (base === 'ping.txt') {
1345:     kitState.waitingForPing = false;
1346:     return;
1347:   }
1348: 
1349:   if (base === 'user.json') {
1350:     await checkUserDb(eventName);
1351:     return;
1352:   }
1353: 
1354:   // If directories like 'scripts', 'scriptlets', 'snippets' are removed/added,
1355:   // we restart watchers to ensure correct state
1356:   const isRestartEvent = eventName === 'addDir' || eventName === 'unlinkDir' || eventName === 'changeDir';
1357:   const isRestartDirectory = base === 'scripts' || base === 'scriptlets' || base === 'snippets';
1358:   if (kitState.ready && isRestartEvent && isRestartDirectory) {
1359:     restartWatchers.cancel();
1360:     log.info(`🔄 Changed: ${eventName} ${filePath} from ${source}`);
1361: 
1362:     restartWatchers(`${filePath}: ${eventName}`);
1363: 
1364:     cacheMainScripts('restartWatchers');
1365:     return;
1366:   }
1367: 
1368:   if (base === 'kit.css') {
1369:     log.info('🔄 kit.css changed');
1370: 
1371:     // Check if KIT_THEME_* variables are set
1372:     const hasThemeEnvVars = kitState.kenvEnv?.KIT_THEME_LIGHT || kitState.kenvEnv?.KIT_THEME_DARK;
1373:     const kitCssPath = kenvPath('kit.css');
1374: 
1375:     if (hasThemeEnvVars && (await pathExists(kitCssPath))) {
1376:       // Show notification about the conflict
1377:       showThemeConflictNotification();
1378:     }
1379: 
1380:     for (const prompt of prompts) {
1381:       prompt.attemptReadTheme();
1382:     }
1383:     return;
1384:   }
1385: 
1386:   if (base === 'run.txt') {
1387:     log.info(`run.txt ${eventName}`);
1388:     await triggerRunText(eventName);
1389:     return;
1390:   }
1391: 
1392:   if (base === 'globals.ts') {
1393:     log.info(`globals.ts ${eventName}`);
1394:     clearIdleProcesses();
1395:     ensureIdleProcess();
1396:     createIdlePty();
1397:     return;
1398:   }
1399: 
1400:   if (base.startsWith('.env')) {
1401:     log.info(`🌎 .env: ${filePath} -> ${eventName}`);
1402:     parseEnvFile();
1403:     return;
1404:   }
1405: 
1406:   if (base === 'package.json') {
1407:     log.info('package.json changed');
1408:     return;
1409:   }
1410: 
1411:   if (base === 'scripts.json') {
1412:     log.silly('scripts.json changed. Is this a bug?');
1413:     return;
1414:   }
1415: 
1416:   if (dir.endsWith('snippets')) {
1417:     return handleSnippetFileChange(eventName, filePath);
1418:   }
1419: 
1420:   if (dir.endsWith('scriptlets')) {
1421:     await handleScriptletsChanged(eventName, filePath);
1422:     return;
1423:   }
1424: 
1425:   if (dir.endsWith('scripts')) {
1426:     // Check if this file was recently processed to avoid duplicate processing
1427:     if (wasRecentlyProcessed(filePath) && eventName === 'change') {
1428:       log.info(`🛑 Ignoring change event for ${filePath} in handleFileChangeEvent - recently processed`);
1429:       return;
1430:     }
1431: 
1432:     let script: Script;
1433:     try {
1434:       if (eventName !== 'unlink') {
1435:         script = await parseScript(filePath);
1436:       } else {
1437:         script = { filePath, name: path.basename(filePath) } as Script;
1438:       }
1439:     } catch (error) {
1440:       log.warn(error);
1441:       script = { filePath, name: path.basename(filePath) } as Script;
1442:     }
1443:     await onScriptChanged(eventName, script);
1444:     return;
1445:   }
1446: 
1447:   if (source === 'app') {
1448:     log.info(`🔄 ${eventName} ${filePath} from app`);
1449:     reloadApps();
1450:     return;
1451:   }
1452: 
1453:   log.verbose(`🔄 ${eventName} ${filePath}, but not handled... Is this a bug?`);
1454: }
```

## File: src/renderer/src/utils/image-cache.ts
```typescript
  1: /**
  2:  * Image caching utility for avatar images
  3:  * Uses main process cache for persistence across windows
  4:  */
  5: 
  6: import { AppChannel } from '../../../shared/enums';
  7: 
  8: const { ipcRenderer } = window.electron;
  9: 
 10: // Local memory cache for this window instance
 11: const memoryCache = new Map<string, string>();
 12: 
 13: /**
 14:  * Preloads and caches an image URL using main process cache
 15:  */
 16: export async function cacheImage(url: string): Promise<string> {
 17:   if (!url) return '';
 18: 
 19:   try {
 20:     // Check local memory cache first
 21:     const cached = memoryCache.get(url);
 22:     if (cached) {
 23:       return cached;
 24:     }
 25: 
 26:     // Request from main process cache (persists across windows)
 27:     const cachedDataUrl = await ipcRenderer.invoke(AppChannel.GET_CACHED_AVATAR, url);
 28:     
 29:     if (cachedDataUrl) {
 30:       // Store in local memory cache for this window
 31:       memoryCache.set(url, cachedDataUrl);
 32:       return cachedDataUrl;
 33:     }
 34:     
 35:     // If main process returns original URL, use it
 36:     return url;
 37:   } catch (error) {
 38:     console.error('Failed to cache image:', error);
 39:     // Return original URL as fallback
 40:     return url;
 41:   }
 42: }
 43: 
 44: /**
 45:  * Clears the avatar cache
 46:  */
 47: export async function clearAvatarCache(): Promise<void> {
 48:   try {
 49:     // Clear local memory cache
 50:     memoryCache.clear();
 51:     
 52:     // Clear main process cache
 53:     await ipcRenderer.invoke(AppChannel.CLEAR_AVATAR_CACHE);
 54:   } catch (error) {
 55:     console.error('Failed to clear avatar cache:', error);
 56:   }
 57: }
 58: 
 59: /**
 60:  * Hook to use cached avatar URL
 61:  */
 62: import { useEffect, useState } from 'react';
 63: 
 64: export function useCachedAvatar(avatarUrl: string | undefined): string | undefined {
 65:   const [cachedUrl, setCachedUrl] = useState<string | undefined>(avatarUrl);
 66: 
 67:   useEffect(() => {
 68:     if (!avatarUrl) {
 69:       setCachedUrl(undefined);
 70:       return undefined;
 71:     }
 72: 
 73:     let cancelled = false;
 74:     
 75:     // Set the original URL immediately to prevent flicker
 76:     setCachedUrl(avatarUrl);
 77: 
 78:     cacheImage(avatarUrl)
 79:       .then((blobUrl) => {
 80:         if (!cancelled && blobUrl && blobUrl !== avatarUrl) {
 81:           console.log('Avatar cached successfully:', blobUrl);
 82:           setCachedUrl(blobUrl);
 83:         }
 84:       })
 85:       .catch((error) => {
 86:         console.error('Failed to cache avatar, using original URL:', error);
 87:         if (!cancelled) {
 88:           // Keep using the original URL on error
 89:           setCachedUrl(avatarUrl);
 90:         }
 91:       });
 92: 
 93:     return () => {
 94:       cancelled = true;
 95:     };
 96:   }, [avatarUrl]);
 97: 
 98:   // Always return something to prevent layout shift
 99:   return cachedUrl || avatarUrl;
100: }
```

## File: src/shared/enums.ts
```typescript
  1: import { ProcessType } from '@johnlindquist/kit/core/enum';
  2: 
  3: export enum AppChannel {
  4:   BUILD_TS_SCRIPT = 'BUILD_TS_SCRIPT',
  5:   CSS_CHANGED = 'CSS_CHANGED',
  6:   DRAG_FILE_PATH = 'DRAG_FILE_PATH',
  7:   EDIT_SCRIPT = 'EDIT_SCRIPT',
  8:   FOCUS_PROMPT = 'FOCUS_PROMPT',
  9:   GET_ASSET = 'GET_ASSET',
 10:   INIT_RESIZE_HEIGHT = 'INIT_RESIZE_HEIGHT',
 11:   OPEN_FILE = 'OPEN_FILE',
 12:   OPEN_SCRIPT = 'OPEN_SCRIPT',
 13:   OPEN_SCRIPT_DB = 'OPEN_SCRIPT_DB',
 14:   OPEN_SCRIPT_LOG = 'OPEN_SCRIPT_LOG',
 15:   PROMPT_HEIGHT_RESET = 'PROMPT_HEIGHT_RESET',
 16:   READ_FILE_CONTENTS = 'READ_FILE_CONTENTS',
 17:   RECEIVE_FILE_CONTENTS = 'RECEIVE_FILE_CONTENTS',
 18:   RESIZE = 'RESIZE',
 19:   RUN_MAIN_SCRIPT = 'RUN_MAIN_SCRIPT',
 20:   SET_FILEPATH_BOUNDS = 'SET_PROMPT_DB',
 21:   SET_MAIN_HEIGHT = 'SET_MAIN_HEIGHT',
 22:   END_PROCESS = 'END_PROCESS',
 23:   FEEDBACK = 'SUBMIT_SURVEY',
 24:   PROCESSES = 'PROCESSES',
 25:   RUN_PROCESSES_SCRIPT = 'RUN_PROCESSES_SCRIPT',
 26:   LOG = 'LOG',
 27:   MAIN_SCRIPT = 'MAIN_SCRIPT',
 28:   KIT_STATE = 'STATE',
 29:   APPLY_UPDATE = 'APPLY_UPDATE',
 30:   LOGIN = 'LOGIN',
 31:   USER_CHANGED = 'USER_CHANGED',
 32:   DEBUG_INFO = 'DEBUG_INFO',
 33:   TERM_RESIZE = 'TERM_RESIZE',
 34:   TERM_READY = 'TERM_READY',
 35:   TERM_INPUT = 'TERM_INPUT',
 36:   TERM_OUTPUT = 'TERM_OUTPUT',
 37:   TERM_EXIT = 'TERM_EXIT',
 38:   TERM_SELECTION = 'TERM_SELECTION',
 39:   TERM_CAPTURE_READY = 'TERM_CAPTURE_READY',
 40:   CSS_VARIABLE = 'CSS_VARIABLE',
 41:   TERM_ATTACHED = 'TERM_ATTACHED',
 42:   SET_TERM_CONFIG = 'SET_TERM_CONFIG',
 43:   SET_MIC_CONFIG = 'SET_MIC_CONFIG',
 44:   ZOOM = 'ZOOM',
 45:   TERM_KILL = 'TERM_KILL',
 46:   AUDIO_DATA = 'AUDIO_DATA',
 47:   TAKE_SELFIE = 'TAKE_SELFIE',
 48:   SET_WEBCAM_ID = 'SET_WEBCAM_ID',
 49:   SET_MIC_ID = 'SET_MIC_ID',
 50:   RELOAD = 'RELOAD',
 51:   GET_CACHED_AVATAR = 'GET_CACHED_AVATAR',
 52:   CLEAR_AVATAR_CACHE = 'CLEAR_AVATAR_CACHE',
 53:   ERROR_RELOAD = 'ERROR_RELOAD',
 54:   ENABLE_BACKGROUND_THROTTLING = 'ENABLE_BACKGROUND_THROTTLING',
 55:   SET_BOUNDS = 'SET_BOUNDS',
 56:   HIDE = 'HIDE',
 57:   SHOW = 'SHOW',
 58:   PRE_SHOW = 'PRE_SHOW',
 59:   PTY_READY = 'PTY_READY',
 60:   PROMPT_UNLOAD = 'PROMPT_UNLOAD',
 61:   SCROLL_TO_TOP = 'SCROLL_TO_TOP',
 62:   SCROLL_TO_INDEX = 'SCROLL_TO_INDEX',
 63:   INVOKE_SEARCH = 'INVOKE_SEARCH',
 64:   INVOKE_FLAG_SEARCH = 'INVOKE_FLAG_SEARCH',
 65:   SET_PRELOADED = 'SET_PRELOADED',
 66:   TRIGGER_KEYWORD = 'TRIGGER_KEYWORD',
 67:   RESET_PROMPT = 'RESET_PROMPT',
 68:   SET_CACHED_MAIN_SCORED_CHOICES = 'SET_CACHED_MAIN_SCORED_CHOICES',
 69:   SET_CACHED_MAIN_SHORTCUTS = 'SET_CACHED_MAIN_SHORTCUTS',
 70:   SET_CACHED_MAIN_PREVIEW = 'SET_CACHED_MAIN_PREVIEW',
 71:   SET_CACHED_MAIN_STATE = 'SET_CACHED_MAIN_STATE',
 72:   SET_TERM_FONT = 'SET_TERM_FONT',
 73:   BEFORE_INPUT_EVENT = 'BEFORE_INPUT_EVENT',
 74:   INIT_PROMPT = 'INIT_PROMPT',
 75:   MESSAGES_READY = 'MESSAGES_READY',
 76:   SET_CACHED_MAIN_SCRIPT_FLAGS = 'SET_CACHED_MAIN_SCRIPT_FLAGS',
 77:   CLEAR_CACHE = 'CLEAR_CACHE',
 78:   CLOSE_PROMPT = 'CLOSE_PROMPT',
 79:   GET_KIT_CONFIG = 'GET_KIT_CONFIG',
 80:   FORCE_RENDER = 'FORCE_RENDER',
 81:   INPUT_READY = 'INPUT_READY',
 82:   MAKE_WINDOW = 'MAKE_WINDOW',
 83:   SET_KEYBOARD_LAYOUT = 'SET_KEYBOARD_LAYOUT',
 84:   RUN_KENV_TRUST_SCRIPT = 'RUN_KENV_TRUST_SCRIPT',
 85:   TRIGGER_RESIZE = 'TRIGGER_RESIZE',
 86:   SET_PROMPT_BLURRED = 'SET_PROMPT_BLURRED',
 87: }
 88: 
 89: export enum WindowChannel {
 90:   SET_LAST_LOG_LINE = 'LOG_LINE',
 91:   SET_EDITOR_LOG_MODE = 'SET_EDITOR_LOG_MODE',
 92:   SET_LOG_VALUE = 'SET_LOG_VALUE',
 93:   CLEAR_LOG = 'CLEAR_LOG',
 94:   MOUNTED = 'MOUNTED',
 95: }
 96: 
 97: export enum Trigger {
 98:   App = ProcessType.App,
 99:   Background = ProcessType.Background,
100:   Info = 'info',
101:   Schedule = ProcessType.Schedule,
102:   Snippet = 'snippet',
103:   System = ProcessType.System,
104:   Shortcut = 'shortcut',
105:   Watch = ProcessType.Watch,
106:   Kit = 'kit',
107:   Kar = 'kar',
108:   Menu = 'menu',
109:   Tray = 'tray',
110:   RunTxt = 'runTxt',
111:   Protocol = 'Protocol',
112:   MissingPackage = 'MissingPackage',
113:   Error = 'Error',
114: }
115: 
116: export enum HideReason {
117:   MainShortcut = 'MainShortcut',
118:   User = 'User',
119:   Blur = 'Blur',
120:   PingTimeout = 'PingTimeout',
121:   LockScreen = 'LockScreen',
122:   DebuggerClosed = 'DebuggerClosed',
123:   MessageFailed = 'MessageFailed',
124:   Escape = 'Escape',
125:   Suspend = 'Suspend',
126:   DevToolsClosed = 'DevToolsClosed',
127:   DomReady = 'DomReady',
128:   RunPromptProcess = 'RunPromptProcess',
129:   Destroy = 'Destroy',
130:   NoScript = 'NoScript',
131:   BeforeExit = 'BeforeExit',
132: }
133: 
134: export enum Widget {
135:   DefaultTitle = 'Script Kit Widget',
136: }
```

## File: src/main/ipc.ts
```typescript
  1: import { existsSync, renameSync } from 'node:fs';
  2: import { writeFile } from 'node:fs/promises';
  3: import path from 'node:path';
  4: import type { AppState, Script, Scriptlet } from '@johnlindquist/kit';
  5: import { Channel, Mode, UI } from '@johnlindquist/kit/core/enum';
  6: import {
  7:   getLogFromScriptPath,
  8:   getMainScriptPath,
  9:   isFile,
 10:   isInDir,
 11:   kenvPath,
 12:   kitPath,
 13:   tmpDownloadsDir,
 14: } from '@johnlindquist/kit/core/utils';
 15: import type { AppMessage } from '@johnlindquist/kit/types/kitapp';
 16: import axios from 'axios';
 17: import detect from 'detect-file-type';
 18: /* eslint-disable no-nested-ternary */
 19: /* eslint-disable import/prefer-default-export */
 20: /* eslint-disable no-restricted-syntax */
 21: import { ipcMain } from 'electron';
 22: import { debounce } from 'lodash-es';
 23: import { DownloaderHelper } from 'node-downloader-helper';
 24: import { KitEvent, emitter } from '../shared/events';
 25: import { type ProcessAndPrompt, ensureIdleProcess, processes } from './process';
 26: 
 27: import { getAssetPath } from '../shared/assets';
 28: import { noChoice } from '../shared/defaults';
 29: import { AppChannel, HideReason, Trigger } from '../shared/enums';
 30: import { getCachedAvatar, clearAvatarCache } from './avatar-cache';
 31: import type { ResizeData, Survey } from '../shared/types';
 32: import { runPromptProcess } from './kit';
 33: import { ipcLog as log } from './logs';
 34: import type { KitPrompt } from './prompt';
 35: import { prompts } from './prompts';
 36: import { debounceInvokeSearch, invokeFlagSearch, invokeSearch } from './search';
 37: import { kitState } from './state';
 38: import { visibilityController } from './visibility';
 39: 
 40: let actionsOpenTimeout: NodeJS.Timeout;
 41: let prevTransformedInput = '';
 42: 
 43: const checkShortcodesAndKeywords = (prompt: KitPrompt, rawInput: string): boolean => {
 44:   //   log.info(`
 45: 
 46:   //   🔍🔍🔍
 47:   // ${prompt.pid}: 🔍 Checking shortcodes and keywords... '${rawInput}'
 48:   //   🔍🔍🔍
 49: 
 50:   //   `);
 51:   const sendToPrompt = prompt.sendToPrompt;
 52:   let transformedInput = rawInput;
 53: 
 54:   if (prompt.kitSearch.inputRegex) {
 55:     // eslint-disable-next-line no-param-reassign
 56:     transformedInput = rawInput.match(new RegExp(prompt.kitSearch.inputRegex, 'gi'))?.[0] || '';
 57:   }
 58: 
 59:   if (!(prevTransformedInput || rawInput)) {
 60:     prompt.kitSearch.keywordCleared = false;
 61:     return true;
 62:   }
 63: 
 64:   if (prompt.kitSearch.commandChars.length > 0) {
 65:     if (prevTransformedInput === '') {
 66:       const char = rawInput?.[rawInput.length - 2];
 67:       if (!prompt.kitSearch.commandChars.includes(char)) {
 68:         prevTransformedInput = transformedInput;
 69:         prompt.kitSearch.input = transformedInput;
 70: 
 71:         return false;
 72:       }
 73:     }
 74:     for (const char of prompt.kitSearch.commandChars) {
 75:       if (rawInput.endsWith(char)) {
 76:         prevTransformedInput = transformedInput;
 77:         prompt.kitSearch.input = transformedInput;
 78:         return false;
 79:       }
 80:     }
 81:   }
 82: 
 83:   prevTransformedInput = transformedInput;
 84: 
 85:   const lowerCaseInput = transformedInput.toLowerCase();
 86:   const trigger = prompt.kitSearch.triggers.get(lowerCaseInput);
 87:   // log.verbose(`${prompt.pid}: 🚀 Trigger:`, {
 88:   //   trigger,
 89:   //   triggers: prompt.kitSearch.triggers.keys(),
 90:   // });
 91:   if (trigger) {
 92:     if (prompt.ready) {
 93:       log.info(`${prompt.getLogPrefix()}: 👢 Trigger: ${transformedInput} triggered`, trigger);
 94: 
 95:       if (trigger?.value?.inputs?.length > 0) {
 96:         log.info(
 97:           `${prompt.getLogPrefix()}: 📝 Trigger: ${transformedInput} blocked. Inputs required`,
 98:           trigger.value.inputs,
 99:         );
100:         sendToPrompt(Channel.SET_INVALIDATE_CHOICE_INPUTS, true);
101:       } else {
102:         sendToPrompt(Channel.SET_SUBMIT_VALUE, trigger?.value ? trigger.value : trigger);
103:         return false;
104:       }
105:     } else {
106:       log.info(`${prompt.getLogPrefix()}: 😩 Not ready`, JSON.stringify(trigger));
107:     }
108:   }
109: 
110:   for (const [postfix, choice] of prompt.kitSearch.postfixes.entries()) {
111:     if (choice && lowerCaseInput.endsWith(postfix)) {
112:       log.info(`${prompt.getLogPrefix()}: 🥾 Postfix: ${transformedInput} triggered`, choice);
113:       if ((choice as Scriptlet)?.inputs?.length > 0) {
114:         log.info(
115:           `${prompt.getLogPrefix()}: 📝 Postfix: ${transformedInput} blocked. Inputs required`,
116:           (choice as Scriptlet).inputs,
117:         );
118:         sendToPrompt(Channel.SET_INVALIDATE_CHOICE_INPUTS, true);
119:       } else {
120:         (choice as Script).postfix = transformedInput.replace(postfix, '');
121:         sendToPrompt(Channel.SET_SUBMIT_VALUE, choice);
122:         return false;
123:       }
124:     }
125:   }
126: 
127:   if (prompt.kitSearch.keyword && !rawInput.startsWith(`${prompt.kitSearch.keyword} `)) {
128:     const keyword = '';
129:     if (rawInput === prompt.kitSearch.keyword) {
130:       prompt.kitSearch.input = prompt.kitSearch.keyword;
131:     }
132:     prompt.kitSearch.keyword = keyword;
133:     prompt.kitSearch.inputRegex = undefined;
134:     log.info(`${prompt.getLogPrefix()}: 🔑 ${keyword} cleared`);
135:     prompt.kitSearch.keywordCleared = true;
136:     sendToPrompt(AppChannel.TRIGGER_KEYWORD, {
137:       keyword,
138:       choice: noChoice,
139:     });
140: 
141:     return false;
142:   }
143: 
144:   if (rawInput.includes(' ')) {
145:     if (rawInput.endsWith(' ')) {
146:       const shortcodeChoice = prompt.kitSearch.shortcodes.get(transformedInput.toLowerCase().trimEnd());
147:       if (shortcodeChoice) {
148:         sendToPrompt(Channel.SET_SUBMIT_VALUE, shortcodeChoice.value);
149:         log.info(`${prompt.getLogPrefix()}: 🔑 Shortcode: ${transformedInput} triggered`);
150:         return false;
151:       }
152:     }
153: 
154:     const keyword = rawInput.split(' ')?.[0].trim();
155:     if (keyword !== prompt.kitSearch.keyword) {
156:       const keywordChoice = prompt.kitSearch.keywords.get(keyword);
157:       if (keywordChoice) {
158:         prompt.kitSearch.keyword = keyword;
159:         prompt.kitSearch.inputRegex = new RegExp(`^${keyword} `, 'gi');
160:         log.info(`${prompt.getLogPrefix()}: 🔑 ${keyword} triggered`);
161:         sendToPrompt(AppChannel.TRIGGER_KEYWORD, {
162:           keyword,
163:           choice: keywordChoice,
164:         });
165:         return false;
166:       }
167:     }
168:   }
169: 
170:   if (prompt.kitSearch.keywordCleared) {
171:     prompt.kitSearch.keywordCleared = false;
172:     return false;
173:   }
174: 
175:   return true;
176: };
177: 
178: const handleMessageFail = debounce(
179:   (message: AppMessage) => {
180:     log.warn(`${message?.pid}: pid closed. Attempted ${message.channel}, but ignored.`);
181: 
182:     processes.removeByPid(message?.pid, 'ipc handleMessageFail');
183:     // TODO: Reimplement failed message with specific prompt
184:     // maybeHide(HideReason.MessageFailed);
185:     ensureIdleProcess();
186:   },
187:   100,
188:   { leading: true },
189: );
190: 
191: const handleChannel =
192:   (fn: (processInfo: ProcessAndPrompt, message: AppMessage) => void) => (_event: any, message: AppMessage) => {
193:     // TODO: Remove logging
194:     // log.info({
195:     //   message,
196:     // });
197:     log.silly(`📤 ${message.channel} ${message?.pid}`);
198:     if (message?.pid === 0) {
199:       return;
200:     }
201:     const processInfo = processes.getByPid(message?.pid);
202: 
203:     if (processInfo) {
204:       try {
205:         fn(processInfo, message);
206:       } catch (error) {
207:         log.error(`${message.channel} errored on ${message?.pid}`, message);
208:       }
209: 
210:       // log.info(`${message.channel}`, message.pid);
211:       // TODO: Handler preloaded?
212:     } else if (message.pid !== -1) {
213:       handleMessageFail(message);
214:     }
215:   };
216: 
217: export const startIpc = () => {
218:   ipcMain.on(
219:     AppChannel.ERROR_RELOAD,
220:     debounce(
221:       (_event, data: any) => {
222:         log.info('AppChannel.ERROR_RELOAD');
223:         const { scriptPath, pid } = data;
224:         const prompt = prompts.get(pid);
225:         const onReload = () => {
226:           const markdown = `# Error
227: 
228: ${data.message}
229: 
230: ${data.error}
231:           `;
232:           emitter.emit(KitEvent.RunPromptProcess, {
233:             scriptPath: kitPath('cli', 'info.js'),
234:             args: [path.basename(scriptPath), 'Error... ', markdown],
235:             options: {
236:               force: true,
237:               trigger: Trigger.Info,
238:             },
239:           });
240:         };
241: 
242:         // TODO: Reimplement
243:         if (prompt) {
244:           prompt.reload();
245:         } else {
246:           log.warn(`No prompt found for pid: ${pid}`);
247:         }
248:       },
249:       5000,
250:       { leading: true },
251:     ),
252:   );
253: 
254:   ipcMain.on(
255:     Channel.PROMPT_ERROR,
256:     debounce(
257:       (_event, { error }) => {
258:         log.info('AppChannel.PROMPT_ERROR');
259:         log.warn(error);
260:         if (!kitState.hiddenByUser) {
261:           setTimeout(() => {
262:             // TODO: Reimplement
263:             // reload();
264:             // processes.add(ProcessType.App, kitPath('cli/kit-log.js'), []);
265:             // escapePromptWindow();
266:           }, 4000);
267:         }
268:       },
269:       10000,
270:       { leading: true },
271:     ),
272:   );
273: 
274:   ipcMain.on(AppChannel.GET_ASSET, (event, { parts }) => {
275:     // log.info(`📁 GET_ASSET ${parts.join('/')}`);
276:     const assetPath = getAssetPath(...parts);
277:     log.info(`📁 Asset path: ${assetPath}`);
278:     event.sender.send(AppChannel.GET_ASSET, { assetPath });
279:   });
280: 
281:   // Avatar cache handlers
282:   ipcMain.handle(AppChannel.GET_CACHED_AVATAR, async (_event, avatarUrl: string) => {
283:     return getCachedAvatar(avatarUrl);
284:   });
285: 
286:   ipcMain.handle(AppChannel.CLEAR_AVATAR_CACHE, async () => {
287:     return clearAvatarCache();
288:   });
289: 
290:   ipcMain.on(AppChannel.RESIZE, (_event, resizeData: ResizeData) => {
291:     const prompt = prompts.get(resizeData.pid);
292:     // log.info(`>>>>>>>>>>>>> AppChannel.RESIZE`, {
293:     //   prompt,
294:     //   pid: resizeData.pid,
295:     //   pids: prompts.pids(),
296:     // });
297:     if (prompt) {
298:       prompt.resize(resizeData);
299:     }
300:   });
301: 
302:   ipcMain.on(AppChannel.RELOAD, async () => {
303:     log.info('AppChannel.RELOAD');
304:     // TODO: Reimplement
305:     // reload();
306: 
307:     await new Promise((resolve) => setTimeout(resolve, 1000));
308:     await runPromptProcess(getMainScriptPath(), [], {
309:       force: true,
310:       trigger: Trigger.Menu,
311:       sponsorCheck: false,
312:     });
313:   });
314: 
315:   ipcMain.on(AppChannel.OPEN_SCRIPT_LOG, async (_event, script: Script) => {
316:     const logPath = getLogFromScriptPath((script as Script).filePath);
317:     await runPromptProcess(kitPath('cli/edit-file.js'), [logPath], {
318:       force: true,
319:       trigger: Trigger.Kit,
320:       sponsorCheck: false,
321:     });
322:   });
323: 
324:   ipcMain.on(AppChannel.END_PROCESS, (_event, { pid }) => {
325:     const processInfo = processes.getByPid(pid);
326:     log.info('AppChannel.END_PROCESS', {
327:       pid,
328:       processInfoType: typeof processInfo,
329:     });
330:     if (processInfo) {
331:       processes.removeByPid(pid, 'ipc endProcess');
332:     }
333:   });
334: 
335:   ipcMain.on(AppChannel.OPEN_SCRIPT_DB, async (_event, { focused, script }: AppState) => {
336:     const filePath = (focused as any)?.filePath || script?.filePath;
337:     const dbPath = path.resolve(filePath, '..', '..', 'db', `_${path.basename(filePath).replace(/js$/, 'json')}`);
338:     await runPromptProcess(kitPath('cli/edit-file.js'), [dbPath], {
339:       force: true,
340:       trigger: Trigger.Kit,
341:       sponsorCheck: false,
342:     });
343:   });
344: 
345:   ipcMain.on(AppChannel.OPEN_SCRIPT, async (_event, { script, description, input }: Required<AppState>) => {
346:     // When the editor is editing a script. Toggle back to running the script.
347:     const descriptionIsFile = await isFile(description);
348:     const descriptionIsInKenv = isInDir(kenvPath())(description);
349: 
350:     if (descriptionIsInKenv && descriptionIsFile) {
351:       try {
352:         await writeFile(description, input);
353:         await runPromptProcess(description, [], {
354:           force: true,
355:           trigger: Trigger.Kit,
356:           sponsorCheck: false,
357:         });
358:       } catch (error) {
359:         log.error(error);
360:       }
361:       return;
362:     }
363: 
364:     const isInKit = isInDir(kitPath())(script.filePath);
365: 
366:     if (script.filePath && isInKit) {
367:       return;
368:     }
369: 
370:     await runPromptProcess(kitPath('cli/edit-file.js'), [script.filePath], {
371:       force: true,
372:       trigger: Trigger.Kit,
373:       sponsorCheck: false,
374:     });
375:   });
376: 
377:   ipcMain.on(AppChannel.EDIT_SCRIPT, async (_event, { script }: Required<AppState>) => {
378:     if (isInDir(kitPath())(script.filePath)) {
379:       return;
380:     }
381:     await runPromptProcess(kitPath('main/edit.js'), [script.filePath], {
382:       force: true,
383:       trigger: Trigger.Kit,
384:       sponsorCheck: false,
385:     });
386:   });
387: 
388:   ipcMain.on(AppChannel.OPEN_FILE, async (_event, { script, focused }: Required<AppState>) => {
389:     const filePath = (focused as any)?.filePath || script?.filePath;
390: 
391:     await runPromptProcess(kitPath('cli/edit-file.js'), [filePath], {
392:       force: true,
393:       trigger: Trigger.Kit,
394:       sponsorCheck: false,
395:     });
396:   });
397: 
398:   ipcMain.on(AppChannel.RUN_MAIN_SCRIPT, () => {
399:     runPromptProcess(getMainScriptPath(), [], {
400:       force: true,
401:       trigger: Trigger.Kit,
402:       sponsorCheck: false,
403:     });
404:   });
405: 
406:   ipcMain.on(AppChannel.RUN_KENV_TRUST_SCRIPT, (_event, { kenv }) => {
407:     log.info(`🔑 Running kenv-trust script for ${kenv}`);
408:     prompts.focused?.close('run kenv-trust script');
409:     runPromptProcess(kitPath('cli', 'kenv-trust.js'), [kenv], {
410:       force: true,
411:       trigger: Trigger.Kit,
412:       sponsorCheck: false,
413:     });
414:   });
415: 
416:   ipcMain.on(AppChannel.RUN_PROCESSES_SCRIPT, () => {
417:     runPromptProcess(kitPath('cli', 'processes.js'), [], {
418:       force: true,
419:       trigger: Trigger.Kit,
420:       sponsorCheck: false,
421:     });
422:   });
423: 
424:   for (const channel of [
425:     Channel.ACTIONS_INPUT,
426:     Channel.INPUT,
427:     Channel.CHANGE,
428:     Channel.CHOICE_FOCUSED,
429:     Channel.MESSAGE_FOCUSED,
430:     Channel.CHOICES,
431:     Channel.NO_CHOICES,
432:     Channel.BACK,
433:     Channel.FORWARD,
434:     Channel.UP,
435:     Channel.DOWN,
436:     Channel.LEFT,
437:     Channel.RIGHT,
438:     Channel.TAB,
439:     Channel.ESCAPE,
440:     Channel.VALUE_SUBMITTED,
441:     Channel.TAB_CHANGED,
442:     Channel.BLUR,
443:     Channel.ABANDON,
444:     Channel.GET_EDITOR_HISTORY,
445:     Channel.SHORTCUT,
446:     Channel.ON_PASTE,
447:     Channel.ON_DROP,
448:     Channel.ON_DRAG_ENTER,
449:     Channel.ON_DRAG_LEAVE,
450:     Channel.ON_DRAG_OVER,
451:     Channel.ON_MENU_TOGGLE,
452:     Channel.PLAY_AUDIO,
453:     Channel.GET_COLOR,
454:     Channel.CHAT_MESSAGES_CHANGE,
455:     Channel.ON_INIT,
456:     Channel.ON_SUBMIT,
457:     Channel.GET_DEVICES,
458:     Channel.APPEND_EDITOR_VALUE,
459:     Channel.GET_INPUT,
460:     Channel.EDITOR_GET_SELECTION,
461:     Channel.EDITOR_SET_CODE_HINT,
462:     Channel.EDITOR_GET_CURSOR_OFFSET,
463:     Channel.EDITOR_INSERT_TEXT,
464:     Channel.EDITOR_MOVE_CURSOR,
465:     Channel.KEYWORD_TRIGGERED,
466:     Channel.SELECTED,
467:     Channel.ACTION,
468:     Channel.MIC_STREAM,
469:     Channel.STOP_MIC,
470:     Channel.CHAT_ADD_MESSAGE,
471:     Channel.CHAT_PUSH_TOKEN,
472:     Channel.CHAT_SET_MESSAGE,
473:   ]) {
474:     // log.info(`😅 Registering ${channel}`);
475:     ipcMain.on(
476:       channel,
477:       handleChannel(async ({ child, prompt, promptId }, message) => {
478:         // log.info(`${prompt.pid}: IPC: 📤 ${channel}`, message.state);
479:         const sendToPrompt = prompt.sendToPrompt;
480: 
481:         prompt.kitSearch.flaggedValue = message.state?.flaggedValue;
482: 
483:         message.promptId = promptId || '';
484: 
485:         log.verbose(`⬅ ${channel} ${prompt.ui} ${prompt.scriptPath}`);
486: 
487:         if (channel === Channel.MIC_STREAM) {
488:           const micStreamMessage: any = message;
489:           if (micStreamMessage?.state?.buffer && !Buffer.isBuffer(micStreamMessage.state.buffer)) {
490:             const b = micStreamMessage.state.buffer;
491:             // Accept ArrayBuffer, Uint8Array, or a plain {0:..,1:..} object
492:             let u8: Uint8Array;
493:             if (b instanceof ArrayBuffer) u8 = new Uint8Array(b);
494:             else if (ArrayBuffer.isView(b)) u8 = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
495:             else u8 = Uint8Array.from(Object.values(b as any));
496:             micStreamMessage.state.value = Buffer.from(u8);
497:             // Optional: drop the original to keep messages small
498:             delete micStreamMessage.state.buffer;
499:           }
500: 
501:           child.send(micStreamMessage);
502: 
503:           return;
504:         }
505: 
506:         if (channel === Channel.INPUT) {
507:           const input = message.state.input as string;
508:           // log.info(`📝 Input: ${input}`);
509:           if (!input) {
510:             log.info(`${prompt.pid}: 📝 No prompt input`);
511:             prompt.kitSearch.input = '';
512:             // keyword and regex will be cleared by checkShortcodesAndKeywords
513:             // prompt.kitSearch.inputRegex = undefined;
514:             // prompt.kitSearch.keyword = '';
515:           }
516: 
517:           const isArg = message.state.ui === UI.arg;
518:           const hasFlag = message.state.flaggedValue;
519: 
520:           if (isArg) {
521:             const shouldSearch = checkShortcodesAndKeywords(prompt, input);
522:             const isFilter = message.state.mode === Mode.FILTER;
523:             if (shouldSearch && isFilter) {
524:               debounceInvokeSearch.cancel();
525: 
526:               if (prompt.kitSearch.choices.length > 5000) {
527:                 debounceInvokeSearch(prompt, input, 'debounce');
528:               } else {
529:                 invokeSearch(prompt, input, `${channel}`);
530:               }
531:             }
532:           }
533:         }
534: 
535:         if (channel === Channel.ACTIONS_INPUT) {
536:           const actionsInput = message.state.actionsInput as string;
537:           invokeFlagSearch(prompt, actionsInput);
538:           return;
539:         }
540: 
541:         if (channel === Channel.ON_MENU_TOGGLE) {
542:           const hasFlaggedValue = Boolean(message.state.flaggedValue);
543:           log.info(`🔍 Actions menu ${hasFlaggedValue ? 'open' : 'closed'}`);
544:           prompt.actionsOpen = hasFlaggedValue;
545: 
546:           if (hasFlaggedValue) {
547:             prompt.wasActionsJustOpen = true;
548:           } else {
549:             clearTimeout(actionsOpenTimeout);
550:             actionsOpenTimeout = setTimeout(() => {
551:               prompt.wasActionsJustOpen = false;
552:             }, 50);
553:           }
554:         }
555: 
556:         if (channel === Channel.ON_MENU_TOGGLE && prompt.flagSearch.input) {
557:           invokeFlagSearch(prompt, '');
558:         }
559: 
560:         if (channel === Channel.ESCAPE) {
561:           log.info(`␛ Escape received in IPC handler`);
562: 
563:           const hasChild = !!child && child.connected;
564:           const handled = visibilityController.handleEscape(prompt, hasChild);
565: 
566:           // If visibility controller didn't handle it, let it propagate to child process
567:           if (!handled) {
568:             log.info(`␛ Escape not handled by visibility controller, propagating to child process`);
569:             
570:             // Check if we can actually send to child
571:             if (!child || !child.connected) {
572:               log.warn(`␛ Child process not ready to receive escape, closing prompt`);
573:               
574:               // Kill any existing child process
575:               if (child && child.pid) {
576:                 child.kill();
577:               }
578:               
579:               // Hide the prompt
580:               prompt.maybeHide(HideReason.Escape);
581:               prompt.sendToPrompt(Channel.SET_INPUT, '');
582:               
583:               // Clean up the process
584:               processes.removeByPid(prompt.pid, 'escape with no child');
585:               
586:               return; // Don't try to send to child
587:             }
588:           }
589:         }
590: 
591:         if (channel === Channel.ABANDON) {
592:           log.info('⚠️ ABANDON', message.pid);
593:         }
594:         // log.info({ channel, message });
595:         if ([Channel.VALUE_SUBMITTED, Channel.TAB_CHANGED].includes(channel)) {
596:           emitter.emit(KitEvent.ResumeShortcuts);
597:           kitState.tabIndex = message.state.tabIndex as number;
598:         }
599: 
600:         if (channel === Channel.VALUE_SUBMITTED) {
601:           prompt.mainMenuPreventCloseOnBlur = true;
602:           log.info(
603:             `
604: -------------
605: ${child?.pid} 📝 Submitting...
606: -------------`.trim(),
607:           );
608: 
609:           // TODO: Is this still necessary? It was breaking a scenario around empty strings in an arg.
610:           // It would also need to check if there are "info" choices.
611:           // if (!message?.state?.value && message?.state?.script && prompt.kitSearch?.choices?.length > 0) {
612:           //   message.state.value = message.state.focused;
613:           // }
614: 
615:           if (!prompt.ready) {
616:             log.info(`${prompt.pid}: Prompt not ready..`, message);
617:           }
618:           prompt.clearSearch();
619: 
620:           if (message?.state?.value === Channel.TERMINAL) {
621:             message.state.value = '';
622:           }
623:         }
624: 
625:         if (channel === Channel.SHORTCUT) {
626:           prompt.mainMenuPreventCloseOnBlur = true;
627:         }
628: 
629:         if (channel === Channel.ESCAPE || (channel === Channel.SHORTCUT && message.state.shortcut === 'escape')) {
630:           kitState.shortcutsPaused = false;
631:           log.verbose({
632:             submitted: message.state.submitted,
633:             pid: child.pid,
634:           });
635:           if (message.state.submitted) {
636:             child.kill();
637:             return;
638:           }
639:         }
640: 
641:         if (child) {
642:           try {
643:             // if (channel === Channel.VALUE_SUBMITTED) {
644:             //   log.info(`${prompt.pid}: child.send: ${channel}`, message, {
645:             //     scriptPath: prompt.scriptPath,
646:             //     scriptSet: prompt.scriptSet,
647:             //   });
648:             // }
649:             if (child?.channel && child.connected) {
650:               child?.send(message);
651:             } else {
652:               log.warn(`${prompt.pid}: Child not connected: ${channel}`, message);
653:             }
654:           } catch (e) {
655:             // ignore logging EPIPE errors
656:             log.error(`📤 ${channel} ERROR`, message);
657:             log.error(e);
658:           }
659:         }
660:       }),
661:     );
662:   }
663: 
664:   ipcMain.on(AppChannel.DRAG_FILE_PATH, async (event, { filePath, icon }: { filePath: string; icon: string }) => {
665:     try {
666:       let newPath = filePath;
667:       if (filePath.startsWith('http')) {
668:         newPath = await new Promise((resolve, _reject) => {
669:           const dl = new DownloaderHelper(filePath, tmpDownloadsDir, {
670:             override: true,
671:           });
672:           dl.on('end', (downloadInfo) => {
673:             const fp = downloadInfo.filePath;
674:             detect.fromFile(fp, (err: any, result: { ext: string; mime: string }) => {
675:               if (err) {
676:                 throw err;
677:               }
678:               if (fp.endsWith(result.ext)) {
679:                 resolve(fp);
680:               } else {
681:                 const fixedFilePath = `${fp}.${result.ext}`;
682:                 renameSync(fp, fixedFilePath);
683:                 resolve(fixedFilePath);
684:               }
685:             });
686:           });
687:           dl.start();
688:         });
689:       }
690: 
691:       // TODO: Use Finder's image preview db
692:       if (existsSync(newPath)) {
693:         // const pickIcon = isImage(newPath)
694:         //   ? newPath.endsWith('.gif') || newPath.endsWith('.svg')
695:         //     ? getAssetPath('icons8-image-file-24.png')
696:         //     : newPath
697:         //   : getAssetPath('icons8-file-48.png');
698:         event.sender.startDrag({
699:           file: newPath,
700:           icon: getAssetPath('icons8-file-50.png'),
701:         });
702:       }
703:     } catch (error) {
704:       log.warn(error);
705:     }
706:   });
707: 
708:   ipcMain.on(AppChannel.FEEDBACK, async (_event, data: Survey) => {
709:     // runScript(kitPath('cli', 'feedback.js'), JSON.stringify(data));
710: 
711:     try {
712:       const feedbackResponse = await axios.post(`${kitState.url}/api/feedback`, data);
713:       log.info(feedbackResponse.data);
714: 
715:       if (data?.email && data?.subscribe) {
716:         const subResponse = await axios.post(`${kitState.url}/api/subscribe`, {
717:           email: data?.email,
718:         });
719: 
720:         log.info(subResponse.data);
721:       }
722:     } catch (error) {
723:       log.error(`Error sending feedback: ${error}`);
724:     }
725:   });
726: 
727:   type levelType = 'debug' | 'info' | 'warn' | 'error' | 'silly';
728:   ipcMain.on(AppChannel.LOG, (_event, { message, level }: { message: any; level: levelType }) => {
729:     log[level](message);
730:   });
731: 
732:   ipcMain.on(AppChannel.LOGIN, () => {
733:     runPromptProcess(kitPath('pro', 'login.js'), [], {
734:       force: true,
735:       trigger: Trigger.App,
736:       sponsorCheck: false,
737:     });
738:   });
739: };
```

## File: src/main/prompt.set-prompt-data.ts
```typescript
  1: import { Channel, UI } from '@johnlindquist/kit/core/enum';
  2: import type { PromptData } from '@johnlindquist/kit/types/core';
  3: import { debounce } from 'lodash-es';
  4: import { getMainScriptPath } from '@johnlindquist/kit/core/utils';
  5: import { AppChannel } from '../shared/enums';
  6: import { kitState, preloadPromptDataMap } from './state';
  7: import { setFlags } from './search';
  8: import { createPty } from './pty';
  9: import { applyPromptDataBounds } from './prompt.bounds-utils';
 10: 
 11: export const setPromptDataImpl = async (prompt: any, promptData: PromptData): Promise<void> => {
 12:   prompt.promptData = promptData;
 13: 
 14:   const setPromptDataHandler = debounce(
 15:     (_x: unknown, { ui }: { ui: UI }) => {
 16:       prompt.logInfo(`${prompt.pid}: Received SET_PROMPT_DATA from renderer. ${ui} Ready!`);
 17:       prompt.refocusPrompt();
 18:     },
 19:     100,
 20:     {
 21:       leading: true,
 22:       trailing: false,
 23:     },
 24:   );
 25: 
 26:   prompt.window.webContents.ipc.removeHandler(Channel.SET_PROMPT_DATA);
 27:   prompt.window.webContents.ipc.once(Channel.SET_PROMPT_DATA, setPromptDataHandler);
 28: 
 29:   if (promptData.ui === UI.term) {
 30:     const termConfig = {
 31:       command: (promptData as any)?.command || '',
 32:       cwd: promptData.cwd || '',
 33:       shell: (promptData as any)?.shell || '',
 34:       promptId: prompt.id || '',
 35:       env: promptData.env || {},
 36:     };
 37:     prompt.sendToPrompt(AppChannel.SET_TERM_CONFIG, termConfig);
 38:     createPty(prompt);
 39:   }
 40: 
 41:   prompt.scriptPath = promptData?.scriptPath;
 42:   prompt.clearFlagSearch();
 43:   prompt.kitSearch.shortcodes.clear();
 44:   prompt.kitSearch.triggers.clear();
 45:   if (promptData?.hint) {
 46:     for (const trigger of promptData?.hint?.match(/(?<=\[)\w+(?=\])/gi) || []) {
 47:       prompt.kitSearch.triggers.set(trigger, { name: trigger, value: trigger });
 48:     }
 49:   }
 50: 
 51:   prompt.kitSearch.commandChars = promptData.inputCommandChars || [];
 52:   prompt.updateShortcodes();
 53: 
 54:   if (prompt.cacheScriptPromptData && !promptData.preload) {
 55:     prompt.cacheScriptPromptData = false;
 56:     promptData.name ||= prompt.script.name || '';
 57:     promptData.description ||= prompt.script.description || '';
 58:     prompt.logInfo(`💝 Caching prompt data: ${prompt?.scriptPath}`);
 59:     preloadPromptDataMap.set(prompt.scriptPath, {
 60:       ...promptData,
 61:       input: promptData?.keyword ? '' : promptData?.input || '',
 62:       keyword: '',
 63:     });
 64:   }
 65: 
 66:   if (promptData.flags && typeof promptData.flags === 'object') {
 67:     prompt.logInfo(`🏳️‍🌈 Setting flags from setPromptData: ${Object.keys(promptData.flags)}`);
 68:     setFlags(prompt, promptData.flags);
 69:   }
 70: 
 71:   kitState.hiddenByUser = false;
 72: 
 73:   if (typeof promptData?.alwaysOnTop === 'boolean') {
 74:     prompt.logInfo(`📌 setPromptAlwaysOnTop from promptData: ${promptData.alwaysOnTop ? 'true' : 'false'}`);
 75:     prompt.setPromptAlwaysOnTop(promptData.alwaysOnTop, true);
 76:   }
 77: 
 78:   if (typeof promptData?.skipTaskbar === 'boolean') {
 79:     prompt.setSkipTaskbar(promptData.skipTaskbar);
 80:   }
 81: 
 82:   prompt.allowResize = promptData?.resize;
 83:   kitState.shortcutsPaused = promptData.ui === UI.hotkey;
 84: 
 85:   prompt.logVerbose(`setPromptData ${promptData.scriptPath}`);
 86: 
 87:   prompt.id = promptData.id;
 88:   prompt.ui = promptData.ui;
 89: 
 90:   if (prompt.kitSearch.keyword) {
 91:     promptData.keyword = prompt.kitSearch.keyword || prompt.kitSearch.keyword;
 92:   }
 93: 
 94:   // Send user data BEFORE prompt data so it's available immediately
 95:   const userSnapshot = (await import('valtio')).snapshot(kitState.user);
 96:   prompt.logInfo(`Sending user data early: ${userSnapshot?.login || 'not logged in'}`);
 97:   prompt.sendToPrompt(AppChannel.USER_CHANGED, userSnapshot);
 98:   
 99:   prompt.sendToPrompt(Channel.SET_PROMPT_DATA, promptData);
100: 
101:   const isMainScript = getMainScriptPath() === promptData.scriptPath;
102: 
103:   if (prompt.firstPrompt && !isMainScript) {
104:     prompt.logInfo(`${prompt.pid} Before initBounds`);
105:     prompt.initBounds();
106:     prompt.logInfo(`${prompt.pid} After initBounds`);
107:     prompt.logInfo(`${prompt.pid} Disabling firstPrompt`);
108:     prompt.firstPrompt = false;
109:   }
110: 
111:   if (!isMainScript) {
112:     applyPromptDataBounds(prompt.window, promptData);
113:   }
114: 
115:   if (kitState.hasSnippet) {
116:     const timeout = prompt.script?.snippetdelay || 0;
117:     await new Promise((r) => setTimeout(r, timeout));
118:     kitState.hasSnippet = false;
119:   }
120: 
121:   const visible = prompt.isVisible();
122:   prompt.logInfo(`${prompt.id}: visible ${visible ? 'true' : 'false'} 👀`);
123: 
124:   const shouldShow = promptData?.show !== false;
125:   if (!visible && shouldShow) {
126:     prompt.logInfo(`${prompt.id}: Prompt not visible but should show`);
127:     if (!prompt.firstPrompt) {
128:       prompt.showPrompt();
129:     } else {
130:       prompt.showAfterNextResize = true;
131:     }
132:   } else if (visible && !shouldShow) {
133:     prompt.actualHide();
134:   }
135: 
136:   if (!visible && promptData?.scriptPath.includes('.md#')) {
137:     prompt.focusPrompt();
138:   }
139: };
```

## File: src/renderer/src/state/services/ipc.ts
```typescript
 1: import { AppChannel, Channel } from '../../../../shared/enums';
 2: import type { ResizeData } from '../../../../shared/types';
 3: 
 4: // Access ipcRenderer through the preloaded window.electron
 5: const { ipcRenderer } = window.electron;
 6: 
 7: /**
 8:  * Pure IPC helper functions.
 9:  * No atom dependencies, just thin wrappers around ipcRenderer.
10:  */
11: 
12: export function sendResize(data: ResizeData) {
13:   ipcRenderer.send(AppChannel.RESIZE, data);
14: }
15: 
16: export function sendChannel(channel: Channel, ...args: any[]) {
17:   ipcRenderer.send(channel, ...args);
18: }
19: 
20: export function sendIPC(message: any) {
21:   if (message.type && message.payload !== undefined) {
22:     ipcRenderer.send(message.type, message.payload);
23:   } else if (message.channel && message.args) {
24:     ipcRenderer.send(message.channel, ...message.args);
25:   } else {
26:     console.warn('Invalid IPC message format:', message);
27:   }
28: }
```

## File: src/renderer/src/components/input.tsx
```typescript
  1: import { Channel, PROMPT } from '@johnlindquist/kit/core/enum';
  2: import log from 'electron-log';
  3: import { useAtom, useAtomValue, useSetAtom } from 'jotai';
  4: import {
  5:   type ChangeEvent,
  6:   type KeyboardEvent,
  7:   type LegacyRef,
  8:   type RefObject,
  9:   useCallback,
 10:   useEffect,
 11:   useRef,
 12:   useState,
 13: } from 'react';
 14: import { useCachedAvatar } from '../utils/image-cache';
 15: import { GithubIcon } from './icons';
 16: 
 17: import useResizeObserver from '@react-hook/resize-observer';
 18: import { debounce } from 'lodash-es';
 19: import { useFocus, useKeyIndex, useTab } from '../hooks/index.js';
 20: import {
 21:   _lastKeyDownWasModifierAtom,
 22:   _modifiers,
 23:   actionsAtom,
 24:   cachedAtom,
 25:   channelAtom,
 26:   choiceInputsAtom,
 27:   enterButtonDisabledAtom,
 28:   enterButtonNameAtom,
 29:   flaggedChoiceValueAtom,
 30:   flagsAtom,
 31:   focusedChoiceAtom,
 32:   footerHiddenAtom,
 33:   gridReadyAtom,
 34:   inputAtom,
 35:   inputFocusAtom,
 36:   inputFontSizeAtom,
 37:   inputHeightAtom,
 38:   invalidateChoiceInputsAtom,
 39:   kitStateAtom,
 40:   lastKeyDownWasModifierAtom,
 41:   _miniShortcutsHoveredAtom,
 42:   miniShortcutsVisibleAtom,
 43:   modifiers,
 44:   onInputSubmitAtom,
 45:   placeholderAtom,
 46:   promptDataAtom,
 47:   selectionStartAtom,
 48:   sendActionAtom,
 49:   sendShortcutAtom,
 50:   shortcodesAtom,
 51:   shortcutsAtom,
 52:   shouldActionButtonShowOnInputAtom,
 53:   signInActionAtom,
 54:   submitValueAtom,
 55:   submittedAtom,
 56:   userAtom,
 57: } from '../jotai';
 58: import { ActionButton } from './actionbutton';
 59: import { EnterButton } from './actionenterbutton';
 60: import { OptionsButton } from './actionoptionsbutton';
 61: import { ActionSeparator } from './actionseparator';
 62: import { IconButton } from './icon';
 63: 
 64: const remapModifiers = (m: string) => {
 65:   if (m === 'Meta') {
 66:     return ['cmd'];
 67:   }
 68:   if (m === 'Control') {
 69:     return ['control', 'ctrl'];
 70:   }
 71:   if (m === 'Alt') {
 72:     return ['alt', 'option'];
 73:   }
 74:   return m.toLowerCase();
 75: };
 76: 
 77: const debouncedFocus = debounce(
 78:   (inputRef: RefObject<HTMLInputElement>) => {
 79:     inputRef.current?.focus();
 80:   },
 81:   100,
 82:   { leading: true, trailing: false },
 83: );
 84: 
 85: const minWidth = 24;
 86: const defaultWidth = 128;
 87: function ResizableInput({ placeholder, className, index }) {
 88:   const inputRef = useRef<HTMLInputElement>(null);
 89:   const hiddenInputRef = useRef<HTMLSpanElement>(null);
 90:   const inputWidthRef = useRef(defaultWidth);
 91:   const [currentInput, setCurrentInput] = useState('');
 92:   const [choiceInputs, setChoiceInputs] = useAtom(choiceInputsAtom);
 93:   const [invalidateChoiceInputs, setInvalidateChoiceInputs] = useAtom(invalidateChoiceInputsAtom);
 94:   const [submitted] = useAtom(submittedAtom);
 95: 
 96:   const [promptData] = useAtom(promptDataAtom);
 97: 
 98:   useEffect(() => {
 99:     if (promptData?.scriptlet) {
100:       // focus
101:       debouncedFocus(inputRef);
102:     }
103:   }, [promptData]);
104: 
105:   useResizeObserver(hiddenInputRef, () => {
106:     const newWidth = Math.ceil((hiddenInputRef?.current?.offsetWidth || minWidth) + 12);
107:     inputWidthRef.current = newWidth; //Math.max(newWidth, minWidth);
108:     if (inputRef.current) {
109:       inputRef.current.style.width = `${newWidth}px`;
110:     }
111:   });
112: 
113:   useEffect(() => {
114:     choiceInputs[index] = currentInput;
115:     if (currentInput) {
116:       setInvalidateChoiceInputs(false);
117:     }
118:   }, [currentInput]);
119: 
120:   useEffect(() => {
121:     if (invalidateChoiceInputs && currentInput === '') {
122:       // focus the input
123:       debouncedFocus(inputRef);
124:     }
125:   }, [invalidateChoiceInputs, currentInput]);
126: 
127:   const hiddenInputString = (placeholder.length > currentInput.length ? placeholder : currentInput).replaceAll(
128:     ' ',
129:     '.',
130:   );
131: 
132:   return (
133:     <>
134:       <span
135:         ref={hiddenInputRef}
136:         style={{
137:           position: 'absolute',
138:           visibility: 'hidden',
139:           // don't break on any lines
140:           whiteSpace: 'nowrap',
141:           boxSizing: 'border-box',
142:         }}
143:         className={'px-2 tracking-normal absolute bg-red-500'}
144:       >
145:         {hiddenInputString}
146:       </span>
147:       <input
148:         // biome-ignore lint/a11y/noAutofocus: <explanation>
149:         autoFocus={index === 0 && promptData?.scriptlet === true}
150:         ref={inputRef}
151:         onChange={(e) => setCurrentInput(e.target.value)}
152:         placeholder={placeholder}
153:         className={`
154: ring-0 focus:ring-0 outline-none
155: 
156: 
157: outline-offset-0
158: outline-1
159: focus:outline-1
160: focus:outline-offset-0
161: 
162: ${currentInput === '' && invalidateChoiceInputs ? 'outline-primary/50 focus:outline-primary/90' : 'outline-secondary/20 focus:outline-primary/50'}
163: border-none
164: overflow-hidden
165: tracking-normal
166: text-text-base placeholder-text-base
167: placeholder-opacity-25
168: placeholder:tracking-normal
169: bg-secondary/5
170: rounded-md
171: text-md
172: ${submitted && 'text-opacity-50'}
173: outline-none
174: outline-hidden pr-1
175: mt-0.5
176: mx-1
177:         `}
178:         style={{
179:           minWidth: `${inputWidthRef.current}px`,
180:           width: `${inputWidthRef.current}px`,
181:           height: '60%',
182:           whiteSpace: 'nowrap',
183:           boxSizing: 'border-box',
184:         }}
185:       />
186:     </>
187:   );
188: }
189: 
190: function QuickInputs() {
191:   const focusedChoice = useAtomValue(focusedChoiceAtom);
192:   const setChoiceInputs = useSetAtom(choiceInputsAtom);
193: 
194:   useEffect(() => {
195:     if (Array.isArray(focusedChoice?.inputs)) {
196:       setChoiceInputs(focusedChoice?.inputs?.map(() => ''));
197:     }
198:   }, [focusedChoice]);
199: 
200:   if (!focusedChoice?.inputs) {
201:     return null;
202:   }
203: 
204:   return focusedChoice.inputs.map((placeholder, i) => (
205:     <ResizableInput key={placeholder} index={i} placeholder={placeholder} />
206:   ));
207: }
208: 
209: function MainInput() {
210:   const inputRef = useRef<HTMLInputElement>(null);
211: 
212:   useFocus(inputRef);
213: 
214:   const minWidth = 96; // Set a minimum width for the input
215:   const [hiddenInputMeasurerWidth, setHiddenInputMeasurerWidth] = useState(0);
216:   const hiddenInputRef = useRef<HTMLInputElement>(null);
217: 
218:   useResizeObserver(hiddenInputRef, () => {
219:     const newWidth = Math.ceil((hiddenInputRef?.current?.offsetWidth || 0) + 1); // Adding 1px for better accuracy
220:     setHiddenInputMeasurerWidth(Math.max(newWidth, minWidth));
221:   });
222: 
223:   const [inputValue, setInput] = useAtom(inputAtom);
224:   const [fontSize] = useAtom(inputFontSizeAtom);
225:   const [onInputSubmit] = useAtom(onInputSubmitAtom);
226:   const [, setSubmitValue] = useAtom(submitValueAtom);
227:   const setLastKeyDownWasModifier = debounce(useSetAtom(lastKeyDownWasModifierAtom), 300);
228:   const _setLastKeyDownWasModifier = useSetAtom(_lastKeyDownWasModifierAtom);
229:   const [shortcuts] = useAtom(shortcutsAtom);
230:   const channel = useAtomValue(channelAtom);
231:   const shortcodes = useAtomValue(shortcodesAtom);
232: 
233:   const [promptData] = useAtom(promptDataAtom);
234:   const [submitted] = useAtom(submittedAtom);
235:   const [, setSelectionStart] = useAtom(selectionStartAtom);
236:   const [currentModifiers, setModifiers] = useAtom(_modifiers);
237:   const [inputFocus, setInputFocus] = useAtom(inputFocusAtom);
238:   const gridReady = useAtomValue(gridReadyAtom);
239: 
240:   const [miniShortcutsHovered, setMiniShortcutsHovered] = useAtom(_miniShortcutsHoveredAtom);
241:   const flags = useAtomValue(flagsAtom);
242:   const [flagValue] = useAtom(flaggedChoiceValueAtom);
243: 
244:   const [pendingInput, setPendingInput] = useState('');
245:   const cached = useAtomValue(cachedAtom);
246:   const focusedChoice = useAtomValue(focusedChoiceAtom);
247: 
248:   let [placeholder] = useAtom(placeholderAtom);
249:   if (focusedChoice && focusedChoice?.inputs?.length > 0) {
250:     placeholder = focusedChoice.name;
251:   }
252:   useEffect(() => {
253:     setInputFocus(Math.random());
254:     setMiniShortcutsHovered(false);
255:     setModifiers([]);
256: 
257:     return () => {
258:       setInputFocus(0);
259:     };
260:   }, [setInputFocus, setMiniShortcutsHovered, setModifiers]);
261: 
262:   useEffect(() => {
263:     if (!cached && pendingInput) {
264:       setInput(pendingInput);
265:       setPendingInput('');
266:     }
267:   }, [cached, pendingInput, setInput]);
268: 
269:   const onChange = useCallback(
270:     (event: ChangeEvent<HTMLInputElement>) => {
271:       // log.info(event.target.value, { cached: cached ? 'true' : 'false' });
272:       if (onInputSubmit[event.target.value] && !submitted) {
273:         const submitValue = onInputSubmit[event.target.value];
274:         setSubmitValue(submitValue);
275:       } else if (cached) {
276:         setPendingInput(event.target.value);
277:       } else {
278:         // log.info(`Setting input: ${event.target.value}`);
279:         setInput(event.target.value);
280:         setPendingInput('');
281:       }
282:     },
283:     [onInputSubmit, submitted, setSubmitValue, setInput, cached],
284:   );
285: 
286:   const onKeyDown = useCallback(
287:     (event: KeyboardEvent<HTMLInputElement>) => {
288:       // log.info(`${window.pid}: onKeyDown: ${event}`, event);
289:       // if command is pressed
290:       if (gridReady) {
291:         if (
292:           event.key === 'ArrowLeft' ||
293:           event.key === 'ArrowRight' ||
294:           event.key === 'ArrowUp' ||
295:           event.key === 'ArrowDown'
296:         ) {
297:           event.preventDefault();
298:           return;
299:         }
300:       }
301:       if (event.metaKey) {
302:         const shortcut = shortcuts.find((s) => (s?.key || '')?.includes('cmd'));
303:         const key = shortcut?.key || '';
304:         if (key) {
305:           const shortcutKey = key?.split('+').pop();
306:           const cmd = key?.includes('cmd');
307: 
308:           if (shortcutKey === event.key && cmd) {
309:             event.preventDefault();
310:             return;
311:           }
312:         }
313:       }
314: 
315:       if (event.ctrlKey) {
316:         const shortcut = shortcuts.find((s) => (s?.key || '')?.includes('ctrl'));
317:         const key = shortcut?.key || '';
318: 
319:         if (key) {
320:           const shortcutKey = key.split('+').pop();
321:           const ctrl = key?.includes('ctrl');
322: 
323:           if (shortcutKey === event.key && ctrl) {
324:             event.preventDefault();
325:             return;
326:           }
327:         }
328:       }
329: 
330:       const target = event.target as HTMLInputElement;
331:       setSelectionStart(target.selectionStart as number);
332: 
333:       const input = target.value + event.key;
334:       // log.info(`${window.pid}: onKeyDown: ${input}`);
335:       // log.info({
336:       //   modifiersLength: modifiers.length,
337:       //   modifiers,
338:       // });
339: 
340:       const currentModifiers = modifiers.filter((m) => event.getModifierState(m)).flatMap(remapModifiers);
341: 
342:       const modifiersNotShift = currentModifiers.filter((m) => m !== 'shift');
343:       if (input && shortcodes.includes(input) && modifiersNotShift.length === 0) {
344:         log.info(`${window.pid}: preventDefault(): found: '${input}'`);
345:         // setAppendToLog(`${window.pid}: preventDefault(): found: '${input}'`);
346:         event.preventDefault();
347:         channel(Channel.INPUT, {
348:           input,
349:         });
350:       }
351: 
352:       setModifiers(currentModifiers);
353: 
354:       // if the key is a modifier that isn't shift, return
355: 
356:       if (typeof setLastKeyDownWasModifier?.cancel === 'function') {
357:         setLastKeyDownWasModifier.cancel();
358:       }
359:       setLastKeyDownWasModifier(modifiers.includes(event.key) && event.key !== 'Shift');
360: 
361:       // If not Enter, Tab, or a modifier, setTyping to true
362:       if (event.key !== 'Enter' && event.key !== 'Tab' && !modifiers.length) {
363:         // typingEffect now handles typing state automatically.
364:       }
365: 
366:       // If key was delete and the value is empty, clear setInput
367:       if (event.key === 'Backspace' && target.value === '') {
368:         log.info('Clearing input');
369:         channel(Channel.INPUT, {
370:           input: '',
371:         });
372:       }
373:     },
374:     [setSelectionStart, setModifiers, setLastKeyDownWasModifier, shortcuts, flags, setInput, shortcodes],
375:   );
376: 
377:   const onKeyUp = useCallback(
378:     (event) => {
379:       setModifiers(modifiers.filter((m) => event.getModifierState(m)).flatMap(remapModifiers));
380: 
381:       if (typeof setLastKeyDownWasModifier?.cancel === 'function') {
382:         setLastKeyDownWasModifier.cancel();
383:       }
384:       _setLastKeyDownWasModifier(false);
385:     },
386:     [setModifiers],
387:   );
388: 
389:   return (
390:     <>
391:       <span
392:         ref={hiddenInputRef}
393:         id="hidden-input-measurer"
394:         className={`${fontSize} p-1 tracking-normal absolute`}
395:         style={{
396:           position: 'absolute',
397:           visibility: 'hidden',
398:           // don't break on any lines
399:           whiteSpace: 'nowrap',
400:         }}
401:       >
402:         {`${inputValue || placeholder}-pr`}
403:       </span>
404:       <input
405:         id="input"
406:         spellCheck="false"
407:         style={
408:           {
409:             width: `${hiddenInputMeasurerWidth}px`,
410:             // WebkitAppRegion: 'no-drag',
411:             // WebkitUserSelect: 'none',
412:             ...(submitted && { caretColor: 'transparent' }),
413:           } as any
414:         }
415:         disabled={submitted || promptData?.scriptlet || flagValue}
416:         className={`
417: 
418: bg-transparent tracking-normal text-text-base placeholder-text-base
419: placeholder-opacity-25
420: placeholder:tracking-normal
421: outline-none
422: focus:outline-none
423: focus:border-none
424: border-none
425: ${fontSize}
426: ${(submitted || flagValue) && 'text-opacity-50'}
427: 
428: max-w-full  pl-4 pr-0 py-0 ring-0 ring-opacity-0
429: focus:ring-0
430: focus:ring-opacity-0
431: 
432: ${promptData?.inputClassName || ''}
433: `}
434:         onChange={onChange}
435:         onKeyDown={onKeyDown}
436:         onKeyUp={onKeyUp}
437:         onKeyUpCapture={onKeyUp}
438:         placeholder={placeholder}
439:         ref={inputRef as LegacyRef<HTMLInputElement>}
440:         type={promptData?.secret ? 'password' : promptData?.type || 'text'}
441:         value={inputValue}
442:       />
443:     </>
444:   );
445: }
446: 
447: export default function Input() {
448:   const [inputFocus, setInputFocus] = useAtom(inputFocusAtom);
449: 
450:   const [fontSize] = useAtom(inputFontSizeAtom);
451:   const actions = useAtomValue(actionsAtom);
452:   const enterButtonName = useAtomValue(enterButtonNameAtom);
453:   const enterButtonDisabled = useAtomValue(enterButtonDisabledAtom);
454:   const shouldActionButtonShowOnInput = useAtomValue(shouldActionButtonShowOnInputAtom);
455:   const miniShortcutsVisible = useAtomValue(miniShortcutsVisibleAtom);
456:   const [miniShortcutsHovered, setMiniShortcutsHovered] = useAtom(_miniShortcutsHoveredAtom);
457: 
458:   const footerHidden = useAtomValue(footerHiddenAtom);
459:   const inputHeight = useAtomValue(inputHeightAtom);
460: 
461:   const user = useAtomValue(userAtom);
462:   const cachedAvatarUrl = useCachedAvatar(user?.avatar_url);
463:   const kitState = useAtomValue(kitStateAtom);
464:   const focusedChoice = useAtomValue(focusedChoiceAtom);
465:   const action = useAtomValue(signInActionAtom);
466:   const sendAction = useSetAtom(sendActionAtom);
467:   const [flagValue] = useAtom(flaggedChoiceValueAtom);
468: 
469:   const onClick = useCallback(
470:     (event) => {
471:       if (action) {
472:         sendAction(action);
473:       }
474:     },
475:     [action, sendAction],
476:   );
477: 
478:   useTab();
479:   useKeyIndex();
480: 
481:   const inputRef = useRef<HTMLInputElement>(null);
482: 
483:   useEffect(() => {
484:     const handleDocumentClick = (event: MouseEvent) => {
485:       if (document.activeElement === document.body) {
486:         log.info('🔍 Clicked on the document, so focusing input');
487:         setInputFocus(Math.random());
488:       }
489:     };
490: 
491:     document.addEventListener('click', handleDocumentClick);
492: 
493:     return () => {
494:       document.removeEventListener('click', handleDocumentClick);
495:     };
496:   }, []);
497: 
498:   return (
499:     <div
500:       key="input"
501:       ref={inputRef}
502:       className={`flex flex-row justify-between ${footerHidden && '-mt-px'} max-w-screen relative overflow-x-hidden`}
503:       style={{
504:         height: inputHeight || PROMPT.INPUT.HEIGHT.SM,
505:       }}
506:       // initial={{ opacity: 0 }}
507:       // animate={{ opacity: processing ? 0 : 1 }}
508:       // transition={{ duration: 0.2 }}
509:     >
510:       {/* "Hello World" text */}
511:       {/* <div className="absolute top-0.5 left-1/2 -translate-x-1/2 transform font-native text-xxs text-primary">
512:         {name} - {description}
513:       </div> */}
514:       <div
515:         className="max-w-screen flex-1 flex flex-nowrap items-center max-h-full mt-0.5"
516:         style={
517:           {
518:             // WebkitAppRegion: 'drag',
519:             // WebkitUserSelect: 'none',
520:           }
521:         }
522:       >
523:         <MainInput />
524:         <QuickInputs />
525:       </div>
526:       {footerHidden && (
527:         <div
528:           className="flex flex-row items-center justify-end overflow-x-clip mt-0.5"
529:           style={{
530:             maxWidth: '80%',
531:           }}
532:         >
533:           {/* biome-ignore lint/a11y/useKeyWithMouseEvents: <explanation> */}
534:           <div
535:             onMouseOver={() => setMiniShortcutsHovered(true)}
536:             onMouseLeave={() => setMiniShortcutsHovered(false)}
537:             style={{
538:               height: inputHeight || PROMPT.INPUT.HEIGHT.BASE,
539:             }}
540:             className={`right-container
541:       flex min-w-fit flex-grow flex-row items-center justify-end overflow-hidden ${
542:         inputHeight === PROMPT.INPUT.HEIGHT.XS && 'origin-right scale-95'
543:       }`}
544:           >
545:             <div className="flex flex-grow-0 flex-row items-center overflow-hidden">
546:               {actions
547:                 .filter((action) => action.position === 'right')
548:                 .flatMap((action, i, array) => {
549:                   if (!action?.visible && miniShortcutsVisible) {
550:                     const key = `${action?.key}-button`;
551:                     const keySeparator = `${action?.key}-separator`;
552:                     return [
553:                       // eslint-disable-next-line react/jsx-key
554:                       <ActionButton {...action} key={key} />,
555:                       // eslint-disable-next-line no-nested-ternary
556:                       i < array.length - 1 ? (
557:                         <ActionSeparator key={keySeparator} />
558:                       ) : enterButtonName ? (
559:                         <ActionSeparator key={keySeparator} />
560:                       ) : null,
561:                     ];
562:                   }
563: 
564:                   return null;
565:                 })}
566:             </div>
567: 
568:             <div className="enter-container flex min-w-fit flex-row items-center">
569:               {enterButtonName ? (
570:                 <EnterButton
571:                   key="enter-button"
572:                   name={enterButtonName}
573:                   position="right"
574:                   shortcut="⏎"
575:                   value="enter"
576:                   flag=""
577:                   disabled={enterButtonDisabled || flagValue}
578:                 />
579:               ) : null}
580:               <ActionSeparator key="options-separator" />
581:             </div>
582: 
583:             <div className="flex flex-grow-0 flex-row items-center overflow-hidden">
584:               {actions
585:                 .filter((action) => action.position === 'right')
586:                 .flatMap((action, i, array) => {
587:                   if (action?.visible) {
588:                     return [
589:                       // eslint-disable-next-line react/jsx-key
590:                       <ActionButton {...action} />,
591:                       // eslint-disable-next-line no-nested-ternary
592:                       i < array.length - 1 ? (
593:                         <ActionSeparator key={`${action?.key}-separator`} />
594:                       ) : enterButtonName ? (
595:                         <ActionSeparator key={`${action?.key}-separator`} />
596:                       ) : null,
597:                     ];
598:                   }
599: 
600:                   return null;
601:                 })}
602:             </div>
603: 
604:             {shouldActionButtonShowOnInput && !focusedChoice?.ignoreFlags && (
605:               <>
606:                 <div className="options-container flex flex-row">
607:                   <OptionsButton key="options-button" />
608:                   <ActionSeparator key="login-separator" />
609:                 </div>
610:               </>
611:             )}
612: 
613:             <div className="flex flex-row items-center">
614:               {(user.login || action) && (
615:                 <span
616:                   className={`relative ${inputHeight === PROMPT.INPUT.HEIGHT.XS ? 'w-[28px]' : 'w-[30px]'} pl-1 pr-1 mr-1`}
617:                 >
618:                   {user.login && user.avatar_url ? (
619:                     <img
620:                       onClick={onClick}
621:                       alt="avatar"
622:                       src={cachedAvatarUrl || user.avatar_url}
623:                       className="z-0 w-[22px] cursor-pointer rounded-full hover:opacity-75 -mt-[2px]"
624:                     />
625:                   ) : user.login ? (
626:                     <div
627:                       onClick={onClick}
628:                       className="z-0 w-[22px] h-[22px] cursor-pointer rounded-full hover:opacity-75 bg-current"
629:                     />
630:                   ) : (
631:                     // Show GitHub icon when not logged in but action exists
632:                     <button
633:                       type="button"
634:                       onClick={onClick}
635:                       className="z-0 w-[22px] h-[22px] cursor-pointer rounded-full hover:opacity-75 flex items-center justify-center"
636:                     >
637:                       <GithubIcon className="w-4 h-4" />
638:                     </button>
639:                   )}
640:                   {kitState.isSponsor && (
641:                     <svg
642:                       height="24"
643:                       width="24"
644:                       viewBox="0 0 24 24"
645:                       xmlns="http://www.w3.org/2000/svg"
646:                       className="absolute right-[-7px] top-[-7px] z-10 h-[15px] text-primary opacity-90"
647:                     >
648:                       <g fill="currentColor">
649:                         <path
650:                           d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27z"
651:                           fill="current"
652:                           fillOpacity="0.9"
653:                         />
654:                       </g>
655:                     </svg>
656:                   )}
657:                 </span>
658:               )}
659: 
660:               <div className="relative mx-2 flex min-w-0">
661:                 <IconButton />
662:               </div>
663:             </div>
664:           </div>
665:         </div>
666:       )}
667:     </div>
668:   );
669: }
```

## File: src/renderer/src/state/atoms/app-core.ts
```typescript
 1: /**
 2:  * Core application state, configuration, and process management atoms.
 3:  * These atoms handle the fundamental app configuration and lifecycle states.
 4:  */
 5: 
 6: import type { UserDb } from '@johnlindquist/kit/core/db';
 7: import type { ProcessInfo } from '@johnlindquist/kit/types/core';
 8: import { atom } from 'jotai';
 9: 
10: // --- Configuration and Environment ---
11: 
12: export const appConfigAtom = atom({
13:   isWin: false,
14:   isMac: false,
15:   isLinux: false,
16:   os: '',
17:   sep: '',
18:   assetPath: '',
19:   version: '',
20:   delimiter: '',
21:   url: '',
22: } as const);
23: 
24: export const kitConfigAtom = atom({
25:   kitPath: '',
26:   mainScriptPath: '',
27: });
28: 
29: export const userAtom = atom<UserDb>({});
30: 
31: export const _kitStateAtom = atom({
32:   isSponsor: false,
33:   updateDownloaded: false,
34:   promptCount: 0,
35:   noPreview: false,
36:   isMac: false,
37: });
38: 
39: export const kitStateAtom = atom(
40:   (g) => g(_kitStateAtom),
41:   (g, s, a: any) => {
42:     s(_kitStateAtom, {
43:       ...g(_kitStateAtom),
44:       ...a,
45:     });
46:   },
47: );
48: 
49: export const isSponsorAtom = atom(false);
50: export const updateAvailableAtom = atom(false);
51: export const processesAtom = atom<ProcessInfo[]>([]);
52: export const cmdAtom = atom((g) => (g(appConfigAtom).isWin ? 'ctrl' : 'cmd'));
53: 
54: // --- Process and Execution State ---
55: 
56: let currentPid = 0;
57: export const getPid = () => currentPid;
58: const _pidAtom = atom(0);
59: export const pidAtom = atom(
60:   (g) => g(_pidAtom),
61:   (_g, s, a: number) => {
62:     window.pid = a;
63:     s(_pidAtom, a);
64:     currentPid = a;
65:   },
66: );
67: 
68: export const processingAtom = atom(false);
69: export const runningAtom = atom(false);
70: export const submittedAtom = atom(false);
71: 
72: const loading = atom<boolean>(false);
73: export const loadingAtom = atom(
74:   (g) => g(loading) || g(runningAtom),
75:   (_g, s, a: boolean) => {
76:     s(loading, a);
77:   },
78: );
79: 
80: export const progressAtom = atom(0);
81: 
82: // --- Application Lifecycle and Visibility ---
83: 
84: export const isHiddenAtom = atom(false);
85: export const promptActiveAtom = atom(false);
86: export const justOpenedAtom = atom(false);
87: 
88: const isReady = atom(true); // Used primarily for the Splash screen
89: export const isReadyAtom = atom(
90:   (g) => g(isReady),
91:   (_g, s, a: boolean) => {
92:     s(isReady, a);
93:   },
94: );
95: 
96: // --- Caching ---
97: 
98: export const cachedAtom = atom(false);
```

## File: src/renderer/src/state/atoms/ipc.ts
```typescript
 1: /**
 2:  * IPC and channel communication atoms.
 3:  * Handles inter-process communication with the main process.
 4:  */
 5: 
 6: import { atom } from 'jotai';
 7: import { Channel } from '@johnlindquist/kit/core/enum';
 8: import { AppChannel } from '../../../../shared/enums';
 9: import type { AppState, AppMessage, Survey } from '@johnlindquist/kit/types/core';
10: import type { ResizeData } from '../../../../shared/types';
11: import { createLogger } from '../../log-utils';
12: 
13: const { ipcRenderer } = window.electron;
14: const log = createLogger('ipc.ts');
15: 
16: // --- Channel State ---
17: export const pauseChannelAtom = atom(false);
18: 
19: // --- Submission State ---
20: export const _submitValue = atom('');
21: // export const submitValueAtom = atom((g) => g(_submitValue)); // Complex version with computed properties is in jotai.ts
22: export const disableSubmitAtom = atom(false);
23: 
24: // --- Shortcodes ---
25: type OnInputSubmit = { [key: string]: any };
26: export const onInputSubmitAtom = atom<OnInputSubmit>({});
27: type OnShortcut = { [key: string]: any };
28: export const onShortcutAtom = atom<OnShortcut>({});
29: export const shortcodesAtom = atom<string[]>([]);
30: 
31: // --- IPC Actions ---
32: // export const runMainScriptAtom = atom(() => () => {
33: //   ipcRenderer.send(AppChannel.RUN_MAIN_SCRIPT);
34: // }); // Complex version with computed properties is in jotai.ts
35: 
36: export const runKenvTrustScriptAtom = atom(() => (kenv: string) => {
37:   log.info(`🔑 Running kenv-trust script for ${kenv}`);
38:   ipcRenderer.send(AppChannel.RUN_KENV_TRUST_SCRIPT, { kenv });
39: });
40: 
41: export const runProcessesAtom = atom(() => () => {
42:   ipcRenderer.send(AppChannel.RUN_PROCESSES_SCRIPT);
43: });
44: 
45: export const applyUpdateAtom = atom(() => () => {
46:   ipcRenderer.send(AppChannel.APPLY_UPDATE);
47: });
48: 
49: export const loginAtom = atom((_g) => {
50:   return () => {
51:     ipcRenderer.send(AppChannel.LOGIN);
52:   };
53: });
54: 
55: export const submitSurveyAtom = atom(null, (_g, _s, a: Survey) => {
56:   ipcRenderer.send(AppChannel.FEEDBACK, a);
57: });
58: 
59: export const logAtom = atom((_g) => {
60:   type levelType = 'debug' | 'info' | 'warn' | 'error' | 'silly';
61:   return (message: any, level: levelType = 'info') => {
62:     ipcRenderer.send(AppChannel.LOG, { message, level });
63:   };
64: });
```

## File: src/main/prompt.init-utils.ts
```typescript
  1: import type { KitPrompt } from './prompt';
  2: import { Channel } from '@johnlindquist/kit/core/enum';
  3: import { HideReason } from '../shared/enums';
  4: import { getMainScriptPath } from '@johnlindquist/kit/core/utils';
  5: import { kitState } from './state';
  6: import { AppChannel } from '../shared/enums';
  7: import { getAssetPath } from '../shared/assets';
  8: import os from 'node:os';
  9: import path from 'node:path';
 10: import { getVersion } from './version';
 11: import { ipcMain, shell } from 'electron';
 12: import { KitEvent, emitter } from '../shared/events';
 13: import { processes } from './process';
 14: import { cliFromParams, runPromptProcess } from './kit';
 15: import { kitPath } from '@johnlindquist/kit/core/utils';
 16: import { app, BrowserWindow } from 'electron';
 17: import { fileURLToPath } from 'node:url';
 18: 
 19: export function setupDevtoolsHandlers(prompt: KitPrompt) {
 20:   prompt.window.webContents?.on('devtools-opened', () => {
 21:     prompt.devToolsOpening = false;
 22:     prompt.window.removeListener('blur', prompt.onBlur);
 23:     // Removed makeWindow() call - no longer needed
 24:     prompt.sendToPrompt(Channel.DEV_TOOLS, true);
 25:   });
 26: 
 27:   prompt.window.webContents?.on('devtools-closed', () => {
 28:     prompt.logSilly('event: devtools-closed');
 29: 
 30:     // Simplified logic - always set alwaysOnTop to false
 31:     prompt.setPromptAlwaysOnTop(false);
 32: 
 33:     if (prompt.scriptPath !== getMainScriptPath()) {
 34:       prompt.maybeHide(HideReason.DevToolsClosed);
 35:     }
 36: 
 37:     prompt.window.on('blur', prompt.onBlur);
 38:     prompt.sendToPrompt(Channel.DEV_TOOLS, false);
 39:   });
 40: }
 41: 
 42: export function setupDomAndFinishLoadHandlers(prompt: KitPrompt) {
 43:   prompt.window.webContents?.on('dom-ready', () => {
 44:     prompt.logInfo('📦 dom-ready');
 45:     prompt.window?.webContents?.setZoomLevel(0);
 46:     prompt.window.webContents?.on('before-input-event', prompt.beforeInputHandler as any);
 47:   });
 48: 
 49:   prompt.window.webContents?.once('did-finish-load', () => {
 50:     kitState.hiddenByUser = false;
 51:     prompt.logSilly('event: did-finish-load');
 52:     prompt.sendToPrompt(Channel.APP_CONFIG as any, {
 53:       delimiter: path.delimiter,
 54:       sep: path.sep,
 55:       os: os.platform(),
 56:       isMac: os.platform().startsWith('darwin'),
 57:       isWin: os.platform().startsWith('win'),
 58:       isLinux: os.platform().startsWith('linux'),
 59:       assetPath: getAssetPath(),
 60:       version: getVersion(),
 61:       isDark: kitState.isDark,
 62:       searchDebounce: kitState.kenvEnv?.KIT_SEARCH_DEBOUNCE !== 'false',
 63:       termFont: kitState.kenvEnv?.KIT_TERM_FONT || 'monospace',
 64:       url: kitState.url,
 65:     });
 66: 
 67:     const user = (prompt as any).snapshot ? (prompt as any).snapshot(kitState.user) : kitState.user;
 68:     prompt.logInfo(`did-finish-load, setting prompt user to: ${user?.login}`);
 69:     prompt.sendToPrompt(AppChannel.USER_CHANGED, user);
 70:     (prompt as any).setKitStateAtom?.({ isSponsor: kitState.isSponsor });
 71:     emitter.emit(KitEvent.DID_FINISH_LOAD);
 72: 
 73:     const messagesReadyHandler = async (_event, _pid) => {
 74:       if (!prompt.window || prompt.window.isDestroyed()) {
 75:         prompt.logError('📬 Messages ready. Prompt window is destroyed. Not initializing');
 76:         return;
 77:       }
 78:       prompt.logInfo('📬 Messages ready. ');
 79:       prompt.window.on('blur', prompt.onBlur);
 80: 
 81:       if (prompt.initMain) prompt.initMainPrompt('messages ready');
 82: 
 83:       prompt.readyEmitter.emit('ready');
 84:       prompt.ready = true;
 85: 
 86:       prompt.logInfo(`🚀 Prompt ready. Forcing render. ${prompt.window?.isVisible() ? 'visible' : 'hidden'}`);
 87:       prompt.sendToPrompt(AppChannel.FORCE_RENDER, undefined);
 88:       await prompt.window?.webContents?.executeJavaScript('console.log(document.body.offsetHeight);');
 89:       await prompt.window?.webContents?.executeJavaScript('console.clear();');
 90:     };
 91: 
 92:     ipcMain.once(AppChannel.MESSAGES_READY, messagesReadyHandler as any);
 93: 
 94:     if (kitState.kenvEnv?.KIT_MIC) {
 95:       prompt.sendToPrompt(AppChannel.SET_MIC_ID, kitState.kenvEnv.KIT_MIC);
 96:     }
 97:     if (kitState.kenvEnv?.KIT_WEBCAM) {
 98:       prompt.sendToPrompt(AppChannel.SET_WEBCAM_ID, kitState.kenvEnv.KIT_WEBCAM);
 99:     }
100:   });
101: 
102:   prompt.window.webContents?.on('did-fail-load', (errorCode, errorDescription, validatedURL, isMainFrame) => {
103:     prompt.logError(`did-fail-load: ${errorCode} ${errorDescription} ${validatedURL} ${isMainFrame}`);
104:   });
105: 
106:   prompt.window.webContents?.on('did-stop-loading', () => {
107:     prompt.logInfo('did-stop-loading');
108:   });
109: 
110:   prompt.window.webContents?.on('dom-ready', () => {
111:     prompt.logInfo(`🍀 dom-ready on ${prompt?.scriptPath}`);
112:     prompt.sendToPrompt(AppChannel.SET_READY, true);
113:   });
114: 
115:   prompt.window.webContents?.on('render-process-gone', (event, details) => {
116:     try { processes.removeByPid(prompt.pid, 'prompt exit cleanup'); } catch { }
117:     prompt.sendToPrompt = (() => { }) as any;
118:     (prompt.window.webContents as any).send = () => { };
119:     prompt.logError('🫣 Render process gone...');
120:     prompt.logError({ event, details });
121:   });
122: }
123: 
124: export function setupNavigationHandlers(prompt: KitPrompt) {
125:   prompt.window.webContents?.on('will-navigate', async (event, navigationUrl) => {
126:     try {
127:       const url = new URL(navigationUrl);
128:       prompt.logInfo(`👉 Prevent navigating to ${navigationUrl}`);
129:       event.preventDefault();
130: 
131:       const pathname = url.pathname.replace('//', '');
132: 
133:       if (url.host === 'scriptkit.com' && url.pathname === '/api/new') {
134:         await cliFromParams('new-from-protocol', url.searchParams);
135:       } else if (url.host === 'scriptkit.com' && pathname === 'kenv') {
136:         const repo = url.searchParams.get('repo');
137:         await runPromptProcess(kitPath('cli', 'kenv-clone.js'), [repo || '']);
138:       } else if (url.protocol === 'kit:') {
139:         prompt.logInfo('Attempting to run kit protocol:', JSON.stringify(url));
140:         await cliFromParams(url.pathname, url.searchParams);
141:       } else if (url.protocol === 'submit:') {
142:         prompt.logInfo('Attempting to run submit protocol:', JSON.stringify(url));
143:         prompt.sendToPrompt(Channel.SET_SUBMIT_VALUE as any, url.pathname);
144:       } else if (url.protocol.startsWith('http')) {
145:         shell.openExternal(url.href);
146:       }
147:     } catch (e) {
148:       prompt.logWarn(e);
149:     }
150:   });
151: 
152:   prompt.window.webContents?.setWindowOpenHandler(({ url }) => {
153:     prompt.logInfo(`Opening ${url}`);
154:     if (!url.startsWith('http')) return { action: 'deny' } as any;
155:     shell.openExternal(url);
156:     return { action: 'deny' } as any;
157:   });
158: }
159: 
160: export function loadPromptHtml(prompt: KitPrompt) {
161:   prompt.logSilly('Loading prompt window html');
162:   if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
163:     prompt.window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/index.html`);
164:   } else {
165:     prompt.window.loadFile(fileURLToPath(new URL('../renderer/index.html', import.meta.url)));
166:   }
167: }
168: 
169: export function setupWindowLifecycleHandlers(prompt: KitPrompt) {
170:   prompt.window.webContents?.on('unresponsive', () => {
171:     prompt.logError('Prompt window unresponsive. Reloading');
172:     if (prompt.window.isDestroyed()) {
173:       prompt.logError('Prompt window is destroyed. Not reloading');
174:       return;
175:     }
176:     prompt.window.webContents?.once('did-finish-load', () => {
177:       prompt.logInfo('Prompt window reloaded');
178:     });
179:     prompt.window.reload();
180:   });
181: 
182:   prompt.window.on('always-on-top-changed', () => prompt.logInfo('📌 always-on-top-changed'));
183:   prompt.window.on('minimize', () => prompt.logInfo('📌 minimize'));
184:   prompt.window.on('restore', () => prompt.logInfo('📌 restore'));
185:   prompt.window.on('maximize', () => prompt.logInfo('📌 maximize'));
186:   prompt.window.on('unmaximize', () => prompt.logInfo('📌 unmaximize'));
187:   prompt.window.on('close', () => {
188:     try { processes.removeByPid((prompt as any).pid, 'prompt destroy cleanup'); } catch { }
189:     prompt.logInfo('📌 close');
190:   });
191:   prompt.window.on('closed', () => {
192:     prompt.logInfo('📌 closed');
193:     (kitState as any).emojiActive = false;
194:   });
195:   prompt.window.webContents?.on('focus', () => {
196:     prompt.logInfo(' WebContents Focus');
197:     (prompt as any).emojiActive = false;
198:   });
199: }
```
