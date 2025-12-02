#!/usr/bin/env node

// Simple script to migrate imports from state/index.ts to jotai.ts
import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';

const DRY_RUN = process.argv.includes('--dry');

async function migrate() {
  // Find all TypeScript/TSX files
  const files = await glob('src/renderer/**/*.{ts,tsx}', {
    ignore: ['**/node_modules/**'],
  });

  let changedFiles = 0;

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    let changed = false;

    // Replace imports from '../state' or './state' with '../jotai' or './jotai'
    const newContent = content
      .replace(/from ['"]\.\.\/state['"]/g, (_match) => {
        changed = true;
        return `from '../jotai'`;
      })
      .replace(/from ['"]\.\/state['"]/g, (_match) => {
        changed = true;
        return `from './jotai'`;
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

  if (!DRY_RUN) {
    // Delete the now-unused state/index.ts
    const stateIndexPath = 'src/renderer/src/state/index.ts';
    if (fs.existsSync(stateIndexPath)) {
      fs.unlinkSync(stateIndexPath);
      console.log(`\nDeleted ${stateIndexPath}`);
    }
  }
}

migrate().catch(console.error);
