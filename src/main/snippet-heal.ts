import { snippetLog } from './logs';
import { kitState } from './state';
import { snippetMap } from './tick'; // The in-memory snippetMap that powers expansions
import { addTextSnippet, snippetScriptChanged } from './tick';

export async function snippetsSelfCheck() {
  const expansionsNeeded = new Set<string>();
  try {
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

    // 3) Remove any extra entries from snippetMap.
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
