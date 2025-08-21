# Fix: Restore chat IPC with `channelAtom` and preserve child payloads

## Summary

After a large renderer state refactor, chat scripts began timing out on `CHAT_ADD_MESSAGE`. The refactor centralized IPC via `channelAtom` and removed per-message chat sends, leaving only a bulk `CHAT_MESSAGES_CHANGE`. Child processes still expected a prompt-side acknowledgement on the original per-message channels with a top-level `value` field.

This fix restores per-message chat sends using `channelAtom` and adds a small main-process shim to adapt the payload shape expected by existing scripts. We also instrumented logs to verify the end‑to‑end flow without reintroducing circular dependencies or build side effects.

## Symptoms

- Timeout errors in assistant chat scripts waiting for `CHAT_ADD_MESSAGE` response:
  - e.g., “Timeout after 1 seconds waiting for CHAT_ADD_MESSAGE response” in `assistant-chat.log`.
- No renderer logs indicating per-message chat sends.

## Root cause

- Pre‑refactor, the renderer sent per-message chat events directly via `ipcRenderer.send`:
  - `CHAT_ADD_MESSAGE` (with single message)
  - `CHAT_PUSH_TOKEN` (with updated last message)
  - `CHAT_SET_MESSAGE` (with replaced message)
- Refactor switched to a unified IPC path (`channelAtom`) and removed those direct sends from chat atoms. Only the array-level `CHAT_MESSAGES_CHANGE` effect remained.
- Child processes (scripts) still awaited a prompt-side response on the per-message channels, with `value` at the top level — which never arrived post-refactor.

## Constraints and goals

- Align with the goal to use `channelAtom` for all renderer → main sends.
- Avoid circular imports between modularized atoms and `jotai.ts`.
- Do not change the child script contract (expects top-level `value`).
- Keep the change minimal and avoid generating build artifacts (`.d.ts`/`.js`).

## Fix overview

1. Renderer: Reinstated per-message sends from chat atoms, but via `channelAtom` instead of raw `ipcRenderer`.
2. Main: Added a small shim that, for chat channels, copies `message.state.value` to top-level `message.value` before forwarding to the child.
3. Renderer UI: Ensured the Chat component triggers the per-message path by using `addChatMessageAtom` on submit; fixed a stray dependency that referenced `setMessages`.
4. Logging: Added info‑level logs in renderer (and mirrored to main) and instrumentation in main to trace forwarding and payload shape.

## Changes in detail

### Renderer atoms (src/renderer/src/state/atoms/chat.ts)

- `addChatMessageAtom`: after updating local state, call `const send = g(channelAtom); send(Channel.CHAT_ADD_MESSAGE, { value: message });`
- `chatPushTokenAtom`: after updating last message text, call `send(Channel.CHAT_PUSH_TOKEN, { value: lastMessage });`
- `setChatMessageAtom`: after replacement, call `send(Channel.CHAT_SET_MESSAGE, { value: message });`
- `chatMessageSubmitAtom`: now uses `channelAtom` to send `Channel.ON_SUBMIT` with `{ text, index }`.
- Logging: emit `chat.ts: CHAT_* send` at info level; also mirror to main via `AppChannel.LOG` so logs are discoverable in ScriptKit logs.

Why not use `ipcRenderer` directly? To keep consistency with the refactor’s goal: `channelAtom` is the single send entrypoint.

### Renderer UI (src/renderer/src/components/chat.tsx)

- On submit, add the message via `addChatMessageAtom` instead of manually pushing into the array. This triggers the per-message IPC send as intended.
- Fixed a runtime error by removing a stale `setMessages` reference from the `onSubmit` dependencies.

### Main process (src/main/ipc.ts)

- Before `child.send(message)`, for chat channels (`CHAT_ADD_MESSAGE`, `CHAT_PUSH_TOKEN`, `CHAT_SET_MESSAGE`):
  - If `message.value` is undefined and `message.state.value` exists, set `message.value = message.state.value`.
  - Log a one-line summary: pid, promptId, whether top-level value existed, whether state.value existed, inferred `valueType`, and `textLen` where applicable.

This preserves the child’s contract without changing renderer call sites.

## Verification

- Renderer mirrors (`AppChannel.LOG`) show:
  - `chat.ts: CHAT_ADD_MESSAGE send { index, hasText, textLen, type }`
  - `effects/chat.ts: CHAT_MESSAGES_CHANGE send { count, lastType, lastTextLen }`
- Main logs show forwarding:
  - `[Main IPC] forwarding CHAT_ADD_MESSAGE …` (with payload details)
- Assistant chat resumes working; no more timeouts.

Quick grep commands:

```
rg -n "chat.ts: .*CHAT_|effects/chat.ts: .*CHAT_" ~/Library/Logs/ScriptKit/main.log -S
rg -n "\[Main IPC\] forwarding (CHAT_ADD_MESSAGE|CHAT_PUSH_TOKEN|CHAT_SET_MESSAGE)" ~/Library/Logs/ScriptKit/ipc.log -S
```

## Alternatives considered

1. Raw outbox “args” sends (no `channelAtom`):
   - Use `pushIpcMessageAtom` with `{ channel, args: [payload] }` to preserve the exact top-level `value` shape.
   - Pros: No main shim required; payload shape matches child directly.
   - Cons: Diverges from the unified `channelAtom` path; mixed IPC patterns increase maintenance overhead.

2. Standardize on `state.value` in child:
   - Update child scripts to read `state.value` instead of top-level `value`.
   - Pros: Pure, no main shim; consistent envelope everywhere.
   - Cons: Breaks existing scripts and external ecosystems; higher migration cost and risk.

We chose `channelAtom + main shim` to align with refactor goals while preserving backwards compatibility.

## Gotchas and lessons

- Payload shape matters: child scripts relied on top-level `value`. When switching to an AppMessage envelope, either adapt the receiver or shim the sender.
- Consistency vs compatibility: centralizing sends through `channelAtom` is cleaner, but you may need a selective compatibility layer in main.
- Logging levels: ScriptKit collects renderer logs at `info` and above. Use `info` (not `verbose`) for temporary diagnostics.
- Avoid circular dependencies: import `channelAtom` via `state/shared-dependencies` to keep modular atoms decoupled from `jotai.ts` internals.
- UI must trigger atoms: the Chat UI initially bypassed the per-message atoms by mutating the array directly. Ensure UI uses the atoms that encapsulate IPC side-effects.

## Checklist for applying this pattern to other atoms

1. Identify pre‑refactor behavior: which channels fired, and payload shape (`value` vs `state.value`).
2. Rewire atom setters to use `channelAtom` with minimal `{ value: … }` overrides.
3. In main, add a targeted shim (if needed) to adapt `state.value` → `value` for legacy channels.
4. Update UI code to call atoms that encapsulate IPC, not mutate state directly.
5. Add info‑level logging (renderer + optional main mirror) during verification.
6. Validate with logs, then reduce logging noise afterward.

## File touchpoints

- Renderer
  - `src/renderer/src/state/atoms/chat.ts`
  - `src/renderer/src/components/chat.tsx`
  - `src/renderer/src/effects/chat.ts`
- Main
  - `src/main/ipc.ts` (forwarding shim and logs)

## Future cleanups

- Once confident, dial logging back to `verbose` or remove mirrors via `AppChannel.LOG`.
- Consider formalizing a main-layer adapter to declare channel-specific payload transforms to avoid ad‑hoc shims.

