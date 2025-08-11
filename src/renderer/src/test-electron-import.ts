// This file is for testing that direct electron imports fail type checking

// This should cause a type error:
import { ipcRenderer } from 'electron';

// Try to use it (this should fail)
export function testBadImport() {
  ipcRenderer.send('test', 'data');
}