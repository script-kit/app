import path from 'node:path';
import { snippetLog } from './logs';
import { cacheSnippets } from './snippet-cache';
import { kitState } from './state';
import { addTextSnippet, snippetMap, snippetScriptChanged } from './tick';

export async function snippetsSelfCheck() {
  const expansionsNeeded = new Set<string>();
  try {
    // 1) Ensure text snippets are cached
    await cacheSnippets();

    // 2) Check snippets from normal scripts (with .expand or .snippet).
    for (const [filePath, script] of kitState.scripts) {
      const expand = script?.expand || script?.snippet;
      if (!expand) {
        continue;
      }

      let snippetKey = expand;
      if (expand.startsWith('*')) {
        snippetKey = expand.slice(1);
      }

      if (script.kenv && script.kenv !== '' && !kitState.trustedKenvs.includes(script.kenv)) {
        continue;
      }

      expansionsNeeded.add(snippetKey);

      if (snippetMap.has(snippetKey)) {
        const existing = snippetMap.get(snippetKey);
        if (existing?.filePath !== filePath) {
          snippetLog.info(`[selfHealSnippets] Snippet key '${snippetKey}' mismatched file path. Re-adding...`);
          snippetMap.delete(snippetKey);
          await snippetScriptChanged(script);
        }
      } else {
        snippetLog.info(
          `[selfHealSnippets] Missing snippet key '${snippetKey}' from script: ${filePath}. Re-adding...`,
        );
        await snippetScriptChanged(script);
      }
    }

    // 3) Also include text snippet keys from snippetFiles
    for (const sf of kitState.snippetFiles.values()) {
      // Apply trust boundary for sub-kenvs
      if (sf.filePath.includes(`${path.sep}kenvs${path.sep}`)) {
        const parts = sf.filePath.split(path.sep);
        const kenvIndex = parts.lastIndexOf('kenvs');
        if (kenvIndex >= 0 && kenvIndex + 1 < parts.length) {
          const kenvName = parts[kenvIndex + 1];
          if (kenvName && !kitState.trustedKenvs.includes(kenvName)) {
            continue; // Skip untrusted sub-kenv snippet
          }
        }
      }

      expansionsNeeded.add(sf.snippetKey);

      if (!snippetMap.has(sf.snippetKey)) {
        snippetLog.info(`[selfHealSnippets] Missing text snippet '${sf.snippetKey}'. Re-adding...`);
        snippetMap.set(sf.snippetKey, { filePath: sf.filePath, postfix: sf.postfix, txt: true });
      }
    }

    // 4) Remove any extra entries from snippetMap.
    for (const [key] of snippetMap.entries()) {
      if (!expansionsNeeded.has(key)) {
        snippetLog.info(`[selfHealSnippets] snippetMap has extra key '${key}'. Removing...`);
        snippetMap.delete(key);
      }
    }
  } catch (error) {
    snippetLog.error('[selfHealSnippets] Error:', error);
  }
}
