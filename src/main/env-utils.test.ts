import path from 'node:path';
import { remove, writeFile } from 'fs-extra';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadKenvEnvironment } from './env-utils';

const testDir = vi.hoisted(() => {
  return import('tmp-promise').then(({ dir }) => {
    return dir({ unsafeCleanup: true, prefix: 'env-utils-test' });
  });
});

vi.mock('@johnlindquist/kit/core/utils', async () => {
  const tmpDir = await testDir;
  return {
    __esModule: true,
    kenvPath: (...parts: string[]) => {
      return path.join(tmpDir.path, ...parts);
    },
  };
});

describe('loadKenvEnvironment', () => {
  let tmpDirPath: string;

  beforeAll(async () => {
    const tmp = await testDir;
    tmpDirPath = tmp.path;
  });

  afterEach(async () => {
    // Clean up created .env files after each test
    const envFiles = ['.env.local', '.env.development', '.env.production', '.env', '.env.kit'];
    for (const file of envFiles) {
      await remove(path.join(tmpDirPath, file));
    }
  });

  afterAll(async () => {
    const tmp = await testDir;
    await tmp.cleanup();
  });

  it('should return an empty object if no .env files are found', () => {
    const env = loadKenvEnvironment();
    expect(env).toEqual({});
  });

  it('should load variables from .env file', async () => {
    await writeFile(path.join(tmpDirPath, '.env'), 'A=1\nB=2');
    const env = loadKenvEnvironment();
    expect(env).toEqual({ A: '1', B: '2' });
  });

  it('should load variables from .env.kit file', async () => {
    await writeFile(path.join(tmpDirPath, '.env.kit'), 'KIT_VAR=true');
    const env = loadKenvEnvironment();
    expect(env).toEqual({ KIT_VAR: 'true' });
  });

  it('should prioritize .env over .env.kit', async () => {
    await writeFile(path.join(tmpDirPath, '.env.kit'), 'VAR=kit\nKIT_ONLY=kit-only');
    await writeFile(path.join(tmpDirPath, '.env'), 'VAR=env');
    const env = loadKenvEnvironment();
    expect(env).toEqual({ VAR: 'env', KIT_ONLY: 'kit-only' });
  });

  it('should prioritize .env.production over .env', async () => {
    await writeFile(path.join(tmpDirPath, '.env'), 'VAR=env\nENV_ONLY=env-only');
    await writeFile(path.join(tmpDirPath, '.env.production'), 'VAR=prod');
    const env = loadKenvEnvironment();
    expect(env).toEqual({ VAR: 'prod', ENV_ONLY: 'env-only' });
  });

  it('should prioritize .env.development over .env.production', async () => {
    await writeFile(path.join(tmpDirPath, '.env.production'), 'VAR=prod\nPROD_ONLY=prod-only');
    await writeFile(path.join(tmpDirPath, '.env.development'), 'VAR=dev');
    const env = loadKenvEnvironment();
    expect(env).toEqual({ VAR: 'dev', PROD_ONLY: 'prod-only' });
  });

  it('should prioritize .env.local over all other .env files', async () => {
    await writeFile(path.join(tmpDirPath, '.env.kit'), 'VAR=kit\nKIT_ONLY=kit');
    await writeFile(path.join(tmpDirPath, '.env'), 'VAR=env\nENV_ONLY=env');
    await writeFile(path.join(tmpDirPath, '.env.production'), 'VAR=prod\nPROD_ONLY=prod');
    await writeFile(path.join(tmpDirPath, '.env.development'), 'VAR=dev\nDEV_ONLY=dev');
    await writeFile(path.join(tmpDirPath, '.env.local'), 'VAR=local');

    const env = loadKenvEnvironment();
    expect(env).toEqual({
      VAR: 'local',
      KIT_ONLY: 'kit',
      ENV_ONLY: 'env',
      PROD_ONLY: 'prod',
      DEV_ONLY: 'dev',
    });
  });

  it('should handle empty files gracefully', async () => {
    await writeFile(path.join(tmpDirPath, '.env'), '');
    await writeFile(path.join(tmpDirPath, '.env.local'), 'A=1');
    const env = loadKenvEnvironment();
    expect(env).toEqual({ A: '1' });
  });

  it('should handle files with comments and weird spacing', async () => {
    const content = `
# This is a comment
VAR1=value1  # with a comment
      VAR2 =  value2

VAR3=
    `;
    await writeFile(path.join(tmpDirPath, '.env'), content);
    const env = loadKenvEnvironment();
    expect(env).toEqual({
      VAR1: 'value1',
      VAR2: 'value2',
      VAR3: '',
    });
  });
});
