// snippet-cache.ts
// Uses the unified metadata parser from the SDK for consistency

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { kenvPath, parseSnippetMetadata } from '@johnlindquist/kit/core/utils';
import log from 'electron-log';
import { globby } from 'globby';
import { type SnippetFile, kitState } from './state';
import { snippetMap } from './tick';

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
    log.info('[cacheSnippets] Start scanning <kenv>/snippets');
    const snippetDir = kenvPath('snippets');
    const snippetFiles = await globby([path.join(snippetDir, '*')], {
      onlyFiles: true,
      absolute: true,
    });

    // We'll build a fresh map, then swap it into kitState at the end.
    const newSnippetMap = new Map<string, SnippetFile>();

    for await (const filePath of snippetFiles) {
      let contents: string;
      try {
        contents = await readFile(filePath, 'utf8');
      } catch (err) {
        log.warn(`[cacheSnippets] Error reading snippet file: ${filePath}`, err);
        continue;
      }

      const { metadata, snippetKey, postfix } = parseSnippet(contents);

      if (!snippetKey) {
        // no "snippet:" or "expand:" found, skip
        continue;
      }

      newSnippetMap.set(filePath, {
        filePath,
        snippetKey,
        postfix,
        rawMetadata: metadata,
        contents,
      });
    }

    // Assign to kitState
    kitState.snippetFiles = newSnippetMap;

    // Make them live in the runtime snippetMap
    for (const { filePath, snippetKey, postfix } of newSnippetMap.values()) {
      snippetMap.set(snippetKey, { filePath, postfix, txt: true });
    }

    log.info(`[cacheSnippets] Cached ${newSnippetMap.size} snippet files`);
  } catch (error) {
    log.error('[cacheSnippets] Error:', error);
  }
}
