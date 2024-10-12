import fs from 'node:fs';
import { app } from 'electron';
import { getAssetPath } from '../shared/assets';
import { kitStore } from './state';
import axios from 'axios';

// eslint-disable-next-line import/prefer-default-export
export const getVersionFromText = () => {
  const versionPath = getAssetPath('version.txt');
  return fs.readFileSync(versionPath, 'utf8').trim();
};

export const getLatestAppTag = async () => {
  const { data } = await axios.get('https://api.github.com/repos/script-kit/app/tags');
  return data[0].name;
}

export const getVersion = () => {
  const kitAppVersion = process.env?.KIT_APP_VERSION;
  if (kitAppVersion === 'undefined' || kitAppVersion === undefined) {
    if (process.env.NODE_ENV === 'development') {
      return getVersionFromText();
    }
    return app.getVersion();
  }
  return kitAppVersion.trim() || app.getVersion();
};

export async function getVersionFromTag(tag = 'latest'): Promise<string> {
  const response = await fetch('https://registry.npmjs.org/@johnlindquist/kit');
  const data = (await response.json()) as { distTags: { [key: string]: string } };
  return data['dist-tags'][process.env?.KIT_SDK_TAG || tag];
}

export const getURLFromVersion = (version: string) => {
  return `https://registry.npmjs.org/@johnlindquist/kit/-/kit-${version}.tgz`;
}

export const storeVersion = (version: string) => {
  kitStore.set('version', version);
};

export const getStoredVersion = () => {
  return kitStore.get('version');
};
