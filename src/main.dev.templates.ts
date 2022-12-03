import { getAssetPath } from './assets';
import { getVersion } from './version';

export const SPINNER = `
<svg
class="animate-spin h-6 w-6 text-primary-dark dark:text-yellow
xmlns="http://www.w3.org/2000/svg"
fill="none"
viewBox="0 0 24 24"
>
<circle
  class="opacity-25"
  cx="12"
  cy="12"
  r="10"
  stroke="currentColor"
  strokeWidth="4"
/>
<path
  class="opacity-75"
  fill="currentColor"
  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
/>
</svg>`;

export const CONFIG_SPLASH = `
<body class="h-screen w-screen flex flex-col justify-evenly items-center">
  <h1 class="header pt-4 -mb-2">Kit ${getVersion()}</h1>
  <div>Configuring ~/.kit and ~/.kenv...</div>

  <img src="${getAssetPath('icon.png')}" class="w-16"/>
  <div class="spinner">${SPINNER}</div>
  <div class="message py-4 w-10/12 text-center truncate"></div>
</body>
`;

export const showError = (error: Error, mainLog: string) => `
<body class="p-1 h-screen w-screen flex flex-col">
<h1>Kit ${getVersion()} failed to install</h1>
<div>Please share the logs below (already copied to clipboard): </div>
<div class="italic">Note: Kit exits when you close this window</div>
<div><a href="https://github.com/johnlindquist/kit/discussions/categories/errors">https://github.com/johnlindquist/kit/discussions/categories/errors</a></div>

<h2>Error: ${error.message}</h2>

<textarea class="font-mono w-full h-full text-xs text-black">${mainLog}</textarea>
</body>
`;
