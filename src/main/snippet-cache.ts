// snippet-cache.ts
// Uses the unified metadata parser from the SDK for consistency

import { readFile, stat } from 'node:fs/promises';
import { kenvPath, parseSnippetMetadata } from '@johnlindquist/kit/core/utils';
import log from 'electron-log';
import { globby } from 'globby';
import { kitState, type SnippetFile } from './state';
import { snippetMap, updateSnippetPrefixIndex } from './tick';

// Cache to avoid re-parsing unchanged files (matches SDK behavior)
interface CachedSnippetFile {
  mtimeMs: number;
  data: SnippetFile;
}
const appSnippetCache = new Map<string, CachedSnippetFile>();

/**
 * Parse snippet metadata using the unified SDK parser.
 * This ensures consistent behavior between App and SDK.
 *
 * @param contents - The snippet file contents
 * @returns Parsed metadata, snippet key, postfix flag, and body
 */
export function parseSnippet(contents: string) {
  const result = parseSnippetMetadata(contents);

  // Log warnings for invalid metadata keys (helps users debug issues)
  if (result.warnings.length > 0) {
    for (const warning of result.warnings) {
      const suggestion = warning.suggestion ? ` ${warning.suggestion}` : '';
      log.warn(`[parseSnippet] Line ${warning.line}: ${warning.message}${suggestion}`);
    }
  }

  return {
    metadata: result.metadata as Record<string, string>,
    snippetKey: result.snippetKey,
    postfix: result.postfix,
    snippetBody: result.snippetBody,
  };
}

export async function cacheSnippets() {
  try {
    log.info('[cacheSnippets] Start scanning snippets (recursive, matching SDK behavior)');

    // Match SDK glob patterns: recursive scanning of snippets and kenvs
    const snippetFiles = await globby(
      [
        kenvPath('snippets', '**', '*.txt').replaceAll('\\', '/'),
        kenvPath('kenvs', '*', 'snippets', '**', '*.txt').replaceAll('\\', '/'),
      ],
      {
        onlyFiles: true,
        absolute: true,
      },
    );

    // We'll build a fresh map, then swap it into kitState at the end.
    const newSnippetMap = new Map<string, SnippetFile>();

    for await (const filePath of snippetFiles) {
      try {
        // Check mtime to avoid re-parsing unchanged files (like SDK)
        const fileStat = await stat(filePath);
        const currentMtimeMs = fileStat.mtimeMs;

        const cached = appSnippetCache.get(filePath);
        if (cached && cached.mtimeMs === currentMtimeMs) {
          // Use cached data
          newSnippetMap.set(filePath, cached.data);
          continue;
        }

        const contents = await readFile(filePath, 'utf8');
        const { metadata, snippetKey, postfix, snippetBody } = parseSnippet(contents);

        if (!snippetKey) {
          // no "snippet:" or "expand:" found, skip
          continue;
        }

        const snippetData: SnippetFile = {
          filePath,
          snippetKey,
          postfix,
          rawMetadata: metadata,
          contents: snippetBody,
        };

        // Update caches
        appSnippetCache.set(filePath, { mtimeMs: currentMtimeMs, data: snippetData });
        newSnippetMap.set(filePath, snippetData);
      } catch (err) {
        log.warn(`[cacheSnippets] Error processing snippet file: ${filePath}`, err);
      }
    }

    // Assign to kitState
    kitState.snippetFiles = newSnippetMap;

    // Make them live in the runtime snippetMap
    for (const { filePath, snippetKey, postfix } of newSnippetMap.values()) {
      snippetMap.set(snippetKey, { filePath, postfix, txt: true });
    }

    // Rebuild prefix index after updating snippetMap (council recommendation)
    updateSnippetPrefixIndex();

    log.info(`[cacheSnippets] Cached ${newSnippetMap.size} snippet files`);
  } catch (error) {
    log.error('[cacheSnippets] Error:', error);
  }
}
