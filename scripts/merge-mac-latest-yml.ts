/* eslint-disable */

import '@johnlindquist/kit';

import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { TextDecoder } from 'node:util';
import { Octokit } from 'octokit';

const token = process.env.GITHUB_TOKEN;

const client = new Octokit({
  auth: token,
});

// let projectFiles = await readdir(projectPath());
// let srcFiles = await readdir(projectPath('src'));
const pkgJsonPath = projectPath('package.json');
const pkg = await readJson(pkgJsonPath);

console.log({
  pkgJsonPath,
  pkg,
});

const OWNER = await arg('Enter owner name');
const REPO = await arg('Enter repo name');
const ARCH = await arg('Enter arch');
const URL = `/repos/${OWNER}/${REPO}/releases`;
const VERSION = `v${pkg.version}`;
const FILE_NAME = 'latest-mac.yml';
const DIR = `release/mac${ARCH === 'arm64' ? '-arm64' : ''}`;
const LOCAL_FILE_PATH = `release/${FILE_NAME}`;
const LOCAL_FILE_WITH_DIR_PATH = `${DIR}/${FILE_NAME}`;

console.log({
  OWNER,
  REPO,
  ARCH,
  URL,
  VERSION,
  FILE_NAME,
  DIR,
  LOCAL_FILE_PATH,
  LOCAL_FILE_WITH_DIR_PATH,
});

const mergeFiles = (intel, arm) => {
  const intelLines = intel.split('\n');
  const armLines = arm.split('\n').splice(2, 6);

  const merged = [...intelLines.slice(0, 8), ...armLines, ...intelLines.slice(8)];

  return merged.join('\n');
};

const getPlatformFromLatestMacYml = (content) => {
  const intelRe = 'x64.dmg';
  const armRe = 'arm64.dmg';
  const isIntel = content.includes(intelRe);
  const isArm = content.includes(armRe);

  if (isIntel && isArm) {
    return 'both';
  }
  if (isIntel && !isArm) {
    return 'intel';
  }
  if (!isIntel && isArm) {
    return 'arm';
  }

  return 'none';
};

