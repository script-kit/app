(async function () {
  globalThis.electron = require('electron');
  const { nanoid } = await import('nanoid');
  const { getAuthStatus } = await import('node-mac-permissions');

  console.log(`Starting Electron App with ID: ${nanoid()}`);

  const status = getAuthStatus('accessibility');
  console.log('Accessibility status:', status);

  // process.exit();
  await import('./index.js');
})();
