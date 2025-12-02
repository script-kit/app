#!/usr/bin/env node

// Script to migrate imports from state/atoms barrel to direct imports
import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';

const DRY_RUN = process.argv.includes('--dry');

// Map of atom names to their source files
// Built by analyzing the state/atoms/index.ts file
const atomToFile = {
  // app-core
  appStateAtom: 'app-core',
  pidAtom: 'app-core',
  valueAtom: 'app-core',
  kitStateAtom: 'app-core',
  tempValueAtom: 'app-core',
  kitAPIAtom: 'app-core',
  promptDataAtom: 'app-core',
  processesAtom: 'app-core',
  userAtom: 'app-core',

  // lifecycle
  appReadyAtom: 'lifecycle',
  openAtom: 'lifecycle',
  exitAtom: 'lifecycle',

  // script-state
  scriptAtom: 'script-state',
  submittedAtom: 'script-state',
  preventSubmitAtom: 'script-state',
  inputWhileSubmittedAtom: 'script-state',

  // shared-atoms
  isMainScriptAtom: '../shared-atoms',

  // cache
  cacheAtom: 'cache',

  // ui-elements
  darkModeAtom: 'ui-elements',
  submitValueAtom: 'ui-elements',
  panelHTMLAtom: 'ui-elements',
  logHTMLAtom: 'ui-elements',
  cssAtom: 'ui-elements',
  hintAtom: 'ui-elements',
  loadingAtom: 'ui-elements',
  progressAtom: 'ui-elements',
  placeholderAtom: 'ui-elements',
  footerHiddenAtom: 'ui-elements',
  headerHiddenAtom: 'ui-elements',
  nameAtom: 'ui-elements',
  descriptionAtom: 'ui-elements',
  enterButtonTextAtom: 'ui-elements',
  escapeButtonTextAtom: 'ui-elements',
  shouldActionButtonBarOpenAtom: 'ui-elements',
  shortcutsAtom: 'ui-elements',
  mouseEnabledAtom: 'ui-elements',
  isMouseDownAtom: 'ui-elements',
  mouseWheeledAtom: 'ui-elements',

  // theme
  themeAtom: 'theme',
  tempThemeAtom: 'theme',
  appearanceAtom: 'theme',

  // ui
  uiAtom: 'ui',
  prevUIAtom: 'ui',
  isWindowAtom: 'ui',
  onPasteAtom: 'ui',
  onDropAtom: 'ui',
  onWindowEscapeAtom: 'ui',
  onAbandonShortcutAtom: 'ui',
  onEscapeShortcutAtom: 'ui',

  // preview
  previewHTMLAtom: 'preview',
  previewLoadingAtom: 'preview',
  previewEnabledAtom: 'preview',
  previewCheckAtom: 'preview',

  // bounds
  boundsAtom: 'bounds',
  appBoundsAtom: 'bounds',
  resizingAtom: 'bounds',
  mainHeightAtom: 'bounds',
  topHeightAtom: 'bounds',
  topRefAtom: 'bounds',
  promptBoundsAtom: 'bounds',
  promptResizedByHumanAtom: 'bounds',
  isHiddenAtom: 'bounds',
  triggerResizeAtom: 'bounds',

  // input
  inputAtom: 'input',
  isInputInvalidAtom: 'input',
  filterInputAtom: 'input',
  inputChangedAtom: 'input',
  inputFocusAtom: 'input',
  appendInputAtom: 'input',
  closeAtom: 'input',
  lastInputChangedAtom: 'input',
  modifiersAtom: 'input',
  lastKeyDownWasModifierAtom: 'input',

  // choices
  choicesAtom: 'choices',
  scoredChoicesAtom: 'choices',
  flagsAtom: 'choices',
  actionsAtom: 'choices',
  selectedAtom: 'choices',
  indexAtom: 'choices',
  focusedChoiceAtom: 'choices',
  hasSelectedChoiceAtom: 'choices',
  flaggedValueAtom: 'choices',
  panelIndexAtom: 'choices',
  directionAtom: 'choices',
  choicesConfigAtom: 'choices',
  choicesReadyAtom: 'choices',
  setActionsConfigAtom: 'choices',
  scoredMaxAtom: 'choices',
  choicesHeightAtom: 'choices',
  itemHeightAtom: 'choices',
  gridReadyAtom: 'choices',

  // actions
  flaggedChoiceValueAtom: 'actions',
  actionsInputAtom: 'actions',
  actionsOpenAtom: 'actions',
  flagValueAtom: 'actions',

  // form
  formHTMLAtom: 'form',
  formDataAtom: 'form',
  formResultsAtom: 'form',

  // terminal
  termConfigAtom: 'terminal',
  termOutputAtom: 'terminal',
  termFontAtom: 'terminal',

  // media
  micIdAtom: 'media',
  micMediaRecorderAtom: 'media',
  webcamIdAtom: 'media',
  audioDotAtom: 'media',

  // tabs
  tabsAtom: 'tabs',
  tabIndexAtom: 'tabs',
  showTabsAtom: 'tabs',
  selectedTabAtom: 'tabs',

  // scrolling
  scrollingAtom: 'scrolling',
  listHeightAtom: 'scrolling',
  scrollIndexAtom: 'scrolling',

  // editor
  editorConfigAtom: 'editor',
  editorViewStateAtom: 'editor',
  monacoAtom: 'editor',
  filePathAtom: 'editor',
  editorScrollToAtom: 'editor',
  editorRangeAtom: 'editor',

  // chat
  chatMessagesAtom: 'chat',
  chatPushTokenAtom: 'chat',
  chatHistoryAtom: 'chat',
  streamingAtom: 'chat',

  // log
  consoleHistoryAtom: 'log',

  // ipc
  channelAtom: 'ipc',
  sendActionAtom: 'ipc',
  sendShortcutAtom: 'ipc',
  setChoicesAtom: 'ipc',
  blurAtom: 'ipc',
  focusAtom: 'ipc',
  runMainScriptAtom: 'ipc',
  runProcessScriptAtom: 'ipc',

  // utils
  focusedElementAtom: 'utils',
  domUpdatedAtom: 'utils',
  zoomAtom: 'utils',
  miniShortcutsHoveredAtom: 'utils',
};