(async () => {
  const allReleases = await client.request(`GET ${URL}`);
  console.log({ allReleases });
  const currentRelease = allReleases.data.find((release) => {
    console.log({ release });
    return release.name === VERSION;
  });

  if (currentRelease) {
    console.log('Release found');
  } else {
    console.log('No release found. Skipping merge');
    return;
  }

  const localFilePathFiles = await readdir(path.dirname(LOCAL_FILE_PATH));

  console.log({ files: localFilePathFiles });

  const localFileWithDirPathFiles = await readdir(path.dirname(LOCAL_FILE_WITH_DIR_PATH));

  console.log({ files: localFileWithDirPathFiles });

  const localLatestMacYmlExists = fs.existsSync(LOCAL_FILE_PATH) || fs.existsSync(LOCAL_FILE_WITH_DIR_PATH);
  const actualLocalFilePath = fs.existsSync(LOCAL_FILE_PATH) ? LOCAL_FILE_PATH : LOCAL_FILE_WITH_DIR_PATH;

  if (localLatestMacYmlExists) {
    console.log(`[local] ${FILE_NAME} found`);
  } else {
    console.log(`[local] could not find ${FILE_NAME}. Skipping merge`);
    return;
  }

  const localLatestMacYmlContent = fs.readFileSync(actualLocalFilePath, {
    encoding: 'utf8',
  });

  const localPlatform = getPlatformFromLatestMacYml(localLatestMacYmlContent);

  if (localPlatform === 'none' || localPlatform === 'both') {
    console.log(`[local] ${FILE_NAME} invalid. Platform: ${localPlatform}. Skipping merge`);
    return;
  }
  console.log(`[local] ${FILE_NAME} valid: Platform: ${localPlatform}`);

  const localPlatformPresentRemotely = currentRelease.assets.find((asset) => {
    return asset.name === `latest-mac-${localPlatform}.yml`;
  });

  if (localPlatformPresentRemotely) {
    try {
      await client.request(`DELETE ${URL}/assets/${localPlatformPresentRemotely.id}`);
      console.log(`[remote] deleted latest-mac-${localPlatform}.yml`);
    } catch (e) {
      console.log(`[remote] error deleting latest-mac-${localPlatform}.yml. Skipping merge`);
      console.log(e);
      return;
    }
  }

  const uploadUrl = currentRelease.upload_url;
  const localAssetStream = new Readable();
  localAssetStream.push(localLatestMacYmlContent);
  localAssetStream.push(null);

  try {
    await client.rest.repos.uploadReleaseAsset({
      url: uploadUrl,
      headers: {
        'content-type': 'application/octet-stream',
        'content-length': Buffer.byteLength(localLatestMacYmlContent),
      },
      name: `latest-mac-${localPlatform}.yml`,
      data: localAssetStream,
    });
    console.log(`[remote] latest-mac-${localPlatform}.yml uploaded`);
  } catch (e) {
    console.log(`[remote] error uploading latest-mac-${localPlatform}.yml. Skipping merge`);
    console.log(e);
    return;
  }

  const remotePlatform = localPlatform === 'intel' ? 'arm' : 'intel';

  const remotePlatformFileExists = currentRelease.assets.find((asset) => {
    return asset.name === `latest-mac-${remotePlatform}.yml`;
  });

  if (remotePlatformFileExists) {
    console.log(`[remote] latest-mac-${remotePlatform}.yml found`);
  } else {
    console.log(`[remote] latest-mac-${remotePlatform}.yml does not exists. Skipping merge`);
    return;
  }

  let remotePlatformFile = null;

  try {
    remotePlatformFile = await client.request(`GET ${URL}/assets/${remotePlatformFileExists.id}`, {
      headers: {
        accept: 'application/octet-stream',
      },
    });
    console.log(`[remote] latest-mac-${remotePlatform}.yml downloaded`);
  } catch (e) {
    console.log(`[remote] error downloading latest-mac-${remotePlatform}.yml. Skipping merge`);
    console.log(e);
    return;
  }

  const remoteLatestMacYmlContent = new TextDecoder().decode(remotePlatformFile.data);

  try {
    const originalAsset = currentRelease.assets.find((asset) => {
      return asset.name === FILE_NAME;
    });

    if (originalAsset) {
      console.log(`[remote] ${FILE_NAME} found`);
    } else {
      console.log(`[remote] ${FILE_NAME} not found. Skipping merge`);
      return;
    }

    await client.request(`DELETE ${URL}/assets/${originalAsset.id}`);
    console.log(`[remote] deleted ${FILE_NAME}`);
  } catch (e) {
    console.log(`[remote] error deleting ${FILE_NAME}. Skipping merge`);
    console.log(e);
    return;
  }

  const mergedContent =
    remotePlatform === 'intel'
      ? mergeFiles(remoteLatestMacYmlContent, localLatestMacYmlContent)
      : mergeFiles(localLatestMacYmlContent, remoteLatestMacYmlContent);

  const assetStream = new Readable();
  assetStream.push(mergedContent);
  assetStream.push(null);

  try {
    await client.rest.repos.uploadReleaseAsset({
      url: uploadUrl,
      headers: {
        'content-type': 'application/octet-stream',
        'content-length': Buffer.byteLength(mergedContent),
      },
      name: FILE_NAME,
      data: assetStream,
    });
    console.log(`[remote] uploaded merged ${FILE_NAME}`);
  } catch (e) {
    console.log(`[remote] error uploading merged ${FILE_NAME}. Skipping merge`);
    console.log(e);
    return;
  }

  // cleanup
  const updatedRelease = await client.request(`GET ${URL}`);
  const updatedCurrentRelease = updatedRelease.data.find((release) => {
    return release.name === VERSION;
  });

  const assetsToClean = updatedCurrentRelease.assets.filter((asset) => {
    return asset.name === 'latest-mac-arm.yml' || asset.name === 'latest-mac-intel.yml';
  });

  for (const assetToClean of assetsToClean) {
    try {
      await client.request(`DELETE ${URL}/assets/${assetToClean.id}`);
      console.log(`[remote:cleanup] deleted ${assetToClean.name}`);
    } catch (e) {
      console.log(`[remote:cleanup] error deleting ${assetToClean.name}`);
      console.log(e);
    }
  }

  console.log('Merge complete');
})();
