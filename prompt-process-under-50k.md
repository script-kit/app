This file is a merged representation of the filtered codebase, combined into a single document by packx.

<file_summary>
This section contains a summary of this file.

<purpose>
This file contains a packed representation of filtered repository contents.
It is designed to be easily consumable by AI systems for analysis, code review,
or other automated processes.
</purpose>

<usage_guidelines>
- Treat this file as a snapshot of the repository's state
- Be aware that this file may contain sensitive information
</usage_guidelines>

<notes>
- Files were filtered by packx based on content and extension matching
- Total files included: 72
- Context lines: 5 lines around each match
</notes>
</file_summary>

<directory_structure>
src/shared/types.ts
src/shared/events.ts
src/shared/enums.ts
src/main/watch.ts
src/main/track.ts
src/main/tick.ts
src/main/state.ts
src/main/schedule.ts
src/main/pty.ts
src/main/prompt.window-utils.ts
src/main/prompt.window-flow.ts
src/main/prompt.visibility-utils.ts
src/main/prompt.toggle-env.ts
src/main/prompt.state-utils.ts
src/main/prompt.set-prompt-data.ts
src/main/prompt.screen-utils.ts
src/main/prompt.resize-utils.ts
src/main/prompt.resize-listeners.ts
src/main/prompt.process-monitor.ts
src/main/prompt.process-connection.ts
src/main/prompt.notifications.ts
src/main/prompt.long-running.ts
src/main/prompt.log-state.ts
src/main/prompt.ipc-utils.ts
src/main/prompt.init-utils.ts
src/main/prompt.init-main.ts
src/main/prompt.hide-utils.ts
src/main/prompt.focus-utils.ts
src/main/prompt.cache.ts
src/main/prompt.bounds-utils.ts
src/main/prompt.bounds-apply.ts
src/main/notifications.ts
src/main/main-script.ts
src/main/logs.ts
src/main/info.ts
src/main/handleScript.ts
src/main/error.ts
src/main/dock.ts
src/main/cache.ts
src/main/background.ts
src/renderer/state/index.ts
src/renderer/src/audio-hooks.ts
src/main/state/sponsor.ts
src/main/pty/ipc-router.ts
src/renderer/src/state/ui-layout.ts
src/renderer/src/state/types.ts
src/renderer/src/state/shared-dependencies.ts
src/renderer/src/state/reset.ts
src/renderer/src/state/prompt-data.ts
src/renderer/src/state/app-lifecycle.ts
src/renderer/src/hooks/useShortcuts.ts
src/renderer/src/hooks/useMessages.ts
src/renderer/src/hooks/useFocus.ts
src/renderer/src/hooks/useEscape.ts
src/renderer/src/hooks/useEnter.ts
src/renderer/src/effects/termExit.ts
src/renderer/src/effects/resize.ts
src/renderer/src/effects/focusPrompt.ts
src/main/state/services/configuration.ts
src/renderer/src/state/services/resize.ts
src/renderer/src/state/selectors/resizeInputs.ts
src/renderer/src/state/selectors/appState.ts
src/renderer/src/state/resize/compute.ts
src/renderer/src/state/atoms/ui.ts
src/renderer/src/state/atoms/ui-elements.ts
src/renderer/src/state/atoms/terminal.ts
src/renderer/src/state/atoms/preview.ts
src/renderer/src/state/atoms/lifecycle.ts
src/renderer/src/state/atoms/cache.ts
src/renderer/src/state/atoms/bounds.ts
src/renderer/src/state/atoms/app-core.ts
src/renderer/src/state/atoms/actions.ts
</directory_structure>

<files>
This section contains the contents of the repository's files.

