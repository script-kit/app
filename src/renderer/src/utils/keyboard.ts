/**
 * Remaps keyboard modifier names to their common aliases
 */
export const remapModifiers = (m: string): string | string[] => {
  if (m === 'Meta') {
    return ['cmd'];
  }
  if (m === 'Control') {
    return ['control', 'ctrl'];
  }
  if (m === 'Alt') {
    return ['alt', 'option'];
  }
  return m.toLowerCase();
};