// Also check for private atoms (prefixed with _)
const privateAtomToFile = {};
for (const [atom, file] of Object.entries(atomToFile)) {
  const privateAtom = '_' + atom.replace('Atom', '');
  privateAtomToFile[privateAtom] = file;
}

// Combine both maps
const allAtomToFile = { ...atomToFile, ...privateAtomToFile };

async function migrate() {
  // Find all TypeScript/TSX files
  const files = await glob('src/renderer/**/*.{ts,tsx}', {
    ignore: ['**/node_modules/**', '**/state/atoms/**'],
  });

  let changedFiles = 0;

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    let changed = false;

    // Find imports from state/atoms
    const importRegex = /import\s*{([^}]+)}\s*from\s*['"]([^'"]*state\/atoms)['"]/g;

    const newContent = content.replace(importRegex, (_match, imports, modulePath) => {
      // Parse the imported items
      const importedItems = imports.split(',').map((item) => item.trim());

      // Group items by their source file
      const fileToImports = {};
      const unknownImports = [];

      for (const item of importedItems) {
        const cleanItem = item.replace(/^type\s+/, '').replace(/\s+as\s+.*/, '');
        const sourceFile = allAtomToFile[cleanItem];

        if (sourceFile) {
          if (!fileToImports[sourceFile]) {
            fileToImports[sourceFile] = [];
          }
          fileToImports[sourceFile].push(item);
        } else {
          unknownImports.push(item);
        }
      }

      // Generate new import statements
      const newImports = [];

      for (const [sourceFile, items] of Object.entries(fileToImports)) {
        // Calculate the correct relative path
        const currentDir = path.dirname(file);
        const targetPath = sourceFile.startsWith('../')
          ? path.join('src/renderer/src/state', sourceFile)
          : path.join('src/renderer/src/state/atoms', sourceFile);

        let relativePath = path.relative(currentDir, targetPath);
        relativePath = relativePath.replace(/\\/g, '/');
        if (!relativePath.startsWith('.')) {
          relativePath = './' + relativePath;
        }

        newImports.push(`import { ${items.join(', ')} } from '${relativePath}'`);
      }

      // Keep unknown imports from the original barrel (shouldn't happen but just in case)
      if (unknownImports.length > 0) {
        console.warn(`  ⚠️  Unknown imports in ${file}: ${unknownImports.join(', ')}`);
        newImports.push(`import { ${unknownImports.join(', ')} } from '${modulePath}'`);
      }

      changed = true;
      return newImports.join(';\n');
    });

    if (changed) {
      changedFiles++;
      console.log(`✓ ${file}`);
      if (!DRY_RUN) {
        fs.writeFileSync(file, newContent, 'utf-8');
      }
    }
  }

  console.log(`\n${changedFiles} files updated${DRY_RUN ? ' (dry run)' : ''}`);

  if (!DRY_RUN && changedFiles > 0) {
    // Delete the now-unused atoms barrel
    const atomsIndexPath = 'src/renderer/src/state/atoms/index.ts';
    if (fs.existsSync(atomsIndexPath)) {
      fs.unlinkSync(atomsIndexPath);
      console.log(`\nDeleted ${atomsIndexPath}`);
    }
  }
}

migrate().catch(console.error);
