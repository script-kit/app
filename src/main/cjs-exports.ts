import fsExtra from 'fs-extra';

export const {
  pathExistsSync,
  ensureDir,
  ensureSymlink,
  writeFile,
  readFile,
  readJson,
  writeJson,
  pathExists,
  readdir,
  remove,
  ensureDirSync,
} = fsExtra;
