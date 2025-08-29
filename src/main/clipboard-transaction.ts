import { clipboard } from 'electron';

type ClipboardSnapshot = {
  text: string;
  html: string;
  rtf: string;
  formats: string[];
};

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const takeClipboardSnapshot = (): ClipboardSnapshot => {
  try {
    return {
      text: clipboard.readText() || '',
      html: clipboard.readHTML() || '',
      rtf: clipboard.readRTF() || '',
      formats: clipboard.availableFormats() || [],
    };
  } catch {
    return { text: '', html: '', rtf: '', formats: [] };
  }
};

/**
 * Best-effort ensure the system clipboard contains the given text.
 * Polls until clipboard.readText() matches or timeout elapses.
 */
export const writeTextEnsure = async (text: string, timeoutMs = 500, pollMs = 25) => {
  clipboard.writeText(text);
  const start = Date.now();
  let current = '';
  do {
    try {
      current = clipboard.readText();
      if (current === text) return true;
    } catch {
      // ignore and retry
    }
    await delay(pollMs);
  } while (Date.now() - start < timeoutMs);
  return current === text;
};

/**
 * Conditionally restore the previous clipboard snapshot, but only if
 * the clipboard still matches the expected value (e.g., the text we wrote).
 * This avoids clobbering user changes that happened after our operation.
 */
export const conditionalRestore = async (
  prev: ClipboardSnapshot,
  expectedText: string,
  maxWaitMs = 0,
  pollMs = 50,
) => {
  const until = Date.now() + Math.max(0, maxWaitMs);
  while (Date.now() <= until) {
    const current = safeReadText();
    if (current !== expectedText) return false; // someone changed the clipboard; do not restore
    if (maxWaitMs === 0) break;
    await delay(pollMs);
  }

  try {
    // Restore multi-format when available
    if (prev.html) clipboard.writeHTML(prev.html);
    if (prev.rtf) clipboard.writeRTF(prev.rtf);
    clipboard.writeText(prev.text || '');
    return true;
  } catch {
    return false;
  }
};

const safeReadText = () => {
  try {
    return clipboard.readText();
  } catch {
    return '';
  }
};

