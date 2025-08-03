import { atomEffect } from 'jotai-effect';
import { logLinesAtom, logHTMLAtom, convertAtom } from "../state";

// Convert log lines to HTML once per change in logLinesAtom.
export const logFormatterEffect = atomEffect((get, set) => {
  const lines = get(logLinesAtom);
  const convert = get(convertAtom)();
  const html = lines.map((l) => `<br/>${convert.toHtml(l)}`).join('');
  set(logHTMLAtom, html);
});