<file path="src/shared/types.ts" matches="1" windows="1">
    60│   subscribe: boolean;
    61│   contact: boolean;
    62│ }
    63│ 
    64│ export type TermConfig = {
    65│   promptId: string;
    66│   command: string;
    67│   cwd: string;
    68│   env: { [key: string]: string };
    69│   shell: string | boolean;
    70│   args?: string[];
</file>

<file path="src/shared/events.ts" matches="6" windows="1">
     3│ import type { Channel } from '@johnlindquist/kit/core/enum';
     4│ 
     5│ export enum KitEvent {
     6│   PauseShortcuts = 'PauseShortcuts',
     7│   ResumeShortcuts = 'ResumeShortcuts',
     8│   TryPromptScript = 'TryPromptScript',
     9│   SetKenv = 'SetKenv',
    10│   Blur = 'Blur',
    11│   ExitPrompt = 'HidePrompt',
    12│   ToggleBackground = 'ToggleBackground',
    13│   RunPromptProcess = 'RunPromptProcess',
    14│   CheckForUpdates = 'CheckForUpdates',
    15│   RunBackgroundProcess = 'RunBackgroundProcess',
    16│   RemoveProcess = 'RemoveProcess',
    17│   KillProcess = 'KillProcess',
    18│   OpenLog = 'OpenLog',
</file>

<file path="src/shared/enums.ts" matches="19" windows="3">
     3│ export enum AppChannel {
     4│   BUILD_TS_SCRIPT = 'BUILD_TS_SCRIPT',
     5│   CSS_CHANGED = 'CSS_CHANGED',
     6│   DRAG_FILE_PATH = 'DRAG_FILE_PATH',
     7│   EDIT_SCRIPT = 'EDIT_SCRIPT',
     8│   FORCE_CLOSE_PROMPT = 'FORCE_CLOSE_PROMPT',
     9│   FOCUS_PROMPT = 'FOCUS_PROMPT',
    10│   GET_ASSET = 'GET_ASSET',
    11│   INIT_RESIZE_HEIGHT = 'INIT_RESIZE_HEIGHT',
    12│   OPEN_FILE = 'OPEN_FILE',
    13│   OPEN_SCRIPT = 'OPEN_SCRIPT',
    14│   OPEN_SCRIPT_DB = 'OPEN_SCRIPT_DB',
    15│   OPEN_SCRIPT_LOG = 'OPEN_SCRIPT_LOG',
    16│   PROMPT_HEIGHT_RESET = 'PROMPT_HEIGHT_RESET',
    17│   READ_FILE_CONTENTS = 'READ_FILE_CONTENTS',
    18│   RECEIVE_FILE_CONTENTS = 'RECEIVE_FILE_CONTENTS',
    19│   RESIZE = 'RESIZE',
    20│   RUN_MAIN_SCRIPT = 'RUN_MAIN_SCRIPT',
    21│   SET_FILEPATH_BOUNDS = 'SET_PROMPT_DB',
    22│   SET_MAIN_HEIGHT = 'SET_MAIN_HEIGHT',
    23│   END_PROCESS = 'END_PROCESS',
    24│   FEEDBACK = 'SUBMIT_SURVEY',
    25│   PROCESSES = 'PROCESSES',
    26│   RUN_PROCESSES_SCRIPT = 'RUN_PROCESSES_SCRIPT',

  ...
    56│   SET_BOUNDS = 'SET_BOUNDS',
    57│   HIDE = 'HIDE',
    58│   SHOW = 'SHOW',
    59│   PRE_SHOW = 'PRE_SHOW',
    60│   PTY_READY = 'PTY_READY',
    61│   PROMPT_UNLOAD = 'PROMPT_UNLOAD',
    62│   SCROLL_TO_TOP = 'SCROLL_TO_TOP',
    63│   SCROLL_TO_INDEX = 'SCROLL_TO_INDEX',
    64│   INVOKE_SEARCH = 'INVOKE_SEARCH',
    65│   INVOKE_FLAG_SEARCH = 'INVOKE_FLAG_SEARCH',
    66│   SET_PRELOADED = 'SET_PRELOADED',
    67│   TRIGGER_KEYWORD = 'TRIGGER_KEYWORD',
    68│   RESET_PROMPT = 'RESET_PROMPT',
    69│   SET_CACHED_MAIN_SCORED_CHOICES = 'SET_CACHED_MAIN_SCORED_CHOICES',
    70│   SET_CACHED_MAIN_SHORTCUTS = 'SET_CACHED_MAIN_SHORTCUTS',
    71│   SET_CACHED_MAIN_PREVIEW = 'SET_CACHED_MAIN_PREVIEW',
    72│   SET_CACHED_MAIN_STATE = 'SET_CACHED_MAIN_STATE',
    73│   SET_TERM_FONT = 'SET_TERM_FONT',
    74│   BEFORE_INPUT_EVENT = 'BEFORE_INPUT_EVENT',
    75│   INIT_PROMPT = 'INIT_PROMPT',
    76│   MESSAGES_READY = 'MESSAGES_READY',
    77│   SET_CACHED_MAIN_SCRIPT_FLAGS = 'SET_CACHED_MAIN_SCRIPT_FLAGS',
    78│   CLEAR_CACHE = 'CLEAR_CACHE',
    79│   CLOSE_PROMPT = 'CLOSE_PROMPT',
    80│   GET_KIT_CONFIG = 'GET_KIT_CONFIG',
    81│   FORCE_RENDER = 'FORCE_RENDER',
    82│   INPUT_READY = 'INPUT_READY',
    83│   MAKE_WINDOW = 'MAKE_WINDOW',
    84│   SET_KEYBOARD_LAYOUT = 'SET_KEYBOARD_LAYOUT',
    85│   RUN_KENV_TRUST_SCRIPT = 'RUN_KENV_TRUST_SCRIPT',
    86│   TRIGGER_RESIZE = 'TRIGGER_RESIZE',
    87│   SET_PROMPT_BLURRED = 'SET_PROMPT_BLURRED',
    88│   REQUEST_RENDERER_STATE = 'REQUEST_RENDERER_STATE',
    89│   RESTORE_RENDERER_STATE = 'RESTORE_RENDERER_STATE',
    90│   SET_READY = 'SET_READY',
    91│ }
    92│ 

  ...
   127│   MessageFailed = 'MessageFailed',
   128│   Escape = 'Escape',
   129│   Suspend = 'Suspend',
   130│   DevToolsClosed = 'DevToolsClosed',
   131│   DomReady = 'DomReady',
   132│   RunPromptProcess = 'RunPromptProcess',
   133│   Destroy = 'Destroy',
   134│   NoScript = 'NoScript',
   135│   BeforeExit = 'BeforeExit',
   136│ }
   137│ 
</file>

<file path="src/main/watch.ts" matches="2" windows="2">
     3│ import path from 'node:path';
     4│ import type { Script } from '@johnlindquist/kit/types/core';
     5│ import chokidar from 'chokidar';
     6│ import { app } from 'electron';
     7│ import { Trigger } from '../shared/enums';
     8│ import { runPromptProcess } from './kit';
     9│ import { metadataWatcherLog as log } from './logs';
    10│ import { slash } from './path-utils';
    11│ import { kitState } from './state';
    12│ 
    13│ export const watchMap = new Map();

  ...
   100│ 
   101│     watcher.on('all', (eventName: string, filePath: string) => {
   102│       log.info({ eventName, filePath });
   103│       if (validWatchEvents.includes(eventName)) {
   104│         log.info(`👀 ${paths} changed`);
   105│         runPromptProcess(scriptPath, [filePath, eventName], {
   106│           force: false,
   107│           trigger: Trigger.Watch,
   108│           sponsorCheck: false,
   109│         });
   110│       }
</file>

<file path="src/main/track.ts" matches="2" windows="1">
     2│ import { kitState } from './state';
     3│ 
     4│ export enum TrackEvent {
     5│   Ready = 'Ready',
     6│   MainShortcut = 'MainShortcut',
     7│   SetPrompt = 'SetPrompt',
     8│   ScriptTrigger = 'ScriptTrigger',
     9│   Error = 'Error',
    10│   Quit = 'Quit',
    11│   LogError = 'LogError',
    12│   ChildError = 'ChildError',
</file>

<file path="src/main/tick.ts" matches="5" windows="3">
    20│ import { deleteText } from './keyboard';
    21│ 
    22│ import { addToClipboardHistory, getClipboardHistory } from './clipboard';
    23│ import { registerIO } from './io';
    24│ import { snippetLog, tickLog as log } from './logs';
    25│ import { prompts } from './prompts';
    26│ import shims from './shims';
    27│ 
    28│ type FrontmostApp = {
    29│   localizedName: string;
    30│   bundleId: string;

  ...
   380│           (kitState?.kenvEnv?.KIT_MAYBE_SECRET_REGEX &&
   381│             value.match(new RegExp(kitState?.kenvEnv?.KIT_MAYBE_SECRET_REGEX))),
   382│         );
   383│       }
   384│ 
   385│       const appName = prompts?.prevFocused ? 'Script Kit' : app?.localizedName || 'Unknown';
   386│       const clipboardItem = {
   387│         id: nanoid(),
   388│         name: itemName,
   389│         description: `${appName} - ${timestamp}`,
   390│         value,

  ...
   494│         trigger: Trigger.Snippet,
   495│       };
   496│ 
   497│       if (script.txt || script.filePath.endsWith('.txt')) {
   498│         log.info(`Running text snippet: ${script.filePath}`);
   499│         emitter.emit(KitEvent.RunPromptProcess, {
   500│           scriptPath: kitPath('app', 'paste-snippet.js'),
   501│           args: [...args, '--filePath', script.filePath],
   502│           options,
   503│         });
   504│       } else {
   505│         log.info(`Running scriptlet snippet: ${script.filePath}`);
   506│         emitter.emit(KitEvent.RunPromptProcess, {
   507│           scriptPath: script.filePath,
   508│           args,
   509│           options,
   510│         });
   511│       }
</file>

<file path="src/main/state.ts" matches="14" windows="8">
    15│ import { readdir } from 'node:fs/promises';
    16│ import type { Stamp, UserDb } from '@johnlindquist/kit/core/db';
    17│ import type {
    18│   Choice,
    19│   FlagsObject,
    20│   PromptData,
    21│   ScoredChoice,
    22│   Script,
    23│   Scriptlet,
    24│   Shortcut,
    25│   Snippet,

  ...
   270│   logLevel: (process?.env?.KIT_LOG_LEVEL as LogLevel) || 'info',
   271│   preventResize: false,
   272│   trayOpen: false,
   273│   trayScripts: [] as string[],
   274│   prevScriptPath: '',
   275│   promptHasPreview: true,
   276│   kitScripts: [] as Script[],
   277│   promptId: '__unset__',
   278│   hasSnippet: false,
   279│   isVisible: false,
   280│   shortcutsPaused: false,
   281│   devToolsCount: 0,
   282│   isActivated: false,

  ...
   296│   cancelTyping: false,
   297│   kenvEnv: {} as kenvEnv,
   298│   escapePressed: false,
   299│   shortcutPressed: '',
   300│   supportsNut: isMac || (isWin && arch === 'x64') || (isLinux && arch === 'x64'),
   301│   // DISABLING: Using the "accept" prompt as confirmation that people trust
   302│   // trustedKenvs: [] as string[],
   303│   suspendWatchers: false,
   304│   resizePaused: false,
   305│   trustedKenvs: [] as string[],
   306│   trustedKenvsKey: getTrustedKenvsKey(),

  ...
   317│   isThrottling: true,
   318│   ignoreInitial: false,
   319│   cmd: isMac ? 'cmd' : 'ctrl',
   320│   noPreview: false,
   321│   cachePreview: false,
   322│   cachePrompt: false,
   323│   dockShown: false,
   324│   attemptingPreload: false,
   325│   hasCss: false,
   326│   waitingForPing: false,
   327│   KIT_NODE_PATH: '',

  ...
   338│ 
   339│ export const kitConfig: Config = proxy(initConfig);
   340│ export const kitState: typeof initState = proxy(initState);
   341│ export type kitStateType = typeof initState;
   342│ 
   343│ export const promptState = proxy({
   344│   screens: {} as any,
   345│ });
   346│ 
   347│ const subStatus = subscribeKey(kitState, 'status', (status: KitStatus) => {
   348│   log.info(`👀 Status: ${JSON.stringify(status)}`);

  ...
   369│     scriptlets.map((scriptlet) => scriptlet.filePath),
   370│   );
   371│ });
   372│ 
   373│ // Widgets not showing up in Dock
   374│ // TODO: Dock is showing when main prompt is open. Check mac panel? Maybe setIcon?
   375│ 
   376│ const subIgnoreBlur = subscribeKey(kitState, 'ignoreBlur', (ignoreBlur) => {
   377│   log.info(`👀 Ignore blur: ${ignoreBlur ? 'true' : 'false'}`);
   378│   if (ignoreBlur) {
   379│     emitter.emit(KitEvent.ShowDock);
   380│   } else {
   381│     emitter.emit(KitEvent.HideDock);
   382│   }
   383│ });
   384│ 
   385│ const subPromptCount = subscribeKey(kitState, 'promptCount', (promptCount) => {
   386│   if (promptCount) {
   387│     // showDock();
   388│   } else {
   389│     emitter.emit(KitEvent.HideDock);
   390│   }
   391│ });

  ...
   449│ // subs is an array of functions
   450│ export const subs: (() => void)[] = [];
   451│ subs.push(
   452│   subRequiresAuthorizedRestart,
   453│   subScriptErrorPath,
   454│   subPromptCount,
   455│   subDevToolsCount,
   456│   subStatus,
   457│   subReady,
   458│   subIgnoreBlur,
   459│   scriptletsSub,

  ...
   463│ export const convertKey = (sourceKey: string) => convertKeyInternal(kitState, sourceKey);
   464│ export const getEmojiShortcut = () => getEmojiShortcutInternal(kitState);
   465│ 
   466│ export const preloadChoicesMap = new Map<string, Choice[]>();
   467│ export const preloadPreviewMap = new Map<string, string>();
   468│ export const preloadPromptDataMap = new Map<string, PromptData>();
   469│ 
   470│ export const kitClipboard = {
   471│   store: null as any,
   472│ };
   473│ 
</file>

<file path="src/main/schedule.ts" matches="2" windows="2">
     3│ import { getScripts } from '@johnlindquist/kit/core/db';
     4│ 
     5│ import { kitPath } from '@johnlindquist/kit/core/utils';
     6│ import type { Script } from '@johnlindquist/kit/types/core';
     7│ import { Trigger } from '../shared/enums';
     8│ import { runPromptProcess, runScript } from './kit';
     9│ import { scheduleLog } from './logs';
    10│ import { kitState, online, scheduleMap } from './state';
    11│ 
    12│ // ADD THIS (new function to log the entire scheduleMap)
    13│ function logAllScheduledJobs() {

  ...
   131│       return;
   132│     }
   133│ 
   134│     const scheduledFunction = () => {
   135│       scheduleLog.info(`[SCHEDULED_FUNCTION] Running script "${filePath}" at ${new Date().toISOString()}`);
   136│       runPromptProcess(filePath, [], {
   137│         force: false,
   138│         trigger: Trigger.Schedule,
   139│         sponsorCheck: false,
   140│       });
   141│     };
</file>

<file path="src/main/pty.ts" matches="5" windows="2">
     1│ import { termLog } from './logs';
     2│ import { PtyPool } from './pty/pool';
     3│ import { registerTerminalIpc } from './pty/ipc-router';
     4│ import type { KitPrompt } from './prompt';
     5│ 
     6│ export const ptyPool = new PtyPool();
     7│ 
     8│ export const createIdlePty = () => {
     9│   termLog.info(`🔧 [ptyPool] createIdlePty called, current PTY count: ${ptyPool.ptys.length}`);

  ...
    14│   } else {
    15│     termLog.info('🐲 >_ Idle pty already exists. Current pty count: ', ptyPool.ptys.length);
    16│   }
    17│ };
    18│ 
    19│ export const createPty = (prompt: KitPrompt) => {
    20│   registerTerminalIpc(prompt, ptyPool);
    21│ };
    22│ 
    23│ export const destroyPtyPool = async () => {
    24│   termLog.info('🐲 >_ Destroying pty pool');
    25│   await ptyPool.destroyPool();
</file>

<file path="src/main/prompt.window-utils.ts" matches="2" windows="1">
     1│ import type { BrowserWindow, Rectangle } from 'electron';
     2│ import { AppChannel } from '../shared/enums';
     3│ 
     4│ export function setPromptBounds(window: BrowserWindow, id: string, bounds: Rectangle, send: (channel: AppChannel, data: any) => void) {
     5│     window.setBounds(bounds, false);
     6│     const current = window.getBounds();
     7│     send(AppChannel.SET_PROMPT_BOUNDS as any, { id, ...current });
     8│ }
     9│ 
    10│ export function centerThenFocus(window: BrowserWindow, focus: () => void) {
    11│     window.setPosition(0, 0);
    12│     window.center();
</file>

<file path="src/main/prompt.window-flow.ts" matches="109" windows="1">
     1│ import path from 'node:path';
     2│ import type { Rectangle } from 'electron';
     3│ import { Channel, PROMPT } from '@johnlindquist/kit/core/enum';
     4│ import { getMainScriptPath } from '@johnlindquist/kit/core/utils';
     5│ import type { KitPrompt } from './prompt';
     6│ import { processWindowCoordinator, WindowOperation } from './process-window-coordinator';
     7│ import { ensureIdleProcess } from './process';
     8│ import { kitState } from './state';
     9│ import { getCurrentScreenPromptCache, getCurrentScreenFromMouse } from './prompt.screen-utils';
    10│ import shims from './shims';
    11│ 
    12│ export function initShowPromptFlow(prompt: KitPrompt) {
    13│   prompt.logInfo(`${prompt.pid}:🎪 initShowPrompt: ${prompt.id} ${prompt.scriptPath}`);
    14│   if (!kitState.isMac) {
    15│     if ((kitState?.kenvEnv as any)?.KIT_PROMPT_RESTORE === 'true') {
    16│       prompt.window?.restore();
    17│     }
    18│   }
    19│ 
    20│   prompt.setPromptAlwaysOnTop(true);
    21│   if (prompt.window && !prompt.window.isDestroyed()) {
    22│     (prompt as any).handleBlurVisibility?.(prompt);
    23│   }
    24│   prompt.focusPrompt();
    25│   prompt.sendToPrompt(Channel.SET_OPEN, true);
    26│   const topTimeout = (prompt as any).topTimeout;
    27│   if (topTimeout) clearTimeout(topTimeout);
    28│   setTimeout(() => {
    29│     ensureIdleProcess();
    30│   }, 10);
    31│ }
    32│ 
    33│ export function hideFlow(prompt: KitPrompt) {
    34│   if (prompt.window.isVisible()) {
    35│     prompt.hasBeenHidden = true as any;
    36│   }
    37│   prompt.logInfo('Hiding prompt window...');
    38│   if (prompt.window.isDestroyed()) {
    39│     prompt.logWarn('Prompt window is destroyed. Not hiding.');
    40│     return;
    41│   }
    42│   const hideOpId = processWindowCoordinator.registerOperation(prompt.pid, WindowOperation.Hide, prompt.window.id);
    43│   (prompt as any).actualHide();
    44│   processWindowCoordinator.completeOperation(hideOpId);
    45│ }
    46│ 
    47│ export function onHideOnceFlow(prompt: KitPrompt, fn: () => void) {
    48│   let id: null | NodeJS.Timeout = null;
    49│   if (prompt.window) {
    50│     const handler = () => {
    51│       if (id) clearTimeout(id);
    52│       prompt.window.removeListener('hide', handler);
    53│       fn();
    54│     };
    55│     id = setTimeout(() => {
    56│       if (!prompt?.window || prompt.window?.isDestroyed()) return;
    57│       prompt.window?.removeListener('hide', handler);
    58│     }, 1000);
    59│     prompt.window?.once('hide', handler);
    60│   }
    61│ }
    62│ 
    63│ export function showPromptFlow(prompt: KitPrompt) {
    64│   if (prompt.window.isDestroyed()) return;
    65│   const showOpId = processWindowCoordinator.registerOperation(prompt.pid, WindowOperation.Show, prompt.window.id);
    66│   initShowPromptFlow(prompt);
    67│   prompt.sendToPrompt(Channel.SET_OPEN, true);
    68│   if (!prompt?.window || prompt.window?.isDestroyed()) {
    69│     processWindowCoordinator.completeOperation(showOpId);
    70│     return;
    71│   }
    72│   prompt.shown = true as any;
    73│   processWindowCoordinator.completeOperation(showOpId);
    74│ }
    75│ 
    76│ export function moveToMouseScreenFlow(prompt: KitPrompt) {
    77│   if (prompt?.window?.isDestroyed()) {
    78│     prompt.logWarn('moveToMouseScreen. Window already destroyed', prompt?.id);
    79│     return;
    80│   }
    81│   const mouseScreen = getCurrentScreenFromMouse();
    82│   prompt.window.setPosition(mouseScreen.workArea.x, mouseScreen.workArea.y);
    83│ }
    84│ 
    85│ export function initBoundsFlow(prompt: KitPrompt, forceScriptPath?: string) {
    86│   if (prompt?.window?.isDestroyed()) {
    87│     prompt.logWarn('initBounds. Window already destroyed', prompt?.id);
    88│     return;
    89│   }
    90│   const bounds = prompt.window.getBounds();
    91│   const cacheKey = `${forceScriptPath || (prompt as any).scriptPath}::${(prompt as any).windowMode || 'panel'}`;
    92│   const cachedBounds = getCurrentScreenPromptCache(cacheKey, {
    93│     ui: (prompt as any).ui,
    94│     resize: (prompt as any).allowResize,
    95│     bounds: { width: bounds.width, height: bounds.height },
    96│   });
    97│   const currentBounds = prompt?.window?.getBounds();
    98│   prompt.logInfo(`${prompt.pid}:${path.basename((prompt as any)?.scriptPath || '')}: ↖ Init bounds: ${(prompt as any).ui} ui`, {
    99│     currentBounds,
   100│     cachedBounds,
   101│   });
   102│   const { x, y, width, height } = prompt.window.getBounds();
   103│   if (cachedBounds.width !== width || cachedBounds.height !== height) {
   104│     prompt.logVerbose(`Started resizing: ${prompt.window?.getSize()}. First prompt?: ${(prompt as any).firstPrompt ? 'true' : 'false'}`);
   105│     (prompt as any).resizing = true;
   106│   }
   107│   if ((prompt as any).promptData?.scriptlet) cachedBounds.height = (prompt as any).promptData?.inputHeight;
   108│   if (prompt?.window?.isFocused()) {
   109│     cachedBounds.x = x;
   110│     cachedBounds.y = y;
   111│   }
   112│   (prompt as any).setBounds(cachedBounds, 'initBounds');
   113│ }
   114│ 
   115│ export function blurPromptFlow(prompt: KitPrompt) {
   116│   prompt.logInfo(`${prompt.pid}: blurPrompt`);
   117│   if (prompt.window.isDestroyed()) return;
   118│   if (prompt.window) {
   119│     prompt.window.blur();
   120│   }
   121│ }
   122│ 
   123│ export function initMainBoundsFlow(prompt: KitPrompt) {
   124│   const cached = getCurrentScreenPromptCache(getMainScriptPath());
   125│   if (!cached.height || cached.height < PROMPT.HEIGHT.BASE) cached.height = PROMPT.HEIGHT.BASE;
   126│   (prompt as any).setBounds(cached as Partial<Rectangle>, 'initMainBounds');
   127│ }
   128│ 
   129│ 
   130│ 
</file>

<file path="src/main/prompt.visibility-utils.ts" matches="5" windows="1">
     1│ import type { KitPrompt } from './prompt';
     2│ import { visibilityController } from './visibility';
     3│ 
     4│ export function handleBlurVisibility(prompt: KitPrompt) {
     5│     visibilityController.handleBlur(prompt as any);
     6│ }
     7│ 
     8│ 
     9│ 
</file>

<file path="src/main/prompt.toggle-env.ts" matches="9" windows="1">
     1│ import type { KitPrompt } from './prompt';
     2│ 
     3│ export function togglePromptEnvFlow(prompt: KitPrompt, envName: string) {
     4│     prompt.logInfo(`Toggle prompt env: ${envName} to ${(require('./state').kitState as any).kenvEnv?.[envName]}`);
     5│     const { kitState } = require('./state');
     6│     if (process.env[envName]) {
     7│         delete process.env[envName];
     8│         delete kitState.kenvEnv?.[envName];
     9│         prompt.window?.webContents.executeJavaScript(`
    10│       if(!process) process = {};
    11│       if(!process.env) process.env = {};
    12│       if(process.env?.["${envName}"]) delete process.env["${envName}"]
    13│     `);
    14│     } else if (kitState.kenvEnv?.[envName]) {
    15│         process.env[envName] = kitState.kenvEnv?.[envName] as any;
    16│         prompt.window?.webContents.executeJavaScript(`
    17│       if(!process) process = {};
    18│       if(!process.env) process.env = {};
    19│       process.env["${envName}"] = "${kitState.kenvEnv?.[envName]}"
    20│     `);
    21│     }
</file>

<file path="src/main/prompt.state-utils.ts" matches="20" windows="2">
     1│ import type { PromptBounds } from '@johnlindquist/kit/types/core';
     2│ import { promptLog as log } from './logs';
     3│ import { promptState } from './state';
     4│ 
     5│ interface WritePromptStatePrompt {
     6│     window?: unknown;
     7│     isDestroyed: () => boolean;
     8│     kitSearch: {
     9│         input: string;
    10│         inputRegex?: RegExp;
    11│     };
    12│ }
    13│ 
    14│ export const writePromptState = (
    15│     prompt: WritePromptStatePrompt,
    16│     screenId: string,
    17│     scriptPath: string,
    18│     bounds: PromptBounds,
    19│ ): void => {
    20│     // Preserve original guard logic exactly (no behavior change)
    21│     if (!(prompt.window && prompt?.isDestroyed())) {
    22│         return;
    23│     }
    24│     if (prompt.kitSearch.input !== '' || prompt.kitSearch.inputRegex) {
    25│         return;
    26│     }
    27│     log.verbose('writePromptState', { screenId, scriptPath, bounds });
    28│ 
    29│     if (!promptState?.screens) {
    30│         (promptState as any).screens = {} as any;
    31│     }
    32│     if (!promptState?.screens[screenId]) {
    33│         (promptState as any).screens[screenId] = {} as any;
    34│     }
    35│ 
    36│     if (!bounds.height) {
    37│         return;
    38│     }

  ...
    43│         return;
    44│     }
    45│     if (!bounds.y) {
    46│         return;
    47│     }
    48│     (promptState as any).screens[screenId][scriptPath] = bounds;
    49│ };
    50│ 
    51│ 
    52│ 
</file>

<file path="src/main/prompt.set-prompt-data.ts" matches="136" windows="1">
     1│ import { Channel, UI } from '@johnlindquist/kit/core/enum';
     2│ import type { PromptData } from '@johnlindquist/kit/types/core';
     3│ import { debounce } from 'lodash-es';
     4│ import { getMainScriptPath } from '@johnlindquist/kit/core/utils';
     5│ import { AppChannel } from '../shared/enums';
     6│ import { kitState, preloadPromptDataMap } from './state';
     7│ import { setFlags } from './search';
     8│ import { createPty } from './pty';
     9│ import { applyPromptDataBounds } from './prompt.bounds-utils';
    10│ 
    11│ export const setPromptDataImpl = async (prompt: any, promptData: PromptData): Promise<void> => {
    12│   prompt.promptData = promptData;
    13│ 
    14│   const setPromptDataHandler = debounce(
    15│     (_x: unknown, { ui }: { ui: UI }) => {
    16│       prompt.logInfo(`${prompt.pid}: Received SET_PROMPT_DATA from renderer. ${ui} Ready!`);
    17│       prompt.refocusPrompt();
    18│     },
    19│     100,
    20│     {
    21│       leading: true,
    22│       trailing: false,
    23│     },
    24│   );
    25│ 
    26│   prompt.window.webContents.ipc.removeHandler(Channel.SET_PROMPT_DATA);
    27│   prompt.window.webContents.ipc.once(Channel.SET_PROMPT_DATA, setPromptDataHandler);
    28│ 
    29│   if (promptData.ui === UI.term) {
    30│     const termConfig = {
    31│       command: (promptData as any)?.command || '',
    32│       cwd: promptData.cwd || '',
    33│       shell: (promptData as any)?.shell || '',
    34│       promptId: prompt.id || '',
    35│       env: promptData.env || {},
    36│     };
    37│     prompt.sendToPrompt(AppChannel.SET_TERM_CONFIG, termConfig);
    38│     createPty(prompt);
    39│   }
    40│ 
    41│   prompt.scriptPath = promptData?.scriptPath;
    42│   prompt.clearFlagSearch();
    43│   prompt.kitSearch.shortcodes.clear();
    44│   prompt.kitSearch.triggers.clear();
    45│   if (promptData?.hint) {
    46│     for (const trigger of promptData?.hint?.match(/(?<=\[)\w+(?=\])/gi) || []) {
    47│       prompt.kitSearch.triggers.set(trigger, { name: trigger, value: trigger });
    48│     }
    49│   }
    50│ 
    51│   prompt.kitSearch.commandChars = promptData.inputCommandChars || [];
    52│   prompt.updateShortcodes();
    53│ 
    54│   if (prompt.cacheScriptPromptData && !promptData.preload) {
    55│     prompt.cacheScriptPromptData = false;
    56│     promptData.name ||= prompt.script.name || '';
    57│     promptData.description ||= prompt.script.description || '';
    58│     prompt.logInfo(`💝 Caching prompt data: ${prompt?.scriptPath}`);
    59│     preloadPromptDataMap.set(prompt.scriptPath, {
    60│       ...promptData,
    61│       input: promptData?.keyword ? '' : promptData?.input || '',
    62│       keyword: '',
    63│     });
    64│   }
    65│ 
    66│   if (promptData.flags && typeof promptData.flags === 'object') {
    67│     prompt.logInfo(`🏳️‍🌈 Setting flags from setPromptData: ${Object.keys(promptData.flags)}`);
    68│     setFlags(prompt, promptData.flags);
    69│   }
    70│ 
    71│   kitState.hiddenByUser = false;
    72│ 
    73│   if (typeof promptData?.alwaysOnTop === 'boolean') {
    74│     prompt.logInfo(`📌 setPromptAlwaysOnTop from promptData: ${promptData.alwaysOnTop ? 'true' : 'false'}`);
    75│     prompt.setPromptAlwaysOnTop(promptData.alwaysOnTop, true);
    76│   }
    77│ 
    78│   if (typeof promptData?.skipTaskbar === 'boolean') {
    79│     prompt.setSkipTaskbar(promptData.skipTaskbar);
    80│   }
    81│ 
    82│   prompt.allowResize = promptData?.resize;
    83│   kitState.shortcutsPaused = promptData.ui === UI.hotkey;
    84│ 
    85│   prompt.logVerbose(`setPromptData ${promptData.scriptPath}`);
    86│ 
    87│   prompt.id = promptData.id;
    88│   prompt.ui = promptData.ui;
    89│ 
    90│   if (prompt.kitSearch.keyword) {
    91│     promptData.keyword = prompt.kitSearch.keyword || prompt.kitSearch.keyword;
    92│   }
    93│ 
    94│   // Send user data BEFORE prompt data only if we haven't bootstrapped this prompt yet
    95│   const userSnapshot = (await import('valtio')).snapshot(kitState.user);
    96│   prompt.logInfo(`Early user data considered: ${userSnapshot?.login || 'not logged in'}`);
    97│   if (!(prompt as any).__userBootstrapped) {
    98│     prompt.sendToPrompt(AppChannel.USER_CHANGED, userSnapshot);
    99│     (prompt as any).__userBootstrapped = true;
   100│   }
   101│   
   102│   prompt.sendToPrompt(Channel.SET_PROMPT_DATA, promptData);
   103│ 
   104│   const isMainScript = getMainScriptPath() === promptData.scriptPath;
   105│ 
   106│   if (prompt.firstPrompt && !isMainScript) {
   107│     prompt.logInfo(`${prompt.pid} Before initBounds`);
   108│     prompt.initBounds();
   109│     prompt.logInfo(`${prompt.pid} After initBounds`);
   110│     prompt.logInfo(`${prompt.pid} Disabling firstPrompt`);
   111│     prompt.firstPrompt = false;
   112│   }
   113│ 
   114│   if (!isMainScript) {
   115│     applyPromptDataBounds(prompt.window, promptData);
   116│   }
   117│ 
   118│   if (kitState.hasSnippet) {
   119│     const timeout = prompt.script?.snippetdelay || 0;
   120│     await new Promise((r) => setTimeout(r, timeout));
   121│     kitState.hasSnippet = false;
   122│   }
   123│ 
   124│   const visible = prompt.isVisible();
   125│   prompt.logInfo(`${prompt.id}: visible ${visible ? 'true' : 'false'} 👀`);
   126│ 
   127│   const shouldShow = promptData?.show !== false;
   128│   if (!visible && shouldShow) {
   129│     prompt.logInfo(`${prompt.id}: Prompt not visible but should show`);
   130│     if (!prompt.firstPrompt) {
   131│       prompt.showPrompt();
   132│     } else {
   133│       prompt.showAfterNextResize = true;
   134│     }
   135│   } else if (visible && !shouldShow) {
   136│     prompt.actualHide();
   137│   }
   138│ 
   139│   if (!visible && promptData?.scriptPath.includes('.md#')) {
   140│     prompt.focusPrompt();
   141│   }
   142│ };
   143│ 
   144│ 
   145│ 
</file>

<file path="src/main/prompt.screen-utils.ts" matches="22" windows="3">
     1│ import { PROMPT, UI } from '@johnlindquist/kit/core/enum';
     2│ import type { PromptBounds } from '@johnlindquist/kit/types/core';
     3│ import type { Rectangle } from 'electron';
     4│ import { screen } from 'electron';
     5│ 
     6│ import { promptLog as log } from './logs';
     7│ import { OFFSCREEN_X, OFFSCREEN_Y } from './prompt.options';
     8│ import { getCurrentScreen, getCurrentScreenFromBounds, isBoundsWithinDisplayById, isBoundsWithinDisplays } from './screen';
     9│ import { promptState } from './state';
    10│ import { EMOJI_HEIGHT, EMOJI_WIDTH } from '../shared/defaults';
    11│ 
    12│ // Small, focused helpers for screen/display utilities used by prompts
    13│ 
    14│ export const getCurrentScreenFromMouse = () => {
    15│   return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    16│ };
    17│ 
    18│ export const getAllScreens = () => {
    19│   return screen.getAllDisplays();
    20│ };
    21│ 
    22│ export const getCurrentScreenPromptCache = (
    23│   scriptPath: string,
    24│   { ui, resize, bounds }: { ui: UI; resize: boolean; bounds: Partial<Rectangle> } = {
    25│     ui: UI.arg,
    26│     resize: false,
    27│     bounds: {},
    28│   },
    29│ ): Partial<Rectangle> & { screenId: string } => {
    30│   const currentScreen = getCurrentScreen();
    31│   const screenId = String(currentScreen.id);
    32│ 
    33│   const savedPromptBounds = promptState?.screens?.[screenId]?.[scriptPath];
    34│ 
    35│   if (savedPromptBounds) {
    36│     log.info(`📱 Screen: ${screenId}: `, savedPromptBounds);
    37│     log.info(`Bounds: found saved bounds for ${scriptPath}`);
    38│     return savedPromptBounds;
    39│   }
    40│ 
    41│   const { width: screenWidth, height: screenHeight, x: workX, y: workY } = currentScreen.workArea;
    42│ 
    43│   let width = PROMPT.WIDTH.BASE;
    44│   let height = PROMPT.HEIGHT.BASE;
    45│ 
    46│   if (ui !== UI.none && resize) {
    47│     if (ui === UI.emoji) {
    48│       width = EMOJI_WIDTH;
    49│       height = EMOJI_HEIGHT;

  ...
    54│     if (ui === UI.drop) {
    55│       height /= 2;
    56│     }
    57│     // editor/textarea minimums
    58│     if (ui === UI.editor || ui === UI.textarea) {
    59│       width = Math.max(width, PROMPT.WIDTH.BASE);
    60│       height = Math.max(height, PROMPT.HEIGHT.BASE);
    61│     }
    62│   }
    63│ 
    64│   if (typeof bounds?.width === 'number') width = bounds.width;
    65│   if (typeof bounds?.height === 'number') height = bounds.height;

  ...
    89│   if (typeof bounds?.y === 'number' && bounds.y !== OFFSCREEN_Y) {
    90│     log.info(`y is a number and not ${OFFSCREEN_Y}`);
    91│     y = bounds.y;
    92│   }
    93│ 
    94│   const promptBounds = { x, y, width, height, screenId };
    95│ 
    96│   if (ui === UI.arg) {
    97│     const rb = {
    98│       ...promptBounds,
    99│       width: PROMPT.WIDTH.BASE,
   100│       height: PROMPT.HEIGHT.BASE,
   101│       screenId,
   102│     };
   103│     log.verbose('Bounds: No UI', rb);
   104│     return rb;
   105│   }
   106│ 
   107│   log.info(`Bounds: No saved bounds for ${scriptPath}, returning default bounds`, promptBounds);
   108│   return promptBounds;
   109│ };
   110│ 
   111│ export const pointOnMouseScreen = ({ x, y }: { x: number; y: number }) => {
   112│   const mouseScreen = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
   113│   const onMouseScreen =
</file>

<file path="src/main/prompt.resize-utils.ts" matches="14" windows="3">
     1│ import { PROMPT, UI } from '@johnlindquist/kit/core/enum';
     2│ import type { Rectangle } from 'electron';
     3│ import type { ResizeData } from '../shared/types';
     4│ import { getMainScriptPath } from '@johnlindquist/kit/core/utils';
     5│ import { getCurrentScreenPromptCache } from './prompt.screen-utils';
     6│ 
     7│ const getDefaultWidth = () => PROMPT.WIDTH.BASE;
     8│ 
     9│ export function calculateTargetDimensions(
    10│     resizeData: ResizeData,
    11│     currentBounds: Rectangle,
    12│ ): Pick<Rectangle, 'width' | 'height'> {

  ...
    28│         totalChoices,
    29│     } = resizeData as ResizeData & { placeholderOnly?: boolean; totalChoices?: number };
    30│ 
    31│     const getCachedDimensions = (): Partial<Pick<Rectangle, 'width' | 'height'>> => {
    32│         if (!isMainScript) return {};
    33│         const cachedBounds = getCurrentScreenPromptCache(getMainScriptPath());
    34│         // Use cached height only when we're effectively in a placeholder state (no actionable content yet).
    35│         // When choices are present, prefer the measured target height so the window can shrink immediately.
    36│         const choicesCount = typeof totalChoices === 'number' ? totalChoices : 0;
    37│         const useCachedHeight = Boolean(placeholderOnly) || choicesCount === 0;
    38│         return {
    39│             width: cachedBounds?.width || getDefaultWidth(),
    40│             height: useCachedHeight ? (cachedBounds?.height || PROMPT.HEIGHT.BASE) : undefined,
    41│         };
    42│     };
    43│ 
    44│     const { width: cachedWidth, height: cachedHeight } = getCachedDimensions();
    45│ 
    46│     const maxHeight = Math.max(PROMPT.HEIGHT.BASE, currentBounds.height);
    47│     const targetHeight = topHeight + mainHeight + footerHeight;
    48│ 
    49│     let width = cachedWidth || forceWidth || currentBounds.width;
    50│     let height = cachedHeight || forceHeight || Math.round(targetHeight > maxHeight ? maxHeight : targetHeight);
    51│ 
    52│     if (isSplash) {
    53│         return {
    54│             width: PROMPT.WIDTH.BASE,
    55│             height: PROMPT.HEIGHT.BASE,
    56│         };
    57│     }
    58│ 
    59│     height = Math.round(height);
    60│     width = Math.round(width);
    61│ 
    62│     const heightLessThanBase = height < PROMPT.HEIGHT.BASE;
    63│ 
    64│     // Keep terminal/editor at least base height
    65│     if ([UI.term, UI.editor].includes(ui) && heightLessThanBase) {
    66│         height = PROMPT.HEIGHT.BASE;
    67│     }
    68│ 
    69│     // Main menu behavior:
    70│     // Allow shrinking below base when there are actionable choices (or any choices),
    71│     // and no placeholder-only state. This restores prior behavior where main could

  ...
    73│     if (isMainScript && heightLessThanBase) {
    74│         const choicesCount = typeof totalChoices === 'number' ? totalChoices : 0;
    75│         const isPlaceholder = Boolean(placeholderOnly);
    76│         const allowShrink = choicesCount > 0 && !isPlaceholder;
    77│         if (!allowShrink) {
    78│             height = PROMPT.HEIGHT.BASE;
    79│         }
    80│     }
    81│ 
    82│     if (hasPreview) {
    83│         if (!isMainScript) {
    84│             width = Math.max(getDefaultWidth(), width);
    85│         }
    86│         height = currentBounds.height < PROMPT.HEIGHT.BASE ? PROMPT.HEIGHT.BASE : currentBounds.height;
    87│     }
    88│ 
    89│     return { width, height };
    90│ }
    91│ 
</file>

<file path="src/main/prompt.resize-listeners.ts" matches="31" windows="1">
     1│ import { debounce } from 'lodash-es';
     2│ import type { KitPrompt } from './prompt';
     3│ import { Channel } from '@johnlindquist/kit/core/enum';
     4│ import { screen } from 'electron';
     5│ import { kitState } from './state';
     6│ 
     7│ export function setupResizeAndMoveListeners(prompt: KitPrompt) {
     8│     const onResized = () => {
     9│         prompt.logSilly('event: onResized');
    10│         prompt.modifiedByUser = false as any;
    11│         prompt.logInfo(`Resized: ${prompt.window.getSize()}`);
    12│         if ((prompt as any).resizing) (prompt as any).resizing = false;
    13│         prompt.saveCurrentPromptBounds();
    14│     };
    15│ 
    16│     if (kitState.isLinux) {
    17│         prompt.window.on('resize', () => {
    18│             (kitState as any).modifiedByUser = true;
    19│         });
    20│     } else {
    21│         prompt.window.on('will-resize', (_event, rect) => {
    22│             prompt.logSilly(`Will Resize ${rect.width} ${rect.height}`);
    23│             prompt.sendToPrompt(Channel.SET_PROMPT_BOUNDS, {
    24│                 id: (prompt as any).id,
    25│                 ...rect,
    26│                 human: true,
    27│             });
    28│             (prompt as any).modifiedByUser = true;
    29│         });
    30│     }
    31│ 
    32│     const willMoveHandler = debounce(
    33│         () => {
    34│             prompt.logSilly('event: will-move');
    35│             (kitState as any).modifiedByUser = true;
    36│         },
    37│         250,
    38│         { leading: true },
    39│     );
    40│ 
    41│     const onMoved = debounce(() => {
    42│         prompt.logSilly('event: onMove');
    43│         (prompt as any).modifiedByUser = false;
    44│         prompt.saveCurrentPromptBounds();
    45│     }, 250);
    46│ 
    47│     prompt.window.on('will-move', willMoveHandler);
    48│     prompt.window.on('resized', onResized);
    49│     prompt.window.on('moved', onMoved);
    50│ 
    51│     if (kitState.isWindows) {
    52│         const handler = (_e, display, changedMetrics) => {
    53│             if (changedMetrics.includes('scaleFactor')) {
    54│                 prompt.window.webContents.setZoomFactor(1 / display.scaleFactor);
    55│             }
    56│         };
    57│         screen.on('display-metrics-changed', handler);
    58│         prompt.window.webContents.setZoomFactor(1 / screen.getPrimaryDisplay().scaleFactor);
    59│         prompt.window.on('close', () => {
    60│             screen.removeListener('display-metrics-changed', handler);
    61│         });
    62│     }
    63│ }
    64│ 
</file>

<file path="src/main/prompt.process-monitor.ts" matches="48" windows="1">
     8│   } catch {
     9│     return false;
    10│   }
    11│ }
    12│ 
    13│ export function checkProcessAlive(prompt: any, force = false) {
    14│   if (!(prompt.pid && prompt.boundToProcess)) return;
    15│ 
    16│   if (!force && prompt.scriptStartTime && Date.now() - prompt.scriptStartTime < 2000) return;
    17│ 
    18│   prompt.lastProcessCheckTime = Date.now();
    19│ 
    20│   try {
    21│     process.kill(prompt.pid, 0);
    22│     if (prompt.processConnectionLost) {
    23│       prompt.logInfo?.(`Process ${prompt.pid} reconnected or was temporarily unavailable`);
    24│       prompt.processConnectionLost = false;
    25│     }
    26│   } catch {
    27│     if (!prompt.processConnectionLost) {
    28│       prompt.logInfo?.(`Process ${prompt.pid} is no longer running. Setting connection lost flag.`);
    29│       prompt.processConnectionLost = true;
    30│       // Notify user about the lost connection
    31│       prompt.notifyProcessConnectionLost?.();
    32│     }
    33│ 
    34│     setTimeout(() => {
    35│       if (prompt.processConnectionLost && prompt.boundToProcess) {
    36│         prompt.logInfo?.(`Auto-cleaning up disconnected prompt after timeout: PID ${prompt.pid}`);
    37│         // Inline logic similar to handleProcessGone minimal behavior
    38│         try {
    39│           processes.removeByPid(prompt.pid, 'process gone - prompt cleanup');
    40│         } catch { }
    41│         prompt.handleProcessGone?.();
    42│       }
    43│     }, 30000);
    44│   }
    45│ }
    46│ 
    47│ export function startProcessMonitoring(prompt: any) {
    48│   if (!prompt.processMonitoringEnabled || prompt.processMonitorTimer) return;
    49│ 
    50│   prompt.logInfo?.(`Starting process monitoring for PID ${prompt.pid} (checking every ${prompt.processCheckInterval}ms)`);
    51│   if (prompt.boundToProcess && prompt.pid) {
    52│     checkProcessAlive(prompt, true);
    53│     prompt.processMonitorTimer = setInterval(() => {
    54│       checkProcessAlive(prompt);
    55│     }, prompt.processCheckInterval);
    56│   }
    57│ }
    58│ 
    59│ export function stopProcessMonitoring(prompt: any) {
    60│   if (prompt.processMonitorTimer) {
    61│     clearInterval(prompt.processMonitorTimer);
    62│     prompt.processMonitorTimer = undefined;
    63│     prompt.logInfo?.(`Stopped process monitoring for PID ${prompt.pid}`);
    64│   }
    65│ }
    66│ 
    67│ export function listenForProcessExit(prompt: any) {
    68│   const processGoneHandler = (pid: number) => {
    69│     if (pid === prompt.pid) {
    70│       prompt.logInfo?.(`Received ProcessGone event for PID ${prompt.pid}`);
    71│       prompt.handleProcessGone?.();
    72│     }
    73│   };
    74│ 
    75│   emitter.on(KitEvent.ProcessGone, processGoneHandler);
    76│   prompt.window?.once('closed', () => {
    77│     emitter.off(KitEvent.ProcessGone, processGoneHandler);
    78│   });
    79│ }
    80│ 
    81│ 
</file>

<file path="src/main/prompt.process-connection.ts" matches="84" windows="1">
     1│ import { Notification } from 'electron';
     2│ import { AppChannel } from '../shared/enums';
     3│ import { sendToAllPrompts } from './channel';
     4│ import { buildProcessConnectionLostOptions, buildProcessDebugInfo } from './prompt.notifications';
     5│ import { shouldMonitorProcess, getProcessCheckInterval } from './prompt.process-utils';
     6│ import { startProcessMonitoring as monitorStart, stopProcessMonitoring as monitorStop, listenForProcessExit as monitorListen, checkProcessAlive as monitorCheck } from './prompt.process-monitor';
     7│ import { kitState } from './state';
     8│ import { processes } from './process';
     9│ 
    10│ export const notifyProcessConnectionLostImpl = (prompt: any): void => {
    11│     if (!prompt.scriptName || prompt.scriptName === 'unknown' || prompt.scriptName === 'script-not-set') {
    12│         prompt.logWarn(`Process connection lost for unknown script (PID: ${prompt.pid}) - skipping notification`);
    13│         return;
    14│     }
    15│     if (!prompt.scriptPath || prompt.scriptPath === '') {
    16│         prompt.logWarn(`Process connection lost for idle prompt (PID: ${prompt.pid}) - skipping notification`);
    17│         return;
    18│     }
    19│     prompt.logInfo(`Showing process connection lost notification for ${prompt.scriptName} (PID: ${prompt.pid})`);
    20│     const connectionLostOptions = buildProcessConnectionLostOptions(
    21│         prompt.scriptName,
    22│         prompt.pid,
    23│         process.platform === 'win32',
    24│     );
    25│     const notification = new Notification(connectionLostOptions);
    26│     notification.on('action', (_event, index) => {
    27│         if (index === 0) {
    28│             prompt.logInfo(`User chose to close disconnected prompt: ${prompt.scriptName}`);
    29│             prompt.close('user requested close after connection lost');
    30│         } else if (index === 1) {
    31│             prompt.logInfo(`User chose to keep disconnected prompt open: ${prompt.scriptName}`);
    32│         } else if (index === 2) {
    33│             prompt.logInfo(`User requested debug info for disconnected prompt: ${prompt.scriptName}`);
    34│             showProcessDebugInfoImpl(prompt);
    35│         }
    36│     });
    37│     notification.on('click', () => {
    38│         prompt.focusPrompt();
    39│     });
    40│     notification.show();
    41│ };
    42│ 
    43│ export const showProcessDebugInfoImpl = (prompt: any): void => {
    44│     const debugInfo = buildProcessDebugInfo({
    45│         promptId: prompt.id,
    46│         windowId: prompt.window?.id,
    47│         pid: prompt.pid,
    48│         scriptPath: prompt.scriptPath,
    49│         scriptName: prompt.scriptName,
    50│         boundToProcess: prompt.boundToProcess,
    51│         processConnectionLost: prompt.processConnectionLost,
    52│         lastProcessCheckTimeIso: new Date(prompt.lastProcessCheckTime).toISOString(),
    53│         timeSinceLastCheck: Date.now() - prompt.lastProcessCheckTime,
    54│         isVisible: prompt.isVisible(),
    55│         isFocused: prompt.isFocused(),
    56│         isDestroyed: prompt.isDestroyed(),
    57│     });
    58│     prompt.logInfo('Process Debug Info:', debugInfo);
    59│     sendToAllPrompts(AppChannel.DEBUG_INFO, {
    60│         type: 'process-connection-lost',
    61│         data: debugInfo,
    62│     });
    63│ };
    64│ 
    65│ export const startProcessMonitoringImpl = (prompt: any): void => {
    66│     if (!prompt.processMonitoringEnabled || prompt.processMonitorTimer) return;
    67│     if (!shouldMonitorProcess({ scriptPath: prompt.scriptPath, scriptName: prompt.scriptName, kenvEnv: kitState?.kenvEnv as any })) {
    68│         prompt.logInfo('Skipping process monitoring (disabled or no valid script)');
    69│         return;
    70│     }
    71│     prompt.processCheckInterval = getProcessCheckInterval(kitState?.kenvEnv as any, prompt.processCheckInterval);
    72│     monitorStart(prompt);
    73│ };
    74│ 
    75│ export const stopProcessMonitoringImpl = (prompt: any): void => {
    76│     monitorStop(prompt);
    77│ };
    78│ 
    79│ export const checkProcessAliveImpl = (prompt: any, force = false): void => {
    80│     prompt.lastProcessCheckTime = Date.now();
    81│     monitorCheck(prompt, force);
    82│ };
    83│ 
    84│ export const listenForProcessExitImpl = (prompt: any): void => {
    85│     monitorListen(prompt);
    86│ };
    87│ 
    88│ export const handleProcessGoneImpl = (prompt: any): void => {
    89│     if (!prompt.boundToProcess) return;
    90│     prompt.logInfo(`Process ${prompt.pid} is gone. Cleaning up prompt.`);
    91│     stopProcessMonitoringImpl(prompt);
    92│     prompt.clearLongRunningMonitor();
    93│     prompt.boundToProcess = false;
    94│     if (!prompt.isDestroyed()) {
    95│         prompt.close('ProcessGone - force close');
    96│         if (!(prompt.closed || prompt.isDestroyed())) {
    97│             prompt.hideInstant();
    98│             setTimeout(() => {
    99│                 if (!(prompt.closed || prompt.isDestroyed())) {
   100│                     prompt.close('ProcessGone - retry force close');
   101│                 }
   102│             }, 100);
   103│         }
   104│     }
   105│     processes.removeByPid(prompt.pid, 'process gone - prompt cleanup');
   106│     prompt.resetState();
   107│ };
   108│ 
   109│ 
   110│ 
</file>

<file path="src/main/prompt.notifications.ts" matches="7" windows="3">
    43│     pid: number,
    44│     isWindows: boolean,
    45│ ): NotificationConstructorOptions {
    46│     const connectionLostOptions: NotificationConstructorOptions = {
    47│         title: 'Script Process Connection Lost',
    48│         body: `"${scriptName}" (PID: ${pid}) is no longer responding. The prompt window is still open but disconnected from the process.`,
    49│         actions: [
    50│             { type: 'button', text: 'Close Prompt' },
    51│             { type: 'button', text: 'Keep Open' },
    52│             { type: 'button', text: 'Show Debug Info' },
    53│         ],
    54│         timeoutType: 'never',
    55│         urgency: 'normal',

  ...
    59│         connectionLostOptions.toastXml = `
    60│ <toast>
    61│   <visual>
    62│     <binding template="ToastGeneric">
    63│       <text>Script Process Connection Lost</text>
    64│       <text>"${scriptName}" (PID: ${pid}) is no longer responding. The prompt window is still open but disconnected from the process.</text>
    65│     </binding>
    66│   </visual>
    67│   <actions>
    68│     <action content="Close Prompt" arguments="action=close" />
    69│     <action content="Keep Open" arguments="action=keep" />
    70│     <action content="Show Debug Info" arguments="action=debug" />
    71│   </actions>
    72│ </toast>`;
    73│     }
    74│ 
    75│     return connectionLostOptions;
    76│ }
    77│ 
    78│ export function buildProcessDebugInfo(data: {
    79│     promptId: string;
    80│     windowId: number | undefined;
    81│     pid: number;
    82│     scriptPath: string;
    83│     scriptName: string;
    84│     boundToProcess: boolean;

  ...
    88│     isVisible: boolean;
    89│     isFocused: boolean;
    90│     isDestroyed: boolean;
    91│ }) {
    92│     return {
    93│         promptId: data.promptId,
    94│         windowId: data.windowId,
    95│         pid: data.pid,
    96│         scriptPath: data.scriptPath,
    97│         scriptName: data.scriptName,
    98│         boundToProcess: data.boundToProcess,
</file>

<file path="src/main/prompt.long-running.ts" matches="79" windows="2">
     1│ import type { KitPrompt } from './prompt';
     2│ import { UI } from '@johnlindquist/kit/core/enum';
     3│ import { Notification } from 'electron';
     4│ import { buildLongRunningNotificationOptions } from './prompt.notifications';
     5│ import { processes } from './process';
     6│ import { KitEvent, emitter } from '../shared/events';
     7│ import { kitState } from './state';
     8│ 
     9│ export function startLongRunningMonitorFlow(prompt: KitPrompt) {
    10│     // Clear any existing timer first to avoid duplicates
    11│     (prompt as any).clearLongRunningMonitor();
    12│ 
    13│     // Check for custom threshold from environment variables is handled in caller config
    14│ 
    15│     // Skip monitoring for main script or if disabled
    16│     if (
    17│         (prompt as any).isMainMenu ||
    18│         (kitState?.kenvEnv as any)?.KIT_DISABLE_LONG_RUNNING_MONITOR === 'true' ||
    19│         (prompt as any).script?.longRunning === true
    20│     ) {
    21│         (prompt as any).logInfo?.(`Skipping long-running monitor for ${(prompt as any).scriptName}`);
    22│         return;
    23│     }
    24│ 
    25│     if (!(prompt as any).scriptPath || (prompt as any).scriptPath === '' || !(prompt as any).scriptName || (prompt as any).scriptName === 'script-not-set') {
    26│         (prompt as any).logInfo?.('Skipping long-running monitor for idle prompt (no valid script)');
    27│         return;
    28│     }
    29│ 
    30│     if (!(prompt as any).scriptStartTime) (prompt as any).scriptStartTime = Date.now();
    31│     (prompt as any).hasShownLongRunningNotification = false;
    32│ 
    33│     (prompt as any).longRunningTimer = setTimeout(() => {
    34│         if (!((prompt as any).hasShownLongRunningNotification || prompt.window?.isDestroyed())) {
    35│             showLongRunningNotificationFlow(prompt);
    36│             (prompt as any).hasShownLongRunningNotification = true;
    37│         }
    38│     }, (prompt as any).longRunningThresholdMs);
    39│ 
    40│     (prompt as any).logInfo?.(`Started long-running monitor for ${(prompt as any).scriptName} (${(prompt as any).longRunningThresholdMs}ms)`);
    41│ }
    42│ 
    43│ export function clearLongRunningMonitorFlow(prompt: KitPrompt) {
    44│     const timer = (prompt as any).longRunningTimer as NodeJS.Timeout | undefined;
    45│     if (timer) {
    46│         clearTimeout(timer);
    47│         (prompt as any).longRunningTimer = undefined;
    48│         (prompt as any).logInfo?.(`Cleared long-running monitor for ${(prompt as any).scriptName}`);
    49│     }
    50│ }
    51│ 
    52│ export function showLongRunningNotificationFlow(prompt: KitPrompt) {
    53│     if (!(prompt as any).scriptStartTime) return;
    54│ 
    55│     if (!(prompt as any).scriptName || (prompt as any).scriptName === 'script-not-set' || !(prompt as any).scriptPath || (prompt as any).scriptPath === '') {
    56│         (prompt as any).logInfo?.(`Skipping long-running notification for idle prompt (PID: ${(prompt as any).pid})`);
    57│         return;
    58│     }
    59│ 
    60│     const runningTimeMs = Date.now() - (prompt as any).scriptStartTime;
    61│     const runningTimeSeconds = Math.floor(runningTimeMs / 1000);
    62│     const scriptName = (prompt as any).scriptName || 'Unknown Script';
    63│ 
    64│     let contextHint = '';
    65│     if ((prompt as any).ui === UI.term) contextHint = ' It appears to be running a terminal command.';
    66│     else if ((prompt as any).ui === UI.editor) contextHint = ' It appears to be in an editor session.';
    67│     else if ((prompt as any).promptData?.input?.includes('http')) contextHint = ' It might be making network requests.';
    68│     else if ((prompt as any).promptData?.input?.includes('file') || (prompt as any).promptData?.input?.includes('path')) contextHint = ' It might be processing files.';
    69│     else if ((prompt as any).ui === UI.arg && ((prompt as any).promptData as any)?.choices?.length === 0) contextHint = ' It might be waiting for user input.';
    70│ 
    71│     (prompt as any).logInfo?.(`Showing long-running notification for ${scriptName} (running for ${runningTimeSeconds}s)`);
    72│ 
    73│     const notificationOptions = buildLongRunningNotificationOptions(
    74│         scriptName,
    75│         runningTimeSeconds,
    76│         contextHint,

  ...
    79│ 
    80│     const notification = new Notification(notificationOptions);
    81│ 
    82│     notification.on('action', (_event, index) => {
    83│         if (index === 0) {
    84│             (prompt as any).logInfo?.(`User chose to terminate long-running script: ${scriptName}`);
    85│             terminateLongRunningScriptFlow(prompt);
    86│         } else if (index === 1) {
    87│             (prompt as any).logInfo?.(`User chose to keep running script: ${scriptName}`);
    88│             (prompt as any).hasShownLongRunningNotification = true;
    89│         } else if (index === 2) {
    90│             (prompt as any).logInfo?.(`User chose "don't ask again" for script: ${scriptName}`);
    91│             (prompt as any).hasShownLongRunningNotification = true;
    92│         }
    93│     });
    94│ 
    95│     notification.on('click', () => {
    96│         (prompt as any).logInfo?.(`Long-running notification clicked for: ${scriptName}`);
    97│         prompt.focusPrompt();
    98│     });
    99│ 
   100│     notification.on('close', () => {
   101│         (prompt as any).logInfo?.(`Long-running notification closed for: ${scriptName}`);
   102│         (prompt as any).hasShownLongRunningNotification = true;
   103│     });
   104│ 
   105│     notification.show();
   106│ }
   107│ 
   108│ export function terminateLongRunningScriptFlow(prompt: KitPrompt) {
   109│     (prompt as any).logInfo?.(`Terminating long-running script: ${(prompt as any).scriptName} (PID: ${(prompt as any).pid})`);
   110│     clearLongRunningMonitorFlow(prompt);
   111│     (prompt as any).hideInstant();
   112│     try { processes.removeByPid((prompt as any).pid, 'long-running script terminated by user'); } catch { }
   113│     emitter.emit(KitEvent.KillProcess, (prompt as any).pid);
   114│     const confirmNotification = new Notification({ title: 'Script Terminated', body: `"${(prompt as any).scriptName}" has been terminated.`, timeoutType: 'default' });
   115│     confirmNotification.show();
   116│ }
   117│ 
   118│ 
   119│ 
</file>

<file path="src/main/prompt.log-state.ts" matches="34" windows="1">
     1│ import { prompts } from './prompts';
     2│ import { promptLog as log } from './logs';
     3│ 
     4│ interface PromptState {
     5│     [key: string]: boolean;
     6│ }
     7│ 
     8│ let prevPromptState: PromptState = {} as any;
     9│ 
    10│ export function logPromptStateFlow() {
    11│     for (const prompt of prompts) {
    12│         const promptState: PromptState = {
    13│             isMinimized: prompt.window.isMinimized(),
    14│             isVisible: prompt.window.isVisible(),
    15│             isFocused: prompt.window.isFocused(),
    16│             isDestroyed: prompt.window.isDestroyed(),
    17│             isFullScreen: prompt.window.isFullScreen(),
    18│             isFullScreenable: prompt.window.isFullScreenable(),
    19│             isMaximizable: prompt.window.isMaximizable(),
    20│             isResizable: prompt.window.isResizable(),
    21│             isModal: prompt.window.isModal(),
    22│             isAlwaysOnTop: prompt.window.isAlwaysOnTop(),
    23│             isClosable: prompt.window.isClosable(),
    24│             isMovable: prompt.window.isMovable(),
    25│             isSimpleFullScreen: prompt.window.isSimpleFullScreen(),
    26│             isKiosk: prompt.window.isKiosk(),
    27│             isNormal: (prompt.window as any).isNormal?.(),
    28│             isVisibleOnAllWorkspaces: (prompt.window as any).isVisibleOnAllWorkspaces?.(),
    29│         };
    30│ 
    31│         const diff = Object.keys(promptState).reduce((acc: any, key) => {
    32│             if ((promptState as any)[key] !== (prevPromptState as any)[key]) {
    33│                 acc[key] = (promptState as any)[key];
    34│             }
    35│             return acc;
    36│         }, {} as any);
    37│ 
    38│         if (Object.keys(diff).length > 0) {
    39│             log.info(`\n  👙 Prompt State:`, JSON.stringify(diff, null, 2));
    40│             prevPromptState = promptState;
    41│         }
    42│     }
    43│ }
    44│ 
    45│ 
</file>

<file path="src/main/prompt.ipc-utils.ts" matches="25" windows="1">
     1│ import type { AppChannel } from '../shared/enums';
     2│ import type { Channel } from '@johnlindquist/kit/core/enum';
     3│ import type { KitPrompt } from './prompt';
     4│ import type { ChannelMap } from '@johnlindquist/kit/types/kitapp';
     5│ import { ipcMain } from 'electron';
     6│ 
     7│ export function pingPrompt(prompt: KitPrompt, channel: AppChannel, data?: any) {
     8│     prompt.logSilly(`sendToPrompt: ${String(channel)} ${data?.kitScript}`);
     9│     return new Promise((resolve) => {
    10│         if (prompt.window && !prompt.window.isDestroyed() && prompt.window?.webContents) {
    11│             ipcMain.once(channel as any, () => {
    12│                 prompt.logInfo(`🎤 ${channel} !!! <<<<`);
    13│                 resolve(true);
    14│             });
    15│             (prompt as any).sendToPrompt(channel as any as Channel, data);
    16│         }
    17│     });
    18│ }
    19│ 
    20│ export function getFromPrompt<K extends keyof ChannelMap>(
    21│     prompt: KitPrompt,
    22│     child: any,
    23│     channel: K,
    24│     data?: ChannelMap[K],
    25│ ) {
    26│     if (process.env.KIT_SILLY) {
    27│         prompt.logSilly(`sendToPrompt: ${String(channel)}`, data);
    28│     }
    29│     if (prompt.window && !prompt.window.isDestroyed() && prompt.window?.webContents) {
    30│         ipcMain.removeAllListeners(String(channel));
    31│         ipcMain.once(String(channel), (_event, { value }) => {
    32│             prompt.logSilly(`getFromPrompt: ${String(channel)}`, value);
    33│             try {
    34│                 if (child?.connected) {
    35│                     child.send({ channel, value });
    36│                 }
    37│             } catch (error) {
    38│                 prompt.logError('childSend error', error);
    39│             }
    40│         });
    41│         prompt.window?.webContents.send(String(channel), data);
    42│     }
    43│ }
    44│ 
    45│ 
    46│ 
</file>

<file path="src/main/prompt.init-utils.ts" matches="139" windows="4">
     1│ import type { KitPrompt } from './prompt';
     2│ import { Channel } from '@johnlindquist/kit/core/enum';
     3│ import { HideReason } from '../shared/enums';
     4│ import { getMainScriptPath } from '@johnlindquist/kit/core/utils';
     5│ import { kitState } from './state';
     6│ import { AppChannel } from '../shared/enums';

  ...
    10│ import path from 'node:path';
    11│ import { getVersion } from './version';
    12│ import { ipcMain, shell } from 'electron';
    13│ import { KitEvent, emitter } from '../shared/events';
    14│ import { processes } from './process';
    15│ import { cliFromParams, runPromptProcess } from './kit';
    16│ import { kitPath } from '@johnlindquist/kit/core/utils';
    17│ import { app, BrowserWindow } from 'electron';
    18│ import { fileURLToPath } from 'node:url';
    19│ import { getCachedAvatar } from './avatar-cache';
    20│ import { snapshot } from 'valtio';
    21│ 
    22│ export function setupDevtoolsHandlers(prompt: KitPrompt) {
    23│   prompt.window.webContents?.on('devtools-opened', () => {
    24│     prompt.devToolsOpening = false;
    25│     prompt.window.removeListener('blur', prompt.onBlur);
    26│     // Removed makeWindow() call - no longer needed
    27│     prompt.sendToPrompt(Channel.DEV_TOOLS, true);
    28│   });
    29│ 
    30│   prompt.window.webContents?.on('devtools-closed', () => {
    31│     prompt.logSilly('event: devtools-closed');
    32│ 
    33│     // Simplified logic - always set alwaysOnTop to false
    34│     prompt.setPromptAlwaysOnTop(false);
    35│ 
    36│     if (prompt.scriptPath !== getMainScriptPath()) {
    37│       prompt.maybeHide(HideReason.DevToolsClosed);
    38│     }
    39│ 
    40│     prompt.window.on('blur', prompt.onBlur);
    41│     prompt.sendToPrompt(Channel.DEV_TOOLS, false);
    42│   });
    43│ }
    44│ 
    45│ // NEW helper to bootstrap user data
    46│ async function sendBootstrapUser(prompt: KitPrompt) {
    47│   const u: any = kitState.user;
    48│   if (!u || typeof u.login !== 'string' || u.login.length === 0) {
    49│     return; // nothing to preload
    50│   }
    51│   let payload = { ...u };

  ...
    57│   } catch {
    58│     // ignore; fall back to whatever is in payload
    59│   }
    60│ 
    61│   try {
    62│     // Send directly to this prompt so it has the user before any other late messages
    63│     prompt.window?.webContents?.send(AppChannel.USER_CHANGED, payload);
    64│     (prompt as any).__userBootstrapped = true;
    65│     prompt.logInfo(`[Bootstrap] Sent user data: ${payload.login}`);
    66│     
    67│     // Also send sponsor status so the star shows immediately
    68│     prompt.window?.webContents?.send(AppChannel.KIT_STATE, { isSponsor: kitState.isSponsor });
    69│     prompt.logInfo(`[Bootstrap] Sent sponsor status: ${kitState.isSponsor}`);
    70│   } catch (e) {
    71│     // Swallow: window might be mid-teardown
    72│   }
    73│ }
    74│ 
    75│ export function setupDomAndFinishLoadHandlers(prompt: KitPrompt) {
    76│   prompt.window.webContents?.on('dom-ready', () => {
    77│     prompt.logInfo('📦 dom-ready');
    78│     prompt.window?.webContents?.setZoomLevel(0);
    79│     prompt.window.webContents?.on('before-input-event', prompt.beforeInputHandler as any);
    80│     // Bootstrap user data immediately
    81│     void sendBootstrapUser(prompt);
    82│   });
    83│ 
    84│   prompt.window.webContents?.once('did-finish-load', () => {
    85│     kitState.hiddenByUser = false;
    86│     prompt.logSilly('event: did-finish-load');
    87│     prompt.sendToPrompt(Channel.APP_CONFIG as any, {
    88│       delimiter: path.delimiter,
    89│       sep: path.sep,
    90│       os: os.platform(),
    91│       isMac: os.platform().startsWith('darwin'),
    92│       isWin: os.platform().startsWith('win'),

  ...
    98│       termFont: container.getConfig().getTerminalFont(),
    99│       url: kitState.url,
   100│     });
   101│ 
   102│     const user = snapshot(kitState.user);
   103│     prompt.logInfo(`did-finish-load, prompt user snapshot: ${user?.login}`);
   104│     // Avoid duplicate initial user payloads
   105│     if (!(prompt as any).__userBootstrapped) {
   106│       prompt.sendToPrompt(AppChannel.USER_CHANGED, user);
   107│       (prompt as any).__userBootstrapped = true;
   108│     }
   109│     prompt.sendToPrompt(AppChannel.KIT_STATE, { isSponsor: kitState.isSponsor });
   110│     emitter.emit(KitEvent.DID_FINISH_LOAD);
   111│ 
   112│     const messagesReadyHandler = async (_event, _pid) => {
   113│       if (!prompt.window || prompt.window.isDestroyed()) {
   114│         prompt.logError('📬 Messages ready. Prompt window is destroyed. Not initializing');
   115│         return;
   116│       }
   117│       prompt.logInfo('📬 Messages ready. ');
   118│       prompt.window.on('blur', prompt.onBlur);
   119│ 
   120│       if (prompt.initMain) prompt.initMainPrompt('messages ready');
   121│ 
   122│       prompt.readyEmitter.emit('ready');
   123│       prompt.ready = true;
   124│ 
   125│       prompt.logInfo(`🚀 Prompt ready. Forcing render. ${prompt.window?.isVisible() ? 'visible' : 'hidden'}`);
   126│       prompt.sendToPrompt(AppChannel.FORCE_RENDER, undefined);
   127│       await prompt.window?.webContents?.executeJavaScript('console.log(document.body.offsetHeight);');
   128│       await prompt.window?.webContents?.executeJavaScript('console.clear();');
   129│     };
   130│ 
   131│     ipcMain.once(AppChannel.MESSAGES_READY, messagesReadyHandler as any);
   132│ 
   133│     {
   134│       const cfg = container.getConfig();
   135│       const mic = cfg.getMicId();
   136│       const cam = cfg.getWebcamId();
   137│       if (mic) prompt.sendToPrompt(AppChannel.SET_MIC_ID, mic);
   138│       if (cam) prompt.sendToPrompt(AppChannel.SET_WEBCAM_ID, cam);
   139│     }
   140│   });
   141│ 
   142│   prompt.window.webContents?.on('did-fail-load', (errorCode, errorDescription, validatedURL, isMainFrame) => {
   143│     prompt.logError(`did-fail-load: ${errorCode} ${errorDescription} ${validatedURL} ${isMainFrame}`);
   144│   });
   145│ 
   146│   prompt.window.webContents?.on('did-stop-loading', () => {
   147│     prompt.logInfo('did-stop-loading');
   148│   });
   149│ 
   150│   prompt.window.webContents?.on('dom-ready', () => {
   151│     prompt.logInfo(`🍀 dom-ready on ${prompt?.scriptPath}`);
   152│     prompt.sendToPrompt(AppChannel.SET_READY, true);
   153│   });
   154│ 
   155│   prompt.window.webContents?.on('render-process-gone', (event, details) => {
   156│     try { processes.removeByPid(prompt.pid, 'prompt exit cleanup'); } catch { }
   157│     prompt.sendToPrompt = (() => { }) as any;
   158│     (prompt.window.webContents as any).send = () => { };
   159│     prompt.logError('🫣 Render process gone...');
   160│     prompt.logError({ event, details });
   161│   });
   162│ }
   163│ 
   164│ export function setupNavigationHandlers(prompt: KitPrompt) {
   165│   prompt.window.webContents?.on('will-navigate', async (event, navigationUrl) => {
   166│     try {
   167│       const url = new URL(navigationUrl);
   168│       prompt.logInfo(`👉 Prevent navigating to ${navigationUrl}`);
   169│       event.preventDefault();
   170│ 
   171│       const pathname = url.pathname.replace('//', '');
   172│ 
   173│       if (url.host === 'scriptkit.com' && url.pathname === '/api/new') {
   174│         await cliFromParams('new-from-protocol', url.searchParams);
   175│       } else if (url.host === 'scriptkit.com' && pathname === 'kenv') {
   176│         const repo = url.searchParams.get('repo');
   177│         await runPromptProcess(kitPath('cli', 'kenv-clone.js'), [repo || '']);
   178│       } else if (url.protocol === 'kit:') {
   179│         prompt.logInfo('Attempting to run kit protocol:', JSON.stringify(url));
   180│         await cliFromParams(url.pathname, url.searchParams);
   181│       } else if (url.protocol === 'submit:') {
   182│         prompt.logInfo('Attempting to run submit protocol:', JSON.stringify(url));
   183│         prompt.sendToPrompt(Channel.SET_SUBMIT_VALUE as any, url.pathname);
   184│       } else if (url.protocol.startsWith('http')) {
   185│         shell.openExternal(url.href);
   186│       }
   187│     } catch (e) {
   188│       prompt.logWarn(e);
   189│     }
   190│   });
   191│ 
   192│   prompt.window.webContents?.setWindowOpenHandler(({ url }) => {
   193│     prompt.logInfo(`Opening ${url}`);
   194│     if (!url.startsWith('http')) return { action: 'deny' } as any;
   195│     shell.openExternal(url);
   196│     return { action: 'deny' } as any;
   197│   });
   198│ }
   199│ 
   200│ export function loadPromptHtml(prompt: KitPrompt) {
   201│   prompt.logSilly('Loading prompt window html');
   202│   if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
   203│     prompt.window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/index.html`);
   204│   } else {
   205│     prompt.window.loadFile(fileURLToPath(new URL('../renderer/index.html', import.meta.url)));
   206│   }
   207│ }
   208│ 
   209│ export function setupWindowLifecycleHandlers(prompt: KitPrompt) {
   210│   prompt.window.webContents?.on('unresponsive', () => {
   211│     prompt.logError('Prompt window unresponsive. Reloading');
   212│     if (prompt.window.isDestroyed()) {
   213│       prompt.logError('Prompt window is destroyed. Not reloading');
   214│       return;
   215│     }
   216│     prompt.window.webContents?.once('did-finish-load', () => {
   217│       prompt.logInfo('Prompt window reloaded');
   218│     });
   219│     prompt.window.reload();
   220│   });
   221│ 
   222│   prompt.window.on('always-on-top-changed', () => prompt.logInfo('📌 always-on-top-changed'));
   223│   prompt.window.on('minimize', () => prompt.logInfo('📌 minimize'));
   224│   prompt.window.on('restore', () => prompt.logInfo('📌 restore'));
   225│   prompt.window.on('maximize', () => prompt.logInfo('📌 maximize'));
   226│   prompt.window.on('unmaximize', () => prompt.logInfo('📌 unmaximize'));
   227│   prompt.window.on('close', () => {
   228│     try { processes.removeByPid((prompt as any).pid, 'prompt destroy cleanup'); } catch { }
   229│     prompt.logInfo('📌 close');
   230│   });
   231│   prompt.window.on('closed', () => {
   232│     prompt.logInfo('📌 closed');
   233│     (kitState as any).emojiActive = false;
   234│   });
   235│   prompt.window.webContents?.on('focus', () => {
   236│     prompt.logInfo(' WebContents Focus');
   237│     (prompt as any).emojiActive = false;
   238│   });
   239│ }
   240│ 
</file>

<file path="src/main/prompt.init-main.ts" matches="35" windows="1">
     1│ import { AppChannel } from '../shared/enums';
     2│ import { Channel } from '@johnlindquist/kit/core/enum';
     3│ import { kitCache, kitState } from './state';
     4│ 
     5│ export const initMainChoicesImpl = (prompt: any): void => {
     6│   prompt.logInfo(`${prompt.pid}: Caching main scored choices: ${kitCache.choices.length}`);
     7│   prompt.logInfo('Most recent 3:', kitCache.choices.slice(1, 4).map((c) => c?.item?.name));
     8│   if (prompt.window && !prompt.window.isDestroyed()) {
     9│     prompt.sendToPrompt(AppChannel.SET_CACHED_MAIN_SCORED_CHOICES, kitCache.choices);
    10│   }
    11│ };
    12│ 
    13│ export const initMainPreviewImpl = (prompt: any): void => {
    14│   if (!prompt.window || prompt.window.isDestroyed()) {
    15│     prompt.logWarn('initMainPreview: Window is destroyed. Skipping sendToPrompt.');
    16│     return;
    17│   }
    18│   prompt.sendToPrompt(AppChannel.SET_CACHED_MAIN_PREVIEW, kitCache.preview);
    19│ };
    20│ 
    21│ export const initMainShortcutsImpl = (prompt: any): void => {
    22│   if (prompt.window && !prompt.window.isDestroyed()) {
    23│     prompt.sendToPrompt(AppChannel.SET_CACHED_MAIN_SHORTCUTS, kitCache.shortcuts);
    24│   }
    25│ };
    26│ 
    27│ export const initMainFlagsImpl = (prompt: any): void => {
    28│   if (prompt.window && !prompt.window.isDestroyed()) {
    29│     prompt.sendToPrompt(AppChannel.SET_CACHED_MAIN_SCRIPT_FLAGS, kitCache.scriptFlags);
    30│   }
    31│ };
    32│ 
    33│ export const initThemeImpl = (prompt: any): void => {
    34│   prompt.themeLogInfo(`${prompt.pid}: initTheme: ${kitState.themeName}`);
    35│   prompt.sendToPrompt(Channel.SET_THEME, kitState.theme);
    36│ };
    37│ 
    38│ export const initPromptImpl = (prompt: any): void => {
    39│   prompt.sendToPrompt(AppChannel.INIT_PROMPT, {});
    40│ };
    41│ 
    42│ 
    43│ 
</file>

<file path="src/main/prompt.hide-utils.ts" matches="28" windows="1">
     1│ import { HideReason } from '../shared/enums';
     2│ import { KitEvent, emitter } from '../shared/events';
     3│ import { kitState } from './state';
     4│ import { invokeSearch } from './search';
     5│ 
     6│ export const actualHideImpl = (prompt: any): void => {
     7│   if (!prompt?.window) return;
     8│   if (prompt.window.isDestroyed()) return;
     9│   if (kitState.emojiActive) {
    10│     kitState.emojiActive = false;
    11│   }
    12│   prompt.setPromptAlwaysOnTop(false);
    13│   if (!isVisibleImpl(prompt)) return;
    14│   prompt.logInfo('🙈 Hiding prompt window');
    15│   prompt.hideInstant();
    16│ };
    17│ 
    18│ export const isVisibleImpl = (prompt: any): boolean => {
    19│   if (!prompt.window) return false;
    20│   if (prompt.window.isDestroyed()) return false;
    21│   return Boolean(prompt.window?.isVisible());
    22│ };
    23│ 
    24│ export const maybeHideImpl = (prompt: any, reason: string): void => {
    25│   if (!(isVisibleImpl(prompt) && prompt.boundToProcess)) return;
    26│   prompt.logInfo(`Attempt Hide: ${reason}`);
    27│ 
    28│   if (reason === HideReason.NoScript || reason === HideReason.Escape || reason === HideReason.BeforeExit) {
    29│     actualHideImpl(prompt);
    30│     prompt.clearSearch();
    31│     invokeSearch(prompt, '', 'maybeHide, so clear');
    32│     return;
    33│   }
    34│ 
    35│   if (reason === HideReason.PingTimeout) {
    36│     prompt.logInfo('⛑ Attempting recover...');
    37│     emitter.emit(KitEvent.KillProcess, prompt.pid);
    38│     actualHideImpl(prompt);
    39│     prompt.reload();
    40│     return;
    41│   }
    42│ 
    43│   if (reason === HideReason.DebuggerClosed) {
    44│     actualHideImpl(prompt);
    45│     return;
    46│   }
    47│ 
    48│   if (prompt.window?.isVisible()) {
    49│     prompt.logInfo(`Hiding because ${reason}`);
    50│     if (!kitState.preventClose) {
    51│       actualHideImpl(prompt);
    52│     }
    53│   }
    54│ };
    55│ 
    56│ 
</file>

<file path="src/main/prompt.focus-utils.ts" matches="2" windows="1">
     4│         input.key === 'F12'
     5│     );
     6│ }
     7│ 
     8│ export function computeShouldCloseOnInitialEscape(
     9│     firstPrompt: boolean,
    10│     isMainMenu: boolean,
    11│     isEscape: boolean,
    12│     wasActionsJustOpen: boolean,
    13│ ) {
    14│     return (firstPrompt || isMainMenu) && isEscape && !wasActionsJustOpen;
    15│ }
    16│ 
    17│ 
    18│ 
</file>

<file path="src/main/prompt.cache.ts" matches="28" windows="1">
     1│ import type { PromptBounds } from '@johnlindquist/kit/types/core';
     2│ import type { Rectangle } from 'electron';
     3│ import { screen } from 'electron';
     4│ 
     5│ import { promptLog as log } from './logs';
     6│ import { prompts } from './prompts';
     7│ import { OFFSCREEN_X, OFFSCREEN_Y } from './prompt.options';
     8│ import { getCurrentScreen, getCurrentScreenFromBounds, isBoundsWithinDisplayById, isBoundsWithinDisplays } from './screen';
     9│ import {
    10│     kitState,
    11│     preloadChoicesMap,
    12│     preloadPreviewMap,
    13│     preloadPromptDataMap,
    14│     promptState,
    15│ } from './state';
    16│ 
    17│ export const writePromptState = (
    18│     prompt: { isDestroyed: () => boolean },
    19│     screenId: string,
    20│     scriptPath: string,
    21│     bounds: PromptBounds,
    22│ ) => {
    23│     if (!(prompt && prompt?.isDestroyed())) return;
    24│     // Only save when input is clear - enforced by caller
    25│     log.verbose('writePromptState', { screenId, scriptPath, bounds });
    26│ 
    27│     if (!promptState?.screens) promptState.screens = {} as any;
    28│     if (!promptState?.screens[screenId]) promptState.screens[screenId] = {} as any;
    29│ 
    30│     if (!bounds.height) return;
    31│     if (!bounds.width) return;
    32│     if (!bounds.x && bounds.x !== 0) return;
    33│     if (!bounds.y && bounds.y !== 0) return;
    34│ 
    35│     promptState.screens[screenId][scriptPath] = bounds;
    36│ };
    37│ 
    38│ export const clearPromptCache = async () => {
    39│     // Leave stale implementation as no-op to preserve external API
    40│ };
    41│ 
    42│ export const destroyPromptWindow = () => {
    43│     // Legacy no-op; left for API compatibility
    44│ };
    45│ 
    46│ export const clearPromptTimers = async () => {
    47│     // Timers are managed within KitPrompt; this is a safe no-op here
    48│ };
    49│ 
    50│ export const clearPromptCacheFor = async (scriptPath: string) => {
    51│     try {
    52│         const displays = screen.getAllDisplays();
    53│         for await (const display of displays) {
    54│             if (promptState?.screens?.[display.id]?.[scriptPath]) {
    55│                 delete promptState.screens[display.id][scriptPath];
    56│                 log.verbose(`🗑 Clear prompt cache for ${scriptPath} on ${display.id}`);
    57│             }
    58│         }
    59│     } catch (e) {
    60│         log.error(e);
    61│     }
    62│ 
    63│     if (preloadChoicesMap.has(scriptPath)) preloadChoicesMap.delete(scriptPath);
    64│     if (preloadPromptDataMap.has(scriptPath)) preloadPromptDataMap.delete(scriptPath);
    65│     if (preloadPreviewMap.has(scriptPath)) preloadPreviewMap.delete(scriptPath);
    66│ };
    67│ 
    68│ 
    69│ 
</file>

<file path="src/main/prompt.bounds-utils.ts" matches="9" windows="2">
     1│ import type { Rectangle, BrowserWindow } from 'electron';
     2│ import { PROMPT } from '@johnlindquist/kit/core/enum';
     3│ import { promptLog as log } from './logs';
     4│ import type { PromptData } from '@johnlindquist/kit/types/core';
     5│ 
     6│ export function adjustBoundsToAvoidOverlap(
     7│     peers: Array<{ id: string; bounds: Rectangle }>,
     8│     selfId: string,
     9│     target: Rectangle,

  ...
    51│     });
    52│     return titleBarHeight;
    53│ }
    54│ 
    55│ export function ensureMinWindowHeight(height: number, titleBarHeight: number): number {
    56│     if (height < PROMPT.INPUT.HEIGHT.XS + titleBarHeight) {
    57│         return PROMPT.INPUT.HEIGHT.XS + titleBarHeight;
    58│     }
    59│     return height;
    60│ }
    61│ 
    62│ export function applyPromptDataBounds(window: BrowserWindow, promptData: PromptData) {
    63│     const { x, y, width, height, ui } = promptData as any;
    64│ 
    65│     // Handle position
    66│     if (x !== undefined || y !== undefined) {
    67│         const [currentX, currentY] = window?.getPosition() || [];
    68│         if ((x !== undefined && x !== currentX) || (y !== undefined && y !== currentY)) {
</file>

<file path="src/main/prompt.bounds-apply.ts" matches="51" windows="3">
     1│ import { Channel } from '@johnlindquist/kit/core/enum';
     2│ import { AppChannel } from '../shared/enums';
     3│ import type { Rectangle } from 'electron';
     4│ import { getCurrentScreen, getCurrentScreenFromBounds, isBoundsWithinDisplayById } from './screen';
     5│ import { prompts } from './prompts';
     6│ import { kitState } from './state';
     7│ import { container } from './state/services/container';
     8│ import { adjustBoundsToAvoidOverlap, ensureMinWindowHeight, getTitleBarHeight } from './prompt.bounds-utils';
     9│ import { setPromptBounds as applyWindowBounds } from './prompt.window-utils';
    10│ 
    11│ export const applyPromptBounds = (prompt: any, bounds: Partial<Rectangle>, reason = ''): void => {
    12│   if (!prompt?.window || prompt.window.isDestroyed()) {
    13│     return;
    14│   }
    15│ 
    16│   prompt.logInfo(`${prompt.pid}: 🆒 Attempt ${prompt.scriptName}: setBounds reason: ${reason}`, bounds);
    17│   if (!kitState.ready) {
    18│     return;
    19│   }
    20│   const currentBounds = prompt.window.getBounds();
    21│   const widthNotChanged = bounds?.width && Math.abs((bounds.width as number) - currentBounds.width) < 4;
    22│   const heightNotChanged = bounds?.height && Math.abs((bounds.height as number) - currentBounds.height) < 4;
    23│   const xNotChanged = bounds?.x && Math.abs((bounds.x as number) - currentBounds.x) < 4;
    24│   const yNotChanged = bounds?.y && Math.abs((bounds.y as number) - currentBounds.y) < 4;
    25│ 
    26│   let sameXAndYAsAnotherPrompt = false;
    27│   for (const p of prompts) {
    28│     if (p?.window?.id === prompt.window?.id) continue;
    29│     if (p.getBounds().x === bounds.x && p.getBounds().y === bounds.y) {
    30│       if (p?.isFocused() && p?.isVisible()) {
    31│         prompt.logInfo(`🔀 Prompt ${p.id} has same x and y as ${prompt.id}. Scooching x and y!`);
    32│         sameXAndYAsAnotherPrompt = true;
    33│       }
    34│     }
    35│   }
    36│ 
    37│   const noChange =
    38│     heightNotChanged &&
    39│     widthNotChanged &&
    40│     xNotChanged &&
    41│     yNotChanged &&
    42│     !sameXAndYAsAnotherPrompt &&
    43│     !prompts.focused;
    44│ 
    45│   if (noChange) {
    46│     prompt.logInfo('📐 No change in bounds, ignoring', {
    47│       currentBounds,
    48│       bounds,
    49│     });
    50│     return;
    51│   }
    52│ 
    53│   prompt.sendToPrompt(Channel.SET_PROMPT_BOUNDS, {
    54│     id: prompt.id,
    55│     ...bounds,
    56│   });
    57│ 
    58│   const boundsScreen = getCurrentScreenFromBounds(prompt.window?.getBounds());
    59│   const mouseScreen = getCurrentScreen();
    60│   const boundsOnMouseScreen = isBoundsWithinDisplayById(bounds as Rectangle, mouseScreen.id);
    61│ 
    62│   prompt.logInfo(
    63│     `${prompt.pid}: boundsScreen.id ${boundsScreen.id} mouseScreen.id ${mouseScreen.id} boundsOnMouseScreen ${boundsOnMouseScreen ? 'true' : 'false'} isVisible: ${prompt.isVisible() ? 'true' : 'false'}`,
    64│   );
    65│ 
    66│   let currentScreen = boundsScreen;
    67│   if (boundsScreen.id !== mouseScreen.id && boundsOnMouseScreen) {
    68│     prompt.logInfo('🔀 Mouse screen is different, but bounds are within display. Using mouse screen.');
    69│     currentScreen = mouseScreen;
    70│   }
    71│ 
    72│   const { x, y, width, height } = { ...currentBounds, ...bounds } as Rectangle;
    73│   const { x: workX, y: workY } = currentScreen.workArea;

  ...
    81│   } as Rectangle;
    82│ 
    83│   const xIsNumber = typeof x === 'number';
    84│ 
    85│   if (!boundsOnMouseScreen) {
    86│     prompt.window.center();
    87│   }
    88│ 
    89│   if (xIsNumber && x < workX) {
    90│     newBounds.x = workX;
    91│   } else if (width && (xIsNumber ? x : currentBounds.x) + width > workX + screenWidth) {

  ...
   107│   if (height && (height as number) > screenHeight) {
   108│     newBounds.y = workY;
   109│     newBounds.height = screenHeight;
   110│   }
   111│ 
   112│   const prefWidth = container.getConfig().getPreferredPromptWidth();
   113│   if (prefWidth) newBounds.width = prefWidth;
   114│ 
   115│   prompt.logInfo(`${prompt.pid}: Apply ${prompt.scriptName}: setBounds reason: ${reason}`, newBounds);
   116│ 
   117│   const rounded = {
   118│     x: Math.round(newBounds.x),
   119│     y: Math.round(newBounds.y),
   120│     width: Math.round(newBounds.width),
   121│     height: Math.round(newBounds.height),
   122│   } as Rectangle;
   123│ 
   124│   const peers = Array.from(prompts).map((p) => ({ id: p.id, bounds: p.getBounds() }));
   125│   const finalBounds = adjustBoundsToAvoidOverlap(peers, prompt.id, rounded);
   126│ 
   127│   const titleBarHeight = getTitleBarHeight(prompt.window);
   128│   const minHeight = ensureMinWindowHeight(finalBounds.height, titleBarHeight);
   129│   if (minHeight !== finalBounds.height) {
   130│     prompt.logInfo('too small, setting to min height');
   131│     finalBounds.height = minHeight;
   132│   }
   133│ 
   134│   applyWindowBounds(prompt.window, prompt.id, finalBounds, prompt.sendToPrompt as any);
   135│   prompt.promptBounds = { id: prompt.id, ...prompt.window.getBounds() } as any;
   136│ 
   137│   try {
   138│     // Hint renderer to perform a single post-apply measurement if needed
   139│     prompt.sendToPrompt(AppChannel.TRIGGER_RESIZE, undefined);
   140│   } catch {}
   141│ };
   142│ 
</file>

<file path="src/main/notifications.ts" matches="2" windows="2">
    20│   });
    21│ 
    22│   if (notificationWindow && !notificationWindow.isDestroyed()) {
    23│     notificationWindow?.webContents.on('before-input-event', (_event: any, input) => {
    24│       if (input.key === 'Escape') {
    25│         hidePromptWindow();
    26│         notificationWindow?.webContents.send('escape', {});
    27│       }
    28│     });
    29│   }
    30│   return notificationWindow;

  ...
    68│   }
    69│ 
    70│   return notificationWindow;
    71│ };
    72│ 
    73│ export const hidePromptWindow = () => {
    74│   if (notificationWindow?.isVisible()) {
    75│     notificationWindow?.hide();
    76│   }
    77│ };
    78│ 
</file>

<file path="src/main/main-script.ts" matches="2" windows="1">
     1│ import { getMainScriptPath } from '@johnlindquist/kit/core/utils';
     2│ import { Trigger } from '../shared/enums';
     3│ import { runPromptProcess } from './kit';
     4│ 
     5│ export async function runMainScript() {
     6│   await runPromptProcess(getMainScriptPath(), [], {
     7│     force: true,
     8│     trigger: Trigger.Menu,
     9│     sponsorCheck: true,
    10│   });
    11│ }
</file>

<file path="src/main/logs.ts" matches="4" windows="3">
   103│     return fallbackLogger;
   104│   }
   105│ };
   106│ 
   107│ export const warn = (message: string): void => {
   108│   // TODO: Determine the appropriate prompt for warnings
   109│   log.warn(message);
   110│ };
   111│ 
   112│ log.transports.console.level = false;
   113│ 

  ...
   181│   "schedule",
   182│   "snippet",
   183│   "scriptlet",
   184│   "watcher",
   185│   "error",
   186│   "prompt",
   187│   "process",
   188│   "widget",
   189│   "theme",
   190│   "health",
   191│   "system",

  ...
   271│   scriptletLogPath,
   272│   watcherLog,
   273│   watcherLogPath,
   274│   errorLog,
   275│   errorLogPath,
   276│   promptLog,
   277│   promptLogPath,
   278│   processLog,
   279│   processLogPath,
   280│   widgetLog,
   281│   widgetLogPath,
   282│   themeLog,
</file>

<file path="src/main/info.ts" matches="1" windows="1">
     6│ 
     7│ // TODO: use in for TRUSTED KENVS
     8│ export const showInfo = debounce(
     9│   (name: string, description: string, markdown: string) => {
    10│     log.info(`${name} ${description} ${markdown}`);
    11│     emitter.emit(KitEvent.RunPromptProcess, {
    12│       scriptPath: kitPath('cli', 'info.js'),
    13│       args: [name, description, markdown],
    14│       options: {
    15│         force: true,
    16│         trigger: Trigger.Info,
</file>

<file path="src/main/handleScript.ts" matches="3" windows="3">
     1│ import { Channel } from '@johnlindquist/kit/core/enum';
     2│ import { parseScript, resolveToScriptPath } from '@johnlindquist/kit/core/utils';
     3│ import { Trigger } from '../shared/enums';
     4│ import { runPromptProcess } from './kit';
     5│ import { mcpLog as log } from './logs';
     6│ import { runMainScript } from './main-script';
     7│ import { spawnShebang } from './process';
     8│ import { getApiKey } from './server/server-utils';
     9│ 

  ...
    13│ /**
    14│  * Determines the launch context based on headers and flags
    15│  */
    16│ function determineLaunchContext(headers: Record<string, string>, mcpResponse: boolean): string {
    17│   // Check for MCP context
    18│   if (mcpResponse || headers['X-MCP-Tool'] || headers['X-MCP-Resource'] || headers['X-MCP-Prompt'] || headers['X-MCP-Parameters']) {
    19│     return 'mcp';
    20│   }
    21│   
    22│   // Check for socket context
    23│   if (headers['X-Kit-Socket']) {

  ...
    91│     return { status: 200, data: `🚗💨 ~/.kit/kar ${script} ${args.join(' ')}` };
    92│   }
    93│   // Determine the launch context for the script
    94│   const launchContext = determineLaunchContext(headers, mcpResponse);
    95│   
    96│   const processInfo = await runPromptProcess(
    97│     scriptPath,
    98│     args.map((s: string) => s.replaceAll('$newline$', '\n')).filter(Boolean),
    99│     { 
   100│       force: true, 
   101│       trigger: Trigger.Kar, 
</file>

<file path="src/main/error.ts" matches="1" windows="1">
    46│       message: error?.message || 'Unknown error message',
    47│       stack: error?.stack || 'Unknown error stack',
    48│     });
    49│   }
    50│   
    51│   emitter.emit(KitEvent.RunPromptProcess, {
    52│     scriptPath: kitPath('cli', 'info.js'),
    53│     args: [
    54│       `${error?.name || 'An unknown error'} has occurred...`,
    55│       'Caught Error',
    56│       `# ${error?.message || 'Unknown error message'} 😅
</file>

<file path="src/main/dock.ts" matches="7" windows="3">
     3│ import { debounce } from 'lodash-es';
     4│ import { getAssetPath } from '../shared/assets';
     5│ import { KitEvent, emitter } from '../shared/events';
     6│ import { widgetState } from '../shared/widget';
     7│ import { windowsState } from '../shared/windows';
     8│ import { prompts } from './prompts';
     9│ import { kitState, promptState } from './state';
    10│ import { container } from './state/services/container';
    11│ 
    12│ let hideIntervalId: NodeJS.Timeout | null = null;
    13│ 
    14│ export const hideDock = debounce(() => {

  ...
    22│     return;
    23│   }
    24│   if (windowsState.windows.length > 0) {
    25│     return;
    26│   }
    27│   if (prompts.isAnyPromptVisible()) {
    28│     return;
    29│   }
    30│   if (!kitState.dockShown) {
    31│     return;
    32│   }

  ...
    43│     return;
    44│   }
    45│   if (!kitState.isMac) {
    46│     return;
    47│   }
    48│   if (kitState.devToolsCount === 0 && !prompts.isAnyPromptVisible() && widgetState.widgets.length === 0) {
    49│     return;
    50│   }
    51│ 
    52│   if (!app?.dock.isVisible()) {
    53│     hideDock.cancel();
</file>

<file path="src/main/cache.ts" matches="3" windows="1">
     1│ import type { PromptData } from '@johnlindquist/kit/types/core';
     2│ import type { ScoredChoice } from '../shared/types';
     3│ 
     4│ export const preloadScoredChoicesMap = new Map<string, ScoredChoice[]>();
     5│ export const preloadPreviewMap = new Map<string, string>();
     6│ export const preloadPromptDataMap = new Map<string, PromptData>();
     7│ 
</file>

<file path="src/main/background.ts" matches="2" windows="2">
     1│ import type { Channel } from '@johnlindquist/kit/core/enum';
     2│ import type { Script } from '@johnlindquist/kit/types/core';
     3│ import type { SendData } from '@johnlindquist/kit/types/kitapp';
     4│ import { Trigger } from '../shared/enums';
     5│ import { KitEvent, emitter } from '../shared/events';
     6│ import { runPromptProcess } from './kit';
     7│ import { backgroundLog as log } from './logs';
     8│ import { processes } from './process';
     9│ import { type Background, backgroundMap, kitState } from './state';
    10│ 
    11│ export const removeBackground = (filePath: string) => {

  ...
    50│     child: null,
    51│     status: 'starting',
    52│   });
    53│   log.info('🌕 Starting background task set', backgroundMap.get(filePath));
    54│ 
    55│   const processInfo = await runPromptProcess(filePath, args, {
    56│     force: false,
    57│     trigger: Trigger.Background,
    58│     sponsorCheck: false,
    59│   });
    60│ 
</file>

<file path="src/renderer/state/index.ts" matches="7" windows="4">
     6│  */
     7│ 
     8│ // --- Core Atoms ---
     9│ export { isMainScriptAtom } from './shared-atoms';
    10│ export { openAtom } from './app-lifecycle';
    11│ export { promptDataAtom } from './prompt-data';
    12│ 
    13│ // --- Shared Atoms ---
    14│ export {
    15│   inputAtom,
    16│   _inputAtom,

  ...
    81│   enterAtom,
    82│   metaAtom,
    83│   focusedChoiceAtom,
    84│   previewHTMLAtom,
    85│   descriptionAtom,
    86│   promptBoundsAtom,
    87│   promptDataAtom,
    88│   _promptDataAtom,
    89│   isDropTargetAtom,
    90│   tempThemeAtom,
    91│   defaultChoiceIdAtom,
    92│   defaultValueAtom,
    93│   flaggedChoiceValueAtom,

  ...
   116│   scriptErrorAtom,
   117│   appearanceAtom,
   118│   toggleAppearanceAtom,
   119│   darkAtom,
   120│   appConfigAtom,
   121│   promptReadyAtom,
   122│   choicesReadyAtom,
   123│   escapeAtom,
   124│   closedDiv,
   125│   noChoice,
   126│   convertAtom,

  ...
   186│   scriptErrorAtom as scriptErrorStateAtom
   187│ } from './script-state';
   188│ 
   189│ // --- App Lifecycle ---
   190│ export {
   191│   resetPromptState,
   192│   closeAppAtom
   193│ } from './app-lifecycle';
   194│ 
   195│ // --- Controllers ---
   196│ export { ResizeController } from './controllers/ResizeController';
</file>

<file path="src/renderer/src/audio-hooks.ts" matches="1" windows="1">
   164│     }
   165│   };
   166│ 
   167│   const micMediaRecorder = useAtomValue(micMediaRecorderAtom);
   168│ 
   169│   // TODO: I'm hopeful one day to be able to cache the micMediaRecorder. But since each prompt operates in a separatel window, I'd have to isolate to a single window
   170│   const createRecorderRef = useCallback(() => {
   171│     log.info('🎙 createRecorderRef...', { micId });
   172│ 
   173│     // if (micMediaRecorder) {
   174│     //   log.info(`🎙 Using existing mic media recorder...`);
</file>

<file path="src/main/state/sponsor.ts" matches="1" windows="1">
    97│         log.error(`
    98│ -----------------------------------------------------------
    99│ 🚨 User attempted to use: ${feature}, but is not a sponsor.
   100│ -----------------------------------------------------------
   101│       `);
   102│         emitter.emit(events.KitEvent.RunPromptProcess, {
   103│           scriptPath: kitPath('pro', 'sponsor.js'),
   104│           args: [feature],
   105│           options: { force: true, trigger: Trigger.App, sponsorCheck: false },
   106│         });
   107│       }
</file>

<file path="src/main/pty/ipc-router.ts" matches="29" windows="5">
     1│ import { debounce } from 'lodash-es';
     2│ import { AppChannel } from '../../shared/enums';
     3│ import type { TermConfig } from '../../shared/types';
     4│ import { termLog } from '../logs';
     5│ import type { KitPrompt } from '../prompt';
     6│ import { ipcMain, type IpcMainEvent } from 'electron';
     7│ import { USE_BINARY, getDefaultArgs, getDefaultShell, getPtyOptions, getShellConfig } from '../pty-utils';
     8│ import { OutputAggregator } from './output';
     9│ import { PtyPool } from './pool';
    10│ import { KitEvent, emitter } from '../../shared/events';
    11│ import { displayError } from '../error';
    12│ import { TranscriptBuilder, type TermCapture } from '../transcript-builder';
    13│ 
    14│ export function registerTerminalIpc(prompt: KitPrompt, pool: PtyPool) {
    15│   let t: any = null;
    16│ 
    17│   // Capture config from promptData
    18│   const promptData = (prompt?.promptData as any) || {};
    19│   const capture = promptData?.capture;
    20│   const capOpts: TermCapture = capture === true ? { mode: 'full' } : capture ? (capture as TermCapture) : { mode: 'none' };
    21│   const tb = new TranscriptBuilder({
    22│     mode: capOpts.mode ?? 'full',
    23│     tailLines: capOpts.tailLines ?? 1000,
    24│     stripAnsi: capOpts.stripAnsi ?? true,

  ...
    31│   const resizeHandler = (_event: any, { cols, rows }: TermSize) => {
    32│     if (t) t.resize?.(cols, rows);
    33│   };
    34│ 
    35│   const inputHandler = (_event: any, data: { data: string; pid: number }) => {
    36│     if (data?.pid !== prompt?.pid) return;
    37│     try {
    38│       t?.write?.(data?.data);
    39│     } catch (error) {
    40│       termLog.error('Error writing to pty', error);
    41│     }

  ...
    63│     else t?.write(`${text}\r`);
    64│   };
    65│ 
    66│   const handleTermReady = async (_event: IpcMainEvent, config: TermConfig) => {
    67│     termLog.info({ termConfig: { command: config?.command || '<no command>', args: config?.args || '<no args>', cwd: config?.cwd || '<no cwd>', shell: config?.shell || '<no shell>' } });
    68│     if (!prompt) return;
    69│     if (config.pid !== prompt?.pid) return;
    70│ 
    71│     const termWrite = (text: string) => write(text);
    72│ 
    73│     const termKill = (pid: number) => {
    74│       termLog.verbose('TERM_KILL', { pid, configPid: prompt?.pid });
    75│       if (pid === prompt?.pid) {
    76│         ipcMain.off(AppChannel.TERM_EXIT, termExit);
    77│         teardown(t?.pid);
    78│       }
    79│     };
    80│ 
    81│     const termExit = (_: IpcMainEvent, c: TermConfig) => {
    82│       if (c.pid !== prompt?.pid) return;
    83│       // Return focus to input on explicit TERM_EXIT
    84│       try {
    85│         prompt?.sendToPrompt(AppChannel.TRIGGER_INPUT_FOCUS, true);
    86│       } catch {}
    87│       prompt?.sendToPrompt(AppChannel.TERM_CAPTURE_READY, { pid: prompt.pid, text: tb.result(), exitCode: 0 });
    88│       teardown(t?.pid);
    89│     };
    90│ 
    91│     ipcMain.once(AppChannel.TERM_EXIT, termExit);
    92│     termLog.info('🐲 >_ Handling TERM_KILL');

  ...
   104│ 
   105│     try {
   106│       t = pool.getIdlePty(shell, args, ptyOptions, config);
   107│       if ((t as any).bufferedData) {
   108│         (t as any).bufferedData.forEach((d: any) => {
   109│           prompt?.sendToPrompt(AppChannel.TERM_OUTPUT, d);
   110│         });
   111│       }
   112│     } catch (error) {
   113│       displayError(error as any);
   114│       teardown(t?.pid);
   115│       return;
   116│     }
   117│ 
   118│     prompt?.sendToPrompt(AppChannel.PTY_READY, {});
   119│     emitter.on(KitEvent.TermWrite, termWrite);
   120│ 
   121│     const aggregator = new OutputAggregator({
   122│       binary: USE_BINARY,
   123│       flushMs: 5,
   124│       onFlush: (payload) => prompt?.sendToPrompt(AppChannel.TERM_OUTPUT as any, payload),
   125│     });
   126│ 
   127│     const invokeCommandWhenSettled = debounce(() => {
   128│       termLog.silly(`Invoking command: ${config.command}`);
   129│       if (config.command && t) write(config.command);

  ...
   147│         try {
   148│           if (typeof config?.closeOnExit === 'boolean' && !config.closeOnExit) {
   149│             termLog.info('Process closed, but not closing pty because closeOnExit is false');
   150│           } else {
   151│             const captureResult = tb.result();
   152│             prompt?.sendToPrompt(AppChannel.TERM_CAPTURE_READY, { pid: prompt.pid, text: captureResult, exitCode });
   153│             teardown(t?.pid);
   154│             termLog.info('🐲 >_ Emit term process exited', config.pid);
   155│             emitter.emit(KitEvent.TermExited, config.pid);
   156│           }
   157│         } catch (error) {
</file>

<file path="src/renderer/src/state/ui-layout.ts" matches="2" windows="1">
     4│ 
     5│ import { atom } from 'jotai';
     6│ 
     7│ // Stub implementations - these need to be properly extracted from jotai.ts
     8│ export const resizeCompleteAtom = atom(false);
     9│ export const promptBoundsAtom = atom({});
    10│ export const promptBoundsDefault = {};
    11│ export const scrollToIndexAtom = atom((_g: any) => (_index: number) => {});
    12│ 
    13│ // Add other UI layout related atoms here
</file>

<file path="src/renderer/src/state/types.ts" matches="2" windows="2">
     1│ /**
     2│  * Common types used across the state management layer
     3│  */
     4│ 
     5│ import type { Channel } from '@johnlindquist/kit/core/enum';
     6│ import type { Choice, PromptData, Script } from '@johnlindquist/kit/types/core';
     7│ 
     8│ // Event types
     9│ export interface PasteEvent extends ClipboardEvent {
    10│   clipboardData: DataTransfer | null;
    11│ }

  ...
    65│   [key: string]: unknown;
    66│ }
    67│ 
    68│ // Term config types
    69│ export interface TermConfig {
    70│   promptId?: string;
    71│   command?: string;
    72│   cwd?: string;
    73│   env?: Record<string, string>;
    74│   [key: string]: unknown;
    75│ }
</file>

<file path="src/renderer/src/state/shared-dependencies.ts" matches="1" windows="1">
    22│   _inputAtom,
    23│   inputAtom,
    24│   _inputChangedAtom,
    25│   
    26│   // Core state atoms
    27│   promptActiveAtom,
    28│   submittedAtom,
    29│   processingAtom,
    30│   
    31│   // Editor atoms
    32│   editorAppendAtom,
</file>

<file path="src/renderer/src/state/reset.ts" matches="6" windows="2">
    13│   focusedFlagValueAtom,
    14│   focusedActionAtom,
    15│   loadingAtom,
    16│   progressAtom,
    17│   editorConfigAtom,
    18│   promptData,
    19│   pidAtom,
    20│   _chatMessagesAtom,
    21│   runningAtom,
    22│   _miniShortcutsHoveredAtom,
    23│   logLinesAtom,

  ...
    27│   termConfigAtom,
    28│   webcamStreamAtom,
    29│ } from './atoms';
    30│ import { ID_WEBCAM } from './dom-ids';
    31│ 
    32│ // Copy-only reset of prompt-related state used when closing the prompt.
    33│ // Keep order identical to the existing close branch; no behavior changes.
    34│ export function resetPromptState(g: Getter, s: Setter) {
    35│   s(resizeCompleteAtom, false);
    36│   s(lastScriptClosed, g(_script).filePath);
    37│   s(closedInput, g(_inputAtom)); // use _inputAtom instead of non-existent _promptDataInternal
    38│   s(_panelHTML, '');
    39│   s(formHTMLAtom, '');
    40│   s(logHTMLAtom, '');
    41│   s(flagsAtom, {} as any);
    42│   s(_flaggedValue, '' as any);
    43│   s(focusedFlagValueAtom, '' as any);
    44│   s(focusedActionAtom, {} as any);
    45│   s(loadingAtom, false);
    46│   s(progressAtom, 0);
    47│   s(editorConfigAtom, {} as any);
    48│   s(promptData, null as any);
    49│   s(pidAtom, 0);
    50│   s(_chatMessagesAtom, [] as any);
    51│   s(runningAtom, false);
    52│   s(_miniShortcutsHoveredAtom, false);
    53│   s(logLinesAtom, []);
</file>

<file path="src/renderer/src/state/prompt-data.ts" matches="11" windows="1">
     1│ // =================================================================================================
     2│ // Core data driving the prompt UI and behavior (PromptData and related atoms).
     3│ // =================================================================================================
     4│ 
     5│ import { Mode, UI } from '@johnlindquist/kit/core/enum';
     6│ import type { PromptData, Shortcut } from '@johnlindquist/kit/types/core';
     7│ import { atom } from 'jotai';
     8│ import { isEqual } from 'lodash-es';
     9│ import { createLogger } from '../log-utils';
    10│ 
    11│ 
    12│ const log = createLogger('prompt-data.ts');
    13│ 
    14│ export const promptData = atom<null | Partial<PromptData>>({
    15│   ui: UI.arg,
    16│   input: '',
    17│   footerClassName: 'hidden',
    18│   headerClassName: 'hidden',
    19│   containerClassName: '',
    20│   placeholder: 'Script Kit',
    21│ });
    22│ 
    23│ export const promptReadyAtom = atom(false);
    24│ 
    25│ // promptDataAtom is currently defined in jotai.ts with the full working implementation
    26│ // TODO: Move the working version here once we complete the refactoring
    27│ // This file contains other prompt-related atoms that are properly separated
    28│ 
    29│ export const modeAtom = atom((g) => g(promptData)?.mode || Mode.FILTER);
    30│ 
    31│ // --- UI Elements derived from PromptData ---
    32│ 
    33│ const _ui = atom<UI>(UI.arg);
    34│ export const uiAtom = atom(
    35│   (g) => g(_ui),
    36│   (_g, s, a: UI) => {
</file>

<file path="src/renderer/src/state/app-lifecycle.ts" matches="14" windows="3">
     1│ // =================================================================================================
     2│ // Application lifecycle management including openAtom setter and clearCacheAtom
     3│ // =================================================================================================
     4│ 
     5│ import { atom } from 'jotai';
     6│ import type { PromptData } from '@johnlindquist/kit/types/core';
     7│ import {
     8│   _open,
     9│   loadingAtom,
    10│   progressAtom,
    11│   pidAtom,
    12│   runningAtom,
    13│ } from './atoms/app-core';
    14│ import {
    15│   cachedMainPromptDataAtom,
    16│   cachedMainScoredChoicesAtom,
    17│   cachedMainPreviewAtom,
    18│   cachedMainShortcutsAtom,
    19│   cachedMainFlagsAtom,
    20│ } from './atoms/cache';
    21│ 
    22│ // Import from the real atom locations
    23│ import { mouseEnabledAtom } from './atoms/input';
    24│ import { resizeCompleteAtom, promptBoundsAtom, promptBoundsDefault } from './ui-layout';
    25│ import { lastScriptClosed, _script } from './atoms/script-state';
    26│ import { closedInput, _inputAtom } from './atoms/input';
    27│ import { _panelHTML } from './atoms/preview';
    28│ import { formHTMLAtom } from './atoms/form';
    29│ import { logHTMLAtom, logLinesAtom } from './atoms/log';
    30│ import { flagsAtom, _flaggedValue } from './atoms/actions';
    31│ import { editorConfigAtom } from './atoms/editor';
    32│ import { promptData } from './prompt-data';
    33│ // Import from facade for gradual migration
    34│ import { promptDataAtom } from './facade';
    35│ import { scrollToIndexAtom } from './ui-layout';
    36│ import { _chatMessagesAtom } from './atoms/chat';
    37│ import { miniShortcutsHoveredAtom } from './utils';
    38│ import { audioDotAtom, webcamStreamAtom } from './atoms/media';
    39│ import { disableSubmitAtom } from './atoms/ipc';

  ...
    61│       s(flagsAtom, {});
    62│       s(_flaggedValue, '');
    63│       s(loadingAtom, false);
    64│       s(progressAtom, 0);
    65│       s(editorConfigAtom, {});
    66│       s(promptData, null);
    67│       s(pidAtom, 0);
    68│       s(_chatMessagesAtom, []);
    69│       s(runningAtom, false);
    70│       s(miniShortcutsHoveredAtom, false);
    71│       s(logLinesAtom, []);
    72│       s(audioDotAtom, false);
    73│       s(disableSubmitAtom, false);
    74│       g(scrollToIndexAtom)(0);
    75│       s(termConfigAtom, {
    76│         promptId: '',
    77│         command: '',
    78│         cwd: '',
    79│         env: {},
    80│         args: [],
    81│         closeOnExit: true,

  ...
    96│     s(_open, a);
    97│   },
    98│ );
    99│ 
   100│ export const clearCacheAtom = atom(null, (_g, s) => {
   101│   s(cachedMainPromptDataAtom, {});
   102│   s(cachedMainScoredChoicesAtom, []);
   103│   s(cachedMainPreviewAtom, '');
   104│   s(cachedMainShortcutsAtom, []);
   105│   s(cachedMainFlagsAtom, {});
   106│   s(promptDataAtom, {} as PromptData);
   107│   s(scoredChoicesAtom, []);
   108│   s(promptBoundsAtom, promptBoundsDefault);
   109│ });
   110│ 
</file>

<file path="src/renderer/src/hooks/useShortcuts.ts" matches="50" windows="11">
    17│   hasRightShortcutAtom,
    18│   indexAtom,
    19│   inputAtom,
    20│   inputFocusAtom,
    21│   previewEnabledAtom,
    22│   promptDataAtom,
    23│   selectionStartAtom,
    24│   sendShortcutAtom,
    25│   shortcutsAtom,
    26│   submitValueAtom,
    27│   uiAtom,

  ...
   107│   const [, setFlag] = useAtom(focusedFlagValueAtom);
   108│   const [, submit] = useAtom(submitValueAtom);
   109│   const [selectionStart] = useAtom(selectionStartAtom);
   110│   const [inputFocus] = useAtom(inputFocusAtom);
   111│   const [channel] = useAtom(channelAtom);
   112│   const [promptData] = useAtom(promptDataAtom);
   113│   const [promptShortcuts] = useAtom(shortcutsAtom);
   114│   const [, sendShortcut] = useAtom(sendShortcutAtom);
   115│   const [ui] = useAtom(uiAtom);
   116│   const [previewEnabled, setPreviewEnabled] = useAtom(previewEnabledAtom);
   117│   const [, setActionsConfig] = useAtom(actionsConfigAtom);
   118│   const hasRightShortcut = useAtomValue(hasRightShortcutAtom);

  ...
   153│     }
   154│     log.info('All flag shortcuts', { shortcuts, flagsWithShortcuts });
   155│     return shortcuts;
   156│   }, [flagsWithShortcuts]);
   157│ 
   158│   const promptMap = useMemo(() => {
   159│     const m = new Map<string, any>();
   160│     for (const ps of promptShortcuts) {
   161│       if (ps?.key) {
   162│         const k = convertShortcutToHotkeysFormat(ps.key).toLowerCase();
   163│         m.set(k, ps);
   164│       }
   165│     }
   166│     return m;
   167│   }, [promptShortcuts]);
   168│ 
   169│   const flagByEvent = useCallback(
   170│     (evt: KeyboardEvent) => {
   171│       for (const [flag, value] of flagsWithShortcuts) {
   172│         if (value?.shortcut) {

  ...
   179│     },
   180│     [flagsWithShortcuts],
   181│   );
   182│ 
   183│   // Fallback: capture meta/ctrl shortcut keys at the document level to ensure reliability
   184│   // Guard: if we have prompt or flag shortcuts registered via useHotkeys, skip the fallback
   185│   useEffect(() => {
   186│     if ((promptShortcuts?.length || 0) > 0 || flagsWithShortcuts.length > 0) {
   187│       return; // useHotkeys will handle all configured shortcuts
   188│     }
   189│     const flagsMap = new Map<string, string>();
   190│     for (const [flag, value] of flagsWithShortcuts) {
   191│       if (value?.shortcut) {

  ...
   196│     const onKeyDown = (ev: KeyboardEvent) => {
   197│       // Only handle modifier shortcuts to avoid interfering with typing
   198│       if (!(ev.metaKey || ev.ctrlKey)) return;
   199│       const evKey = normalizeEventToKey(ev);
   200│ 
   201│       // Prompt-level shortcut takes precedence
   202│       const foundPrompt = promptMap.get(evKey);
   203│       if (foundPrompt) {
   204│         ev.preventDefault();
   205│         // Use same behavior as the prompt shortcut handler
   206│         if ((foundPrompt as any)?.hasAction) {
   207│           setFocusedAction(foundPrompt as any);
   208│           submit(focusedChoice?.value || input);
   209│           return;
   210│         }
   211│         if ((foundPrompt as any)?.flag) {
   212│           setFlag((foundPrompt as any).flag);
   213│           // Do not clear the flag here. The IPC outbox merges state at send time,
   214│           // and submitValueAtom will clear flags after sending.
   215│           submit(focusedChoice?.value || input);
   216│           return;
   217│         }
   218│         // Otherwise send as regular prompt shortcut
   219│         sendShortcut(foundPrompt.key);
   220│         return;
   221│       }
   222│ 
   223│       // Flag-level shortcut (if not shadowed by prompt shortcut)
   224│       const flag = flagsMap.get(evKey);
   225│       if (flag) {
   226│         ev.preventDefault();
   227│         // Normal flag behavior: set flag and submit current value
   228│         // Do not clear the flag here; submitValueAtom will clear it post-send.

  ...
   231│       }
   232│     };
   233│ 
   234│     document.addEventListener('keydown', onKeyDown, true);
   235│     return () => document.removeEventListener('keydown', onKeyDown, true);
   236│   }, [flagsWithShortcuts, promptMap, focusedChoice, input, setFocusedAction, setFlag, submit, promptShortcuts]);
   237│ 
   238│   // Prompt shortcuts should take precedence over flag shortcuts when keys collide
   239│   const promptConverted = useMemo(() => new Set(
   240│     (promptShortcuts || [])
   241│       .filter(ps => ps?.key)
   242│       .map(ps => convertShortcutToHotkeysFormat(ps.key))
   243│   ), [promptShortcuts]);
   244│ 
   245│   const filteredFlagShortcuts = useMemo(
   246│     () => flagShortcuts.filter(k => !promptConverted.has(k)),
   247│     [flagShortcuts, promptConverted]
   248│   );
   249│ 
   250│   const shortcutsToRegister = filteredFlagShortcuts.length > 0 ? filteredFlagShortcuts.join(',') : 'f19';
   251│   log.info('Registering flag shortcuts with useHotkeys', { shortcutsToRegister, flagShortcuts });
   252│ 

  ...
   310│     hotkeysOptions,
   311│     [flags, input, inputFocus, choices, index, overlayOpen, filteredFlagShortcuts, focusedChoice, setFocusedAction, setFlag, submit, flagByEvent],
   312│   );
   313│ 
   314│   const onShortcuts = useMemo(() => {
   315│     // Deduplicate and normalize prompt shortcuts, to avoid repeated keys breaking registration
   316│     const keys = Array.from(
   317│       new Set(
   318│         (promptShortcuts || [])
   319│           .filter(ps => ps?.key)
   320│           .map(ps => convertShortcutToHotkeysFormat(ps.key))
   321│       )
   322│     );
   323│     const result = keys.length > 0 ? keys.join(',') : 'f19';
   324│     log.info('On shortcuts', { result, promptShortcutsCount: promptShortcuts.length });
   325│     return result;
   326│   }, [promptShortcuts]);
   327│ 
   328│   useHotkeys(
   329│     onShortcuts,
   330│     (event, handler: HotkeysEvent) => {
   331│       console.log('[useShortcuts] Prompt shortcut triggered', {
   332│         key: handler?.keys?.[0],
   333│         onShortcuts,
   334│         promptShortcuts: promptShortcuts.map(s => ({ key: s.key, name: s.name }))
   335│       });
   336│       log.info('Prompt shortcut triggered', { event, handler, promptShortcuts });
   337│       event.preventDefault();
   338│ 
   339│       // A shortcut clears the active because a new one is incoming
   340│       setActionsConfig({
   341│         active: '',

  ...
   351│         log.info('Escape pressed while actions input is focused');
   352│         return;
   353│       }
   354│ 
   355│       const evKey = normalizeEventToKey(event as unknown as KeyboardEvent);
   356│       const found = promptMap.get(evKey);
   357│ 
   358│       console.log('[useShortcuts] Checking prompt shortcuts', {
   359│         key: handler?.keys?.[0],
   360│         found: found ? { key: found.key, name: (found as any).name, hasAction: (found as any).hasAction } : null,
   361│         allShortcuts: promptShortcuts.map(s => ({ key: s.key, name: (s as any).name }))
   362│       });
   363│ 
   364│       if (found) {
   365│         log.info('Matching prompt shortcut found', { shortcut: found });
   366│ 
   367│         // Check if this is an action with hasAction
   368│         if ((found as any)?.hasAction) {
   369│           console.log('[useShortcuts] Found action with hasAction, triggering', {
   370│             name: (found as any).name,

  ...
   382│           console.log('[useShortcuts] Sending regular shortcut', { key: found.key });
   383│           log.info('Sending shortcut', { key: found.key });
   384│           sendShortcut(found.key);
   385│         }
   386│       } else {
   387│         console.log('[useShortcuts] No matching prompt shortcut found');
   388│         log.info('No matching prompt shortcut found');
   389│       }
   390│     },
   391│     hotkeysOptions,
   392│     [overlayOpen, promptShortcuts, flagShortcuts, promptData, actionsInputFocus, setFocusedAction, submit, focusedChoice, input, setFlag, promptMap],
   393│   );
   394│ 
   395│   useHotkeys(
   396│     'right,left',
   397│     (event) => {

  ...
   425│       index,
   426│       selectionStart,
   427│       overlayOpen,
   428│       channel,
   429│       flagShortcuts,
   430│       promptShortcuts,
   431│       hasRightShortcut,
   432│     ],
   433│   );
   434│   useHotkeys(
   435│     'mod+k,mod+shift+p',

  ...
   450│         log.info('Opening actions overlay for input/ui', { input, ui });
   451│         openOverlay({ source: ui === UI.arg ? 'input' : 'ui', flag: (ui === UI.arg ? input : ui) as any });
   452│       }
   453│     },
   454│     hotkeysOptions,
   455│     [input, inputFocus, choices, index, selectionStart, overlayOpen, channel, flagShortcuts, promptShortcuts, ui, openOverlay, closeOverlay, focusedChoice],
   456│   );
   457│ };
   458│ 
</file>

<file path="src/renderer/src/hooks/useMessages.ts" matches="23" windows="9">
    41│   flaggedChoiceValueAtom,
    42│   flagsAtom,
    43│   footerAtom,
    44│   getEditorHistoryAtom,
    45│   hintAtom,
    46│   initPromptAtom,
    47│   inputAtom,
    48│   invalidateChoiceInputsAtom,
    49│   isHiddenAtom,
    50│   isReadyAtom,
    51│   isWindowAtom,

  ...
    65│   placeholderAtom,
    66│   preloadedAtom,
    67│   preventSubmitAtom,
    68│   previewHTMLAtom,
    69│   progressAtom,
    70│   promptBoundsAtom,
    71│   promptDataAtom,
    72│   resizingAtom,
    73│   runningAtom,
    74│   scoredChoicesAtom,
    75│   scoredFlagsAtom,
    76│   scriptAtom,

  ...
   133│ 
   134│   const setCss = useSetAtom(cssAtom);
   135│   const addChatMessage = useSetAtom(addChatMessageAtom);
   136│   const chatPushToken = useSetAtom(chatPushTokenAtom);
   137│   const setChatMessage = useSetAtom(setChatMessageAtom);
   138│   const setPromptBounds = useSetAtom(promptBoundsAtom);
   139│   const setMicStreamEnabled = useSetAtom(micStreamEnabledAtom);
   140│ 
   141│   const getEditorHistory = useSetAtom(getEditorHistoryAtom);
   142│   const getColor = useAtomValue(colorAtom);
   143│ 
   144│   const setExit = useSetAtom(exitAtom);
   145│   const [input, setInput] = useAtom(inputAtom);
   146│   const appendInput = useSetAtom(appendInputAtom);
   147│   const setPlaceholder = useSetAtom(placeholderAtom);
   148│   const [, setPromptData] = useAtom(promptDataAtom);
   149│   const [, setTheme] = useAtom(themeAtom);
   150│   const [, setTempTheme] = useAtom(tempThemeAtom);
   151│   const setSplashBody = useSetAtom(splashBodyAtom);
   152│   const setSplashHeader = useSetAtom(splashHeaderAtom);
   153│   const setSplashProgress = useSetAtom(splashProgressAtom);

  ...
   201│   const setPreloaded = useSetAtom(preloadedAtom);
   202│   const setTriggerKeyword = useSetAtom(triggerKeywordAtom);
   203│   const setCachedMainScoredChoices = useSetAtom(cachedMainScoredChoicesAtom);
   204│   const setCachedMainShortcuts = useSetAtom(cachedMainShortcutsAtom);
   205│   const setCachedMainFlags = useSetAtom(cachedMainFlagsAtom);
   206│   const initPrompt = useSetAtom(initPromptAtom);
   207│   const setCachedMainPreview = useSetAtom(cachedMainPreviewAtom);
   208│   const setTermFont = useSetAtom(termFontAtom);
   209│   const setBeforeInput = useSetAtom(beforeInputAtom);
   210│   const setKitConfig = useSetAtom(kitConfigAtom);
   211│   const setShortcodes = useSetAtom(shortcodesAtom);

  ...
   248│     [Channel.SET_PID]: (pid) => {
   249│       toast.dismiss();
   250│       setPid(pid);
   251│     },
   252│     [Channel.DEV_TOOLS]: setDevToolsOpen,
   253│     [Channel.SET_PROMPT_BOUNDS]: setPromptBounds,
   254│     [Channel.SET_SCRIPT]: setScript,
   255│     [Channel.SET_CHOICES_CONFIG]: setChoicesConfig,
   256│     [Channel.SET_SCORED_CHOICES]: (data) => {
   257│       setScoredChoices(data);
   258│       // Choices swap can change list height significantly; ensure we measure promptly
   259│       triggerResize('CHOICES');
   260│     },
   261│     [Channel.SET_SELECTED_CHOICES]: setSelectedChoices,
   262│     [Channel.TOGGLE_ALL_SELECTED_CHOICES]: toggleAllSelectedChoices,
   263│     [Channel.SET_SCORED_FLAGS]: setScoredFlags,

  ...
   293│     [Channel.SET_PROGRESS]: setProgress,
   294│     [Channel.SET_RUNNING]: setRunning,
   295│     [Channel.SET_NAME]: setName,
   296│     [Channel.SET_TEXTAREA_VALUE]: setTextareaValue,
   297│     [Channel.SET_OPEN]: setOpen,
   298│     [Channel.SET_PROMPT_BLURRED]: setBlur,
   299│     [Channel.SET_LOG]: appendLogLine,
   300│     [Channel.SET_LOGO]: setLogo,
   301│     [Channel.SET_PLACEHOLDER]: setPlaceholder,
   302│     [Channel.SET_ENTER]: setEnter,
   303│     [Channel.SET_READY]: setReady,

  ...
   305│     [Channel.SET_TAB_INDEX]: (idx) => {
   306│       setTabIndex(idx);
   307│       // Tabs can change visible content height; request a measurement
   308│       triggerResize('TABS');
   309│     },
   310│     [Channel.SET_PROMPT_DATA]: (data) => {
   311│       setPromptData(data);
   312│       triggerResize('UI');
   313│     },
   314│     [Channel.SET_SPLASH_BODY]: setSplashBody,
   315│     [Channel.SET_SPLASH_HEADER]: setSplashHeader,
   316│     [Channel.SET_SPLASH_PROGRESS]: setSplashProgress,

  ...
   611│ 
   612│     if (ipcRenderer.listenerCount(AppChannel.SET_CACHED_MAIN_SCRIPT_FLAGS) === 0) {
   613│       ipcRenderer.on(AppChannel.SET_CACHED_MAIN_SCRIPT_FLAGS, handleSetCachedMainFlags);
   614│     }
   615│ 
   616│     const handleInitPrompt = (_, _data) => {
   617│       log.info(`${pid}: Received init prompt message`);
   618│       initPrompt();
   619│     };
   620│ 
   621│     if (ipcRenderer.listenerCount(AppChannel.INIT_PROMPT) === 0) {
   622│       ipcRenderer.on(AppChannel.INIT_PROMPT, handleInitPrompt);
   623│     }
   624│ 
   625│     const handleSetTermFont = (_, data) => {
   626│       setTermFont(data);
   627│     };

  ...
   718│       ipcRenderer.off(AppChannel.SET_CACHED_MAIN_PREVIEW, handleSetCachedMainPreview);
   719│       // ipcRenderer.off(AppChannel.SET_BOUNDS, handleSetBounds);
   720│       ipcRenderer.off(AppChannel.SET_TERM_FONT, handleSetTermFont);
   721│       ipcRenderer.off(AppChannel.BEFORE_INPUT_EVENT, handleBeforeInputEvent);
   722│       ipcRenderer.off(AppChannel.CSS_CHANGED, handleCssChanged);
   723│       ipcRenderer.off(AppChannel.INIT_PROMPT, handleInitPrompt);
   724│       ipcRenderer.off(AppChannel.SET_CACHED_MAIN_SCRIPT_FLAGS, handleSetCachedMainFlags);
   725│       ipcRenderer.off(AppChannel.CLEAR_CACHE, handleClearCache);
   726│       ipcRenderer.off(AppChannel.FORCE_RENDER, handleForceRender);
   727│       ipcRenderer.off(AppChannel.MAKE_WINDOW, handleMakeWindow);
   728│     };
</file>

<file path="src/renderer/src/hooks/useFocus.ts" matches="4" windows="2">
     1│ import { useAtom } from 'jotai';
     2│ import { type RefObject, useEffect } from 'react';
     3│ import { devToolsOpenAtom, actionsOverlayOpenAtom, inputFocusAtom, isHiddenAtom, openAtom, processingAtom, promptDataAtom, scriptAtom, submittedAtom } from '../jotai';
     4│ import { createLogger } from '../log-utils';
     5│ 
     6│ const log = createLogger('useFocus');
     7│ 
     8│ export default (ref: RefObject<HTMLElement>) => {

  ...
    10│   const [submitted] = useAtom(submittedAtom);
    11│   const [open] = useAtom(openAtom);
    12│   const [inputFocus] = useAtom(inputFocusAtom);
    13│   const [processing] = useAtom(processingAtom);
    14│   const [script] = useAtom(scriptAtom);
    15│   const [promptData] = useAtom(promptDataAtom);
    16│   const [isHidden] = useAtom(isHiddenAtom);
    17│   const [devToolsOpen] = useAtom(devToolsOpenAtom);
    18│ 
    19│   useEffect(() => {
    20│     // Don't steal focus when DevTools are open
    21│     if (ref?.current && open && window?.pid && document.activeElement !== ref?.current && !devToolsOpen) {
    22│       log.info(`${window?.pid}: 🏆 Focusing`, ref?.current?.tagName, document.activeElement?.tagName);
    23│       ref?.current?.focus();
    24│     }
    25│   }, [overlayOpen, submitted, open, inputFocus, processing, script, isHidden, promptData, ref, ref?.current, devToolsOpen]);
    26│ 
    27│   // useEffect(() => {
    28│   //   const handleFocusIn = () => {
    29│   //     // ref?.current?.focus();
    30│   //   };
</file>

<file path="src/renderer/src/hooks/useEscape.ts" matches="6" windows="3">
     5│ import {
     6│   escapeAtom,
     7│   actionsOverlayOpenAtom,
     8│   closeActionsOverlayAtom,
     9│   isReadyAtom,
    10│   promptDataAtom,
    11│   runMainScriptAtom,
    12│   runningAtom,
    13│   scriptAtom,
    14│   shortcutsAtom,
    15│   uiAtom,

  ...
    27│ 
    28│   const [ui] = useAtom(uiAtom);
    29│   const [runMainScript] = useAtom(runMainScriptAtom);
    30│   const [shortcuts] = useAtom(shortcutsAtom);
    31│   const [script] = useAtom(scriptAtom);
    32│   const [promptData] = useAtom(promptDataAtom);
    33│   const [, setRunning] = useAtom(runningAtom);
    34│ 
    35│   useHotkeys(
    36│     'escape',
    37│     (_event) => {
    38│       log.info('Pressed escape!', {
    39│         script: script?.filePath,
    40│         promptData: promptData?.scriptPath,
    41│         overlayOpen,
    42│       });
    43│       if (shortcuts?.find((s) => s.key === 'escape') && !overlayOpen) {
    44│         log.info(`Ignoring escape because of shortcut ${shortcuts?.find((s) => s.key === 'escape')}`);
    45│         return;

  ...
    71│       keydown: true,
    72│       ignoreModifiers: true,
    73│       preventDefault: true,
    74│       scopes: 'global',
    75│     },
    76│     [overlayOpen, isReady, ui, runMainScript, shortcuts, promptData, script, closeOverlay],
    77│   );
    78│ };
    79│ 
</file>

<file path="src/renderer/src/hooks/useEnter.ts" matches="6" windows="4">
    17│   hasFocusedChoiceAtom,
    18│   indexAtom,
    19│   inputAtom,
    20│   invalidateChoiceInputsAtom,
    21│   panelHTMLAtom,
    22│   promptDataAtom,
    23│   submitValueAtom,
    24│   toggleSelectedChoiceAtom,
    25│   uiAtom,
    26│ } from '../jotai';
    27│ import { hotkeysOptions } from './shared';

  ...
    30│   const [choices] = useAtom(choicesAtom);
    31│   const scoredChoices = useAtomValue(scoredChoicesAtom);
    32│   const [input] = useAtom(inputAtom);
    33│   const [index, setIndex] = useAtom(indexAtom);
    34│   const [, submit] = useAtom(submitValueAtom);
    35│   const [promptData] = useAtom(promptDataAtom);
    36│   const [panelHTML] = useAtom(panelHTMLAtom);
    37│   const [, setFlag] = useAtom(focusedFlagValueAtom);
    38│   const overlayOpen = useAtomValue(actionsOverlayOpenAtom);
    39│   const [cmd] = useAtom(cmdAtom);
    40│   const [ui] = useAtom(uiAtom);

  ...
    95│         }
    96│         submit(choiceInputs);
    97│         return;
    98│       }
    99│ 
   100│       if (promptData?.multiple && !overlayOpen) {
   101│         toggleSelectedChoice(focusedChoice?.id as string);
   102│         return;
   103│       }
   104│ 
   105│       if (promptData?.strict && panelHTML?.length === 0) {
   106│         if (overlayOpen) {
   107│           // Overlay flow handled elsewhere
   108│         } else if (choices.length > 0 && hasFocusedChoice) {
   109│           // focusedChoiceAtom is now derived from index, always in sync
   110│           // No race condition possible - focusedChoice is always correct

  ...
   132│       focusedChoice,
   133│       overlayOpen,
   134│       choiceInputs,
   135│       setInvalidateChoiceInputs,
   136│       toggleSelectedChoice,
   137│       promptData,
   138│       choices,
   139│       hasFocusedChoice,
   140│       input,
   141│       ui,
   142│       enterButtonDisabled,
</file>

<file path="src/renderer/src/effects/termExit.ts" matches="3" windows="2">
     2│ import {
     3│   termExitAtom,
     4│   uiAtom,
     5│   submittedAtom,
     6│   termConfigAtom,
     7│   promptDataAtom,
     8│   termOutputAtom,
     9│   submitValueAtom,
    10│ } from '../jotai';
    11│ import { UI } from '@johnlindquist/kit/core/enum';
    12│ 

  ...
    18│   if (ui !== UI.term) return;
    19│ 
    20│   if (get(submittedAtom)) return;
    21│ 
    22│   const cfg = get(termConfigAtom);
    23│   const pd = get(promptDataAtom);
    24│   if (cfg.promptId !== pd?.id) return;
    25│ 
    26│   set(submitValueAtom, get(termOutputAtom));
    27│ 
    28│   // reset flag
    29│   set(termExitAtom, null);
</file>

<file path="src/renderer/src/effects/resize.ts" matches="7" windows="3">
     5│     topHeightAtom,
     6│     footerHiddenAtom,
     7│     previewHTMLAtom,
     8│     previewEnabledAtom,
     9│     uiAtom,
    10│     promptDataAtom, // Tracks changes to prompt properties like height, grid, mode
    11│     boundsAtom,
    12│     promptResizedByHumanAtom,
    13│     _mainHeight,
    14│     resizeTickAtom,
    15│     // CRITICAL: Add missing dependencies identified in the ResizeController logic:
    16│     logHTMLAtom,      // Log visibility/content affects height
    17│     scriptAtom,       // Script properties (e.g., 'log: false') affect layout

  ...
    34│     get(topHeightAtom);
    35│     get(footerHiddenAtom);
    36│     get(previewHTMLAtom);
    37│     get(previewEnabledAtom);
    38│     get(uiAtom);
    39│     get(promptDataAtom);
    40│     get(boundsAtom);
    41│     get(promptResizedByHumanAtom);
    42│     get(choicesReadyAtom);
    43│     get(scoredChoicesAtom);
    44│     get(choicesHeightAtom);
    45│     get(_panelHTML);
    46│ 

  ...
    58│       const next = v + 1;
    59│       try {
    60│         log.info('resize-effect: bump resizeTickAtom', {
    61│           next,
    62│           ui: get(uiAtom),
    63│           promptId: get(promptDataAtom)?.id,
    64│           choicesReady: get(choicesReadyAtom),
    65│           choicesHeight: get(choicesHeightAtom),
    66│           hasPanel: get(_panelHTML) !== '',
    67│         });
    68│       } catch {}
</file>

<file path="src/renderer/src/effects/focusPrompt.ts" matches="2" windows="1">
     1│ import { atomEffect } from 'jotai-effect';
     2│ import { inputFocusAtom, devToolsOpenAtom } from '../jotai';
     3│ import { AppChannel } from '../../../shared/enums';
     4│ 
     5│ export const focusPromptEffect = atomEffect((get) => {
     6│   // Observe inputFocusAtom for changes
     7│   get(inputFocusAtom);
     8│   
     9│   // Don't send focus request if DevTools are open
    10│   const devToolsOpen = get(devToolsOpenAtom);
    11│   if (!devToolsOpen) {
    12│     window.electron.ipcRenderer.send(AppChannel.FOCUS_PROMPT);
    13│   }
    14│ });
    15│ 
</file>

<file path="src/main/state/services/configuration.ts" matches="6" windows="2">
    15│   getDisplayId(): number | undefined;
    16│   /** Auto-start built-in server (KIT_AUTOSTART_SERVER == 'true'). */
    17│   isAutoStartServer(): boolean;
    18│   /** Open-at-login preference (KIT_OPEN_AT_LOGIN !== 'false'). */
    19│   isOpenAtLoginEnabled(): boolean;
    20│   /** Desired number of idle prompt processes (KIT_IDLE_PROCESSES). */
    21│   getIdleProcesses(): number;
    22│   /** Preferred microphone device id (KIT_MIC). */
    23│   getMicId(): string | undefined;
    24│   /** Preferred webcam device id (KIT_WEBCAM). */
    25│   getWebcamId(): string | undefined;
    26│   /** Prompt background color (KIT_BACKGROUND_COLOR). */
    27│   getBackgroundColor(): string | undefined;
    28│   /** Prompt background material (KIT_BACKGROUND_MATERIAL). */
    29│   getBackgroundMaterial(): string | undefined;
    30│   /** Preferred prompt width (KIT_WIDTH). */
    31│   getPreferredPromptWidth(): number | undefined;
    32│   /** Returns true if dock should be disabled (KIT_DOCK === 'false'). */
    33│   isDockDisabled(): boolean;
    34│   /** Terminal font for renderer/term (KIT_TERM_FONT or default 'monospace'). */
    35│   getTerminalFont(): string;
    36│   /** Theme path for light or dark mode (KIT_THEME_LIGHT/KIT_THEME_DARK). */

  ...
    99│ 
   100│   getBackgroundMaterial(): string | undefined {
   101│     return (kitState?.kenvEnv as any)?.KIT_BACKGROUND_MATERIAL || undefined;
   102│   }
   103│ 
   104│   getPreferredPromptWidth(): number | undefined {
   105│     const raw = (kitState?.kenvEnv as any)?.KIT_WIDTH;
   106│     if (!raw) return undefined;
   107│     const n = Number.parseInt(String(raw), 10);
   108│     return Number.isFinite(n) ? n : undefined;
   109│   }
</file>

<file path="src/renderer/src/state/services/resize.ts" matches="4" windows="2">
     1│ import { computeResize, type ComputeResizeInput, type ComputeResizeOutput } from '../resize/compute';
     2│ import { PROMPT } from '@johnlindquist/kit/core/enum';
     3│ 
     4│ export type ResizeResult = ComputeResizeOutput;
     5│ 
     6│ /**
     7│  * Pure service function that performs resize calculations.

  ...
    13│     ui: input.ui,
    14│     scoredChoicesLength: input.scoredChoicesLength,
    15│     choicesHeight: input.choicesHeight,
    16│     hasPanel: input.hasPanel,
    17│     hasPreview: input.hasPreview,
    18│     promptData: {
    19│       height: input.promptData?.height,
    20│       baseHeight: PROMPT.HEIGHT.BASE,
    21│     },
    22│     topHeight: input.topHeight,
    23│     footerHeight: input.footerHeight,
    24│     isWindow: input.isWindow,
    25│     justOpened: Boolean(input.justOpened),
</file>

<file path="src/renderer/src/state/selectors/resizeInputs.ts" matches="14" windows="3">
     1│ import { atom } from 'jotai';
     2│ import { _mainHeight, itemHeightAtom, choicesHeightAtom, prevMh, logHeightAtom, gridReadyAtom, isWindowAtom } from '../atoms/ui-elements';
     3│ import { promptActiveAtom, justOpenedAtom } from '../atoms/app-core';
     4│ import { promptResizedByHumanAtom, promptBoundsAtom } from '../atoms/bounds';
     5│ import { previewEnabledAtom, previewCheckAtom } from '../atoms/preview';
     6│ import { logHTMLAtom } from '../atoms/log';
     7│ import { _panelHTML } from '../atoms/preview';
     8│ import { _flaggedValue } from '../atoms/actions';
     9│ import { Mode } from '@johnlindquist/kit/core/enum';
    10│ import { ID_HEADER, ID_FOOTER, ID_LOG } from '../dom-ids';
    11│ // Import from facade for gradual migration
    12│ import { promptDataAtom, uiAtom, scoredChoicesAtom, scriptAtom } from '../../jotai';
    13│ 
    14│ /**
    15│  * Pure derived selector that gathers all inputs needed for resize calculation.
    16│  * This atom only READS other atoms; it performs no writes or side-effects.
    17│  */
    18│ export const resizeInputsAtom = atom((g) => {
    19│   const promptData = g(promptDataAtom);
    20│   const ui = g(uiAtom);
    21│   const scoredChoices = g(scoredChoicesAtom);
    22│   const scoredChoicesLength = scoredChoices?.length || 0;
    23│   
    24│   // Get DOM measurements - these will be moved to a controller later

  ...
    34│   const logVisible = logHTML?.length > 0 && script?.log !== false;
    35│   
    36│   return {
    37│     // Core state
    38│     ui,
    39│     promptData,
    40│     promptActive: g(promptActiveAtom),
    41│     promptResizedByHuman: g(promptResizedByHumanAtom),
    42│     promptBounds: g(promptBoundsAtom),
    43│     
    44│     // Choice state
    45│     scoredChoicesLength,
    46│     choicesHeight: g(choicesHeightAtom),
    47│     

  ...
    68│     // Grid state
    69│     gridActive: g(gridReadyAtom),
    70│     
    71│     // Other state
    72│     flaggedValue: g(_flaggedValue),
    73│     placeholderOnly: promptData?.mode === Mode.FILTER && scoredChoicesLength === 0 && ui === 'arg',
    74│   };
    75│ });
</file>

<file path="src/renderer/src/state/selectors/appState.ts" matches="2" windows="2">
    15│ import { 
    16│   focusedFlagValueAtom, 
    17│   indexAtom, 
    18│   uiAtom, 
    19│   previewHTMLAtom,
    20│   promptDataAtom,
    21│   focusedActionAtom,
    22│ } from '../../jotai';
    23│ import type { AppState, Choice } from '@johnlindquist/kit/types/core';
    24│ 
    25│ // --- START FIX: Initialization Safety ---

  ...
    73│       ui: g(uiAtom),
    74│       tabIndex: g(_tabIndex),
    75│       preview: g(previewHTMLAtom),
    76│       keyword: '',
    77│       mode: g(modeAtom),
    78│       multiple: g(promptDataAtom)?.multiple,
    79│       selected: g(selectedChoicesAtom)?.map((c) => c?.value) || [],
    80│       action: g(focusedActionAtom),
    81│     } as AppState;
    82│   } catch (error) {
    83│     console.error('Error in appStateLiteAtom:', error);
</file>

<file path="src/renderer/src/state/resize/compute.ts" matches="12" windows="2">
     5│   ui: UI;
     6│   scoredChoicesLength: number;
     7│   choicesHeight: number;
     8│   hasPanel: boolean;
     9│   hasPreview: boolean;
    10│   promptData: any;
    11│   topHeight: number;
    12│   footerHeight: number;
    13│   isWindow: boolean;
    14│   justOpened: boolean;
    15│   flaggedValue: any;

  ...
    33│   let mh = i.mainHeightCurrent;
    34│   let forceResize = false;
    35│   let forceHeight: number | undefined;
    36│ 
    37│   if (i.ui === UI.arg) {
    38│     if (i.promptData?.height && i.promptData.height > i.promptData?.baseHeight) {
    39│       // If a custom height is provided above base, compute mainHeight from it
    40│       const base = i.promptData.height;
    41│       mh = base - i.topHeight - i.footerHeight;
    42│     } else {
    43│       mh = i.choicesHeight;
    44│     }
    45│   }
    46│ 
    47│   if (mh === 0 && i.hasPanel) {
    48│     mh = Math.max(i.itemHeight, i.mainHeightCurrent);
    49│   }
    50│ 
    51│   if (i.hasPreview && mh < (i.promptData?.baseHeight || 0)) {
    52│     mh = Math.max(i.choicesHeight, i.promptData?.height || i.promptData?.baseHeight || mh);
    53│     forceResize = true;
    54│   }
    55│ 
    56│   if (i.logVisible) {
    57│     mh += i.logHeight || 0;
    58│   }
    59│ 
    60│   if (i.ui !== UI.arg) {
    61│     if (i.flaggedValue) {
    62│       forceHeight = Math.max(i.promptData?.height || 0, i.promptData?.baseHeight || 0) || undefined;
    63│     } else {
    64│       forceHeight = i.promptData?.height;
    65│     }
    66│   }
    67│ 
    68│   if (i.ui === UI.arg && i.flaggedValue) {
    69│     forceHeight = i.promptData?.baseHeight || undefined;
    70│   }
    71│ 
    72│   return {
    73│     mainHeight: mh,
    74│     forceHeight,
</file>

<file path="src/renderer/src/state/atoms/ui.ts" matches="11" windows="1">
     3│  * Manages the current UI mode and related states.
     4│  */
     5│ 
     6│ import { atom } from 'jotai';
     7│ import { UI, Mode } from '@johnlindquist/kit/core/enum';
     8│ import type { PromptData } from '@johnlindquist/kit/types/core';
     9│ 
    10│ // --- Core UI State ---
    11│ export const _ui = atom<UI>(UI.arg);
    12│ // export const uiAtom = atom((g) => g(_ui)); // Complex version with computed properties is in jotai.ts
    13│ export const setUiAtom = atom(null, (_g, s, a: UI) => {
    14│   s(_ui, a);
    15│ });
    16│ 
    17│ // --- Prompt Data ---
    18│ export const promptData = atom<null | Partial<PromptData>>({
    19│   ui: UI.arg,
    20│   input: '',
    21│   footerClassName: 'hidden',
    22│   headerClassName: 'hidden',
    23│   containerClassName: '',
    24│   placeholder: 'Script Kit',
    25│ });
    26│ 
    27│ // export const promptDataAtom = atom((g) => g(promptData)); // Complex version with computed properties is in jotai.ts
    28│ export const setPromptDataAtom = atom(null, (_g, s, a: null | Partial<PromptData>) => {
    29│   s(promptData, a);
    30│ });
    31│ 
    32│ export const promptReadyAtom = atom(false);
    33│ export const modeAtom = atom((g) => g(promptData)?.mode || Mode.FILTER);
    34│ 
    35│ // --- Show/Hide States ---
    36│ // showSelectedAtom defined in jotai.ts (derived atom)
    37│ // showTabsAtom defined in jotai.ts (derived atom)
    38│ 
</file>

<file path="src/renderer/src/state/atoms/ui-elements.ts" matches="5" windows="1">
     2│  * UI element state atoms.
     3│  * These atoms manage state for various UI components and their visibility.
     4│  */
     5│ 
     6│ import { atom } from 'jotai';
     7│ import { PROMPT } from '@johnlindquist/kit/core/enum';
     8│ 
     9│ // --- UI Element Visibility ---
    10│ export const headerHiddenAtom = atom(false);
    11│ export const footerHiddenAtom = atom(false);
    12│ 
    13│ // --- Component Heights ---
    14│ export const itemHeightAtom = atom(PROMPT.ITEM.HEIGHT.SM);
    15│ export const inputHeightAtom = atom(PROMPT.INPUT.HEIGHT.SM);
    16│ export const actionsItemHeightAtom = atom(PROMPT.ITEM.HEIGHT.SM);
    17│ export const actionsInputHeightAtom = atom(PROMPT.INPUT.HEIGHT.XS - 2);
    18│ export const choicesHeightAtom = atom(0);
    19│ export const flagsHeightAtom = atom(0);
    20│ // Internal primitive atom for mainHeight
    21│ export const _mainHeight = atom(0);
    22│ // A simple "please recompute resize" signal. Increment to trigger.
</file>

<file path="src/renderer/src/state/atoms/terminal.ts" matches="1" windows="1">
     9│ export const termConfigDefaults: TermConfig = {
    10│   command: '',
    11│   cwd: '',
    12│   env: {},
    13│   shell: '',
    14│   promptId: '',
    15│ };
    16│ 
    17│ const termConfig = atom<TermConfig>(termConfigDefaults);
    18│ export const termConfigAtom = atom(
    19│   (g) => g(termConfig),
</file>

<file path="src/renderer/src/state/atoms/preview.ts" matches="3" windows="2">
     4│  */
     5│ 
     6│ import { atom } from 'jotai';
     7│ import DOMPurify from 'dompurify';
     8│ import { closedDiv } from '../../../../shared/defaults';
     9│ import { promptData } from './ui';
    10│ import { _mainHeight } from './ui-elements';
    11│ import { loadingAtom, isHiddenAtom } from './app-core';
    12│ import { ID_PANEL, ID_LIST } from '../dom-ids';
    13│ 
    14│ // --- Preview HTML ---

  ...
    55│   (g, s, a: string) => {
    56│     if (g(_panelHTML) === a) return;
    57│ 
    58│     s(_panelHTML, a);
    59│ 
    60│     // If panel is set, ensure preview is closed unless explicitly defined in prompt data
    61│     if (!g(promptData)?.preview) {
    62│       s(_previewHTML, closedDiv);
    63│     }
    64│ 
    65│     // Adjust main height if the panel is cleared and no list is present
    66│     if (a === '' && document.getElementById(ID_PANEL) && !document.getElementById(ID_LIST)) {
</file>

<file path="src/renderer/src/state/atoms/lifecycle.ts" matches="1" windows="1">
    17│ //     
    18│ //     s(mouseEnabledAtom, 0);
    19│ //     
    20│ //     // TODO: Will add reset logic after all atoms are extracted
    21│ //     if (g(_open) && a === false) {
    22│ //       // resetPromptState will be added here
    23│ //     }
    24│ //     s(_open, a);
    25│ //   },
    26│ // ); // Complex version with computed properties is in jotai.ts
    27│ 
</file>

<file path="src/renderer/src/state/atoms/cache.ts" matches="3" windows="2">
     1│ /**
     2│  * Caching atoms for main script state.
     3│  * These atoms store cached data to improve performance when switching between scripts.
     4│  */
     5│ 
     6│ import type { PromptData, FlagsObject, Shortcut } from '@johnlindquist/kit/types/core';
     7│ import type { ScoredChoice } from '../../../../shared/types';
     8│ import { UI } from '@johnlindquist/kit/core/enum';
     9│ import { atom } from 'jotai';
    10│ 
    11│ export const cachedMainScoredChoices = atom<ScoredChoice[]>([]);

  ...
    14│   (_g, s, a: ScoredChoice[]) => {
    15│     s(cachedMainScoredChoices, a);
    16│   },
    17│ );
    18│ 
    19│ export const cachedMainPromptDataAtom = atom<Partial<PromptData>>({
    20│   ui: UI.arg,
    21│   input: '',
    22│   footerClassName: 'hidden',
    23│   headerClassName: 'hidden',
    24│   containerClassName: '',
</file>

<file path="src/renderer/src/state/atoms/bounds.ts" matches="29" windows="3">
     4│  */
     5│ 
     6│ import { atom } from 'jotai';
     7│ // Using Rectangle type from shared types to avoid electron import
     8│ type Rectangle = { x: number; y: number; width: number; height: number; };
     9│ import { PROMPT } from '@johnlindquist/kit/core/enum';
    10│ import { createLogger } from '../../log-utils';
    11│ import { itemHeightAtom, inputHeightAtom } from './ui-elements';
    12│ 
    13│ const log = createLogger('bounds.ts');
    14│ 

  ...
    19│   (_g, s, a: Rectangle) => {
    20│     s(_boundsAtom, a);
    21│   },
    22│ );
    23│ 
    24│ const promptBoundsDefault = {
    25│   id: '',
    26│   width: 0,
    27│   height: 0,
    28│   x: 0,
    29│   y: 0,
    30│ };
    31│ 
    32│ const _promptBoundsAtom = atom(promptBoundsDefault);
    33│ export const promptBoundsAtom = atom(
    34│   (g) => g(_promptBoundsAtom),
    35│   (
    36│     _g,
    37│     s,
    38│     a: {
    39│       id: string;

  ...
    43│       y: number;
    44│       human?: boolean;
    45│     },
    46│   ) => {
    47│     if (a?.human) {
    48│       log.info(`😙 Prompt resized by human: ${a.width}x${a.height}`);
    49│     }
    50│     s(_promptBoundsAtom, a);
    51│   },
    52│ );
    53│ 
    54│ export const appBoundsAtom = atom({
    55│   width: PROMPT.WIDTH.BASE,
    56│   height: PROMPT.HEIGHT.BASE,
    57│ });
    58│ 
    59│ // --- Resizing State ---
    60│ export const promptResizedByHumanAtom = atom(false);
    61│ export const resizingAtom = atom(false);
    62│ 
    63│ // --- Font Size Atoms (Dynamic based on heights) ---
    64│ export const actionsButtonNameFontSizeAtom = atom('text-sm');
    65│ export const actionsButtonDescriptionFontSizeAtom = atom('text-xs');
    66│ export const actionsInputFontSizeAtom = atom('text-lg');
    67│ 
    68│ export const buttonNameFontSizeAtom = atom((g) => {
    69│   const itemHeight = g(itemHeightAtom);
    70│   switch (itemHeight) {
    71│     case PROMPT.ITEM.HEIGHT.XXS: return 'text-xxs';
    72│     case PROMPT.ITEM.HEIGHT.XS: return 'text-xs';
    73│     case PROMPT.ITEM.HEIGHT.SM: return 'text-sm';
    74│     case PROMPT.ITEM.HEIGHT.BASE: return 'text-base';
    75│     case PROMPT.ITEM.HEIGHT.LG: return 'text-lg';
    76│     case PROMPT.ITEM.HEIGHT.XL: return 'text-xl';
    77│     default: return 'text-base';
    78│   }
    79│ });
    80│ 
    81│ export const buttonDescriptionFontSizeAtom = atom((g) => {
    82│   const itemHeight = g(itemHeightAtom);
    83│   switch (itemHeight) {
    84│     case PROMPT.ITEM.HEIGHT.XXS: return 'text-xxs';
    85│     case PROMPT.ITEM.HEIGHT.XS: return 'text-xxs';
    86│     case PROMPT.ITEM.HEIGHT.SM: return 'text-xs';
    87│     case PROMPT.ITEM.HEIGHT.BASE: return 'text-xs';
    88│     case PROMPT.ITEM.HEIGHT.LG: return 'text-sm';
    89│     case PROMPT.ITEM.HEIGHT.XL: return 'text-base';
    90│     default: return 'text-xs';
    91│   }
    92│ });
    93│ 
    94│ export const inputFontSizeAtom = atom((g) => {
    95│   const inputHeight = g(inputHeightAtom);
    96│   switch (inputHeight) {
    97│     case PROMPT.INPUT.HEIGHT.XXS: return 'text-sm';
    98│     case PROMPT.INPUT.HEIGHT.XS: return 'text-base';
    99│     case PROMPT.INPUT.HEIGHT.SM: return 'text-xl';
   100│     case PROMPT.INPUT.HEIGHT.BASE: return 'text-2xl';
   101│     case PROMPT.INPUT.HEIGHT.LG: return 'text-3xl';
   102│     case PROMPT.INPUT.HEIGHT.XL: return 'text-4xl';
   103│     default: return 'text-2xl';
   104│   }
   105│ });
</file>

<file path="src/renderer/src/state/atoms/app-core.ts" matches="2" windows="2">
    29│ export const userAtom = atom<Partial<UserDb>>({});
    30│ 
    31│ export const _kitStateAtom = atom({
    32│   isSponsor: false,
    33│   updateDownloaded: false,
    34│   promptCount: 0,
    35│   noPreview: false,
    36│   isMac: false,
    37│ });
    38│ 
    39│ export const kitStateAtom = atom(

  ...
    80│ export const progressAtom = atom(0);
    81│ 
    82│ // --- Application Lifecycle and Visibility ---
    83│ 
    84│ export const isHiddenAtom = atom(false);
    85│ export const promptActiveAtom = atom(false);
    86│ export const justOpenedAtom = atom(false);
    87│ 
    88│ const isReady = atom(true); // Used primarily for the Splash screen
    89│ export const isReadyAtom = atom(
    90│   (g) => g(isReady),
</file>

<file path="src/renderer/src/state/atoms/actions.ts" matches="5" windows="3">
    11│ import { createLogger } from '../../log-utils';
    12│ import { scrollRequestAtom } from '../scroll';
    13│ import { actionsItemHeightAtom, flagsHeightAtom } from './ui-elements';
    14│ import { calcVirtualListHeight } from '../utils';
    15│ import { MAX_VLIST_HEIGHT } from '../constants';
    16│ import { promptData } from './ui';
    17│ import { pidAtom } from './app-core';
    18│ 
    19│ const log = createLogger('actions.ts');
    20│ 
    21│ type ScopedFlagState = {

  ...
    23│   value: string;
    24│   version: number;
    25│ };
    26│ 
    27│ const getFlagSessionKey = (g: Getter) => {
    28│   const promptId = g(promptData)?.id ?? '';
    29│   const pid = g(pidAtom) ?? 0;
    30│   return `${promptId}::${pid}`;
    31│ };
    32│ 
    33│ const emptyFlagState: ScopedFlagState = { sessionKey: '', value: '', version: 0 };
    34│ 
    35│ const _consumedFlagState = atom<{ sessionKey: string; version: number }>({

  ...
   203│     // 3) Set the index AND focused atoms (mimics flagsIndexAtom setter behavior)
   204│     const firstChoice = filtered[firstActionable]?.item;
   205│     s(flagsIndex, firstActionable);
   206│ 
   207│     // Only update focused flag/action if the overlay is open
   208│     // This prevents the "Actions" button from highlighting when promptDataAtom resets the input
   209│     if (g(actionsOverlayOpenAtom)) {
   210│       // Set focused flag and action
   211│       const focusedFlag = (firstChoice as Choice)?.value;
   212│       s(focusedFlagValueAtom, focusedFlag);
   213│ 
</file>

</files>