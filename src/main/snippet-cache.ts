// snippet-cache.ts (for example)

import { globby } from 'globby';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { kitState, type SnippetFile } from './state';
import { kenvPath } from '@johnlindquist/kit/core/utils';
import log from 'electron-log';

/**
 * Very similar to your existing parseSnippet,
 * but returns the snippetKey, postfix, etc.
 */
export function parseSnippet(contents: string) {
  const lines = contents.split('\n');
  const metadata: Record<string, string> = {};
  let snippetStartIndex = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^(?:\/\/|#)\s{0,2}([\w-]+):\s*(.*)/);
    if (match) {
      const key = match[1].trim().toLowerCase();
      const value = match[2].trim();
      metadata[key] = value;
    } else {
      snippetStartIndex = i;
      break;
    }
  }

  // You can store the snippet body too, if needed:
  const snippetBody = lines.slice(snippetStartIndex).join('\n');

  // The actual "snippet expand" key could be under "snippet" or "expand"
  let expandKey = metadata.snippet || metadata.expand;
  let postfix = false;

  if (expandKey?.startsWith('*')) {
    postfix = true;
    expandKey = expandKey.slice(1);
  }

  return {
    metadata,
    snippetKey: expandKey || '', // might be empty if no snippet found
    postfix,
    snippetBody, // optional
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

    log.info(`[cacheSnippets] Cached ${newSnippetMap.size} snippet files`);
  } catch (error) {
    log.error('[cacheSnippets] Error:', error);
  }
}
