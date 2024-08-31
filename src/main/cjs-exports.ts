import fsExtra from 'fs-extra';

export const {
  pathExistsSync,
  ensureDir,
  ensureSymlink,
  writeFile,
  readJson,
  writeJson,
  pathExists,
  readdir,
  remove,
  ensureDirSync,
} = fsExtra;
