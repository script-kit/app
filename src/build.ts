import log from 'electron-log';
import path from 'path';
import { debounce } from 'lodash';
import { readdir } from 'fs/promises';
import { Script } from '@johnlindquist/kit';
import { kitPath, kenvPath, home, isDir } from '@johnlindquist/kit/cjs/utils';

export const determineOutFile = (scriptPath: string) => {
  const tmpScriptName = path
    .basename(scriptPath)
    .replace(/\.(ts|jsx|tsx)$/, '.mjs');

  const dirName = path.dirname(scriptPath);
  const inScriptsDir = dirName.endsWith(`${path.sep}scripts`)
    ? ['..', '.scripts']
    : [];

  const outfile = path.join(scriptPath, '..', ...inScriptsDir, tmpScriptName);

  return outfile;
};

export const buildTSScript = async (scriptPath: string, outPath = '') => {
  let external: string[] = [];
  const mainKenvNodeModulesPath = home('.kenv', 'node_modules');
  const subKenvNodeModulesPath = kenvPath('node_modules');
  if (await isDir(mainKenvNodeModulesPath)) {
    external = external.concat(await readdir(mainKenvNodeModulesPath));
  }

  if (
    subKenvNodeModulesPath !== mainKenvNodeModulesPath &&
    (await isDir(subKenvNodeModulesPath))
  ) {
    external = external.concat(await readdir(subKenvNodeModulesPath));
  }

  const outfile = outPath || determineOutFile(scriptPath);
  const { build } = await import('esbuild');
  await build({
    entryPoints: [scriptPath],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    external,
    charset: 'utf8',
    tsconfig: kitPath('templates', 'config', 'tsconfig.json'),
  });
  log.info(`👷‍♀️ Built ${scriptPath} to ${outfile}`);
};

export const buildScriptChanged = debounce(async ({ filePath }: Script) => {
  if (filePath.endsWith('.ts')) {
    log.info(`🏗️ Build ${filePath}`);
    await buildTSScript(filePath);
  }

  if (filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) {
    log.info(`🏗️ Build ${filePath}`);
    // await runScript(kitPath('cli/build-widget.js'), filePath);
  }
}, 250);
