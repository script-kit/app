# Architecture Notes

## `src/main/state.ts` (now modular)
- **themes**: `src/main/state/themes.ts` — CSS for dark/light, `getThemes()`, `selectTheme()`.
- **keymap**: `src/main/state/keymap.ts` — reverse key map, `convertKeyInternal`, `wireKeymapSubscriptions`, `getEmojiShortcutInternal`.
- **sponsor/online**: `src/main/state/sponsor.ts` — DI-driven `makeOnline`, `makeSponsorCheck` for testability.

`state.ts` re-exports `convertKey` and `getEmojiShortcut` wrappers using the live `kitState`.

## `src/main/messages.ts`
- Small guardrails extracted:
  - `MUTABLE_KITSTATE_KEYS` centralizes allowed `SET_KIT_STATE` mutations.
  - `IMAGE_MAX_BYTES`/`IMAGE_REQUEST_TIMEOUT_MS` hoisted.
  - `fetchImageDimensions()` extracted for clarity.
- Core behavior unchanged to reduce risk; further modularization can build on these seams.

## Testing
- Unit tests added for `keymap` and `sponsor` logic in `tests/` directory
- Benchmarks added for performance-critical `convertKey` function in `bench/` directory

## Future Work
**Further split `messages.ts`** into groups (Clipboard, Keyboard/Mouse, Widget, Editor, Prompt/Window).
Do it **incrementally**: create `src/main/messages/handlers/*` modules and move channel handlers group‑by‑group, then `export const createMessageMap()` merges all `Partial<ChannelHandler>` maps with object spread.
This is a straight lift‑and‑shift using the helper closures already in the file (`handleChannelMessage`, `onChildChannel`, `onChildChannelOverride`, etc.).