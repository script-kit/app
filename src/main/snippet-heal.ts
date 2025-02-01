import { kitState } from './state';
import { snippetMap } from './tick'; // The in-memory snippetMap that powers expansions
import { addSnippet, addTextSnippet } from './tick';
import log from 'electron-log';

export async function snippetsSelfCheck() {
  try {
    // Build a set of expansions that should be present in snippetMap.
    const expansionsNeeded = new Set<string>();

    // 1) Check text-based snippets from kitState.snippets.
    for (const s of kitState.snippets.values()) {
      expansionsNeeded.add(s.snippetKey);

      if (snippetMap.has(s.snippetKey)) {
        const existing = snippetMap.get(s.snippetKey);
        if (existing?.filePath !== s.filePath) {
          log.info(`[selfHealSnippets] Snippet key '${s.snippetKey}' mismatched file path. Re-adding...`);
          snippetMap.delete(s.snippetKey);
          await addTextSnippet(s.filePath);
        }
      } else {
        log.info(`[selfHealSnippets] Missing snippet key '${s.snippetKey}' from file: ${s.filePath}. Re-adding...`);
        await addTextSnippet(s.filePath);
      }
    }

    // 2) Check snippets from normal scripts (with .expand or .snippet).
    for (const [filePath, script] of kitState.scripts) {
      const expand = script?.expand || script?.snippet;
      if (!expand) continue;

      let snippetKey = expand;
      if (expand.startsWith('*')) snippetKey = expand.slice(1);

      if (script.kenv && script.kenv !== '' && !kitState.trustedKenvs.includes(script.kenv)) {
        continue;
      }

      expansionsNeeded.add(snippetKey);

      if (snippetMap.has(snippetKey)) {
        const existing = snippetMap.get(snippetKey);
        if (existing?.filePath !== filePath) {
          log.info(`[selfHealSnippets] Snippet key '${snippetKey}' mismatched file path. Re-adding...`);
          snippetMap.delete(snippetKey);
          await addSnippet(script);
        }
      } else {
        log.info(`[selfHealSnippets] Missing snippet key '${snippetKey}' from script: ${filePath}. Re-adding...`);
        await addSnippet(script);
      }
    }

    // 3) Remove any extra entries from snippetMap.
    for (const [key] of snippetMap.entries()) {
      if (!expansionsNeeded.has(key)) {
        log.info(`[selfHealSnippets] snippetMap has extra key '${key}'. Removing...`);
        snippetMap.delete(key);
      }
    }
  } catch (error) {
    log.error('[selfHealSnippets] Error:', error);
  }
}
