import os from 'node:os';
import log from 'electron-log';

// get arch
console.log({
  ELECTRON_BUILD_ARCH: process.env.ELECTRON_BUILD_ARCH || 'unknown',
  ELECTRON_BUILD_PLATFORM: process.env.ELECTRON_BUILD_PLATFORM || 'unknown',
});
const arch = (process.env.ELECTRON_BUILD_ARCH || process.arch) as NodeJS.Architecture;
const platform = (process.env.ELECTRON_BUILD_PLATFORM || os.platform()) as NodeJS.Platform;

type Target = `${NodeJS.Platform}-${NodeJS.Architecture}`;
const target: Target = `${platform}-${arch}`;

const robot = '@jitsi/robotjs' as const;
const uiohook = 'uiohook-napi' as const;
const nmp = 'node-mac-permissions' as const;
const nwm = '@johnlindquist/node-window-manager' as const;
const mcl = '@johnlindquist/mac-clipboard-listener' as const;
const mf = '@johnlindquist/mac-frontmost' as const;
const mpw = '@johnlindquist/mac-panel-window' as const;

// Object.keys(packageJson.optionalDependencies)
const optionalDependencies = [robot, uiohook, nmp, nwm, mcl, mf, mpw] as const;
type OptionalDependency = (typeof optionalDependencies)[number];

const supportMap: Partial<Record<Target, OptionalDependency[]>> = {
  'win32-arm64': [robot, uiohook, nwm],
  'win32-x64': [robot, uiohook, nwm],
  'darwin-arm64': [robot, uiohook, nmp, nwm, mcl, mf, mpw],
  'darwin-x64': [robot, uiohook, nmp, nwm, mcl, mf, mpw],
  'linux-arm64': [],
  'linux-x64': [robot, uiohook],
} as const;

export const supportsDependency = (dep: OptionalDependency) => {
  return supportMap[target]?.includes(dep);
};

const exportDefaults: OptionalDependency[] = [nmp, robot];

interface Shims {
  //@ts-ignore This import might not work, depending on the platform
  [robot]: typeof import('@jitsi/robotjs');
  //@ts-ignore This import might not work, depending on the platform
  [uiohook]: typeof import('uiohook-napi');
  //@ts-ignore This import might not work, depending on the platform
  [nmp]: typeof import('node-mac-permissions');
  //@ts-ignore This import might not work, depending on the platform
  [nwm]: typeof import('@johnlindquist/node-window-manager');
  //@ts-ignore This import might not work, depending on the platform
  [mf]: typeof import('@johnlindquist/mac-frontmost');
  //@ts-ignore This import might not work, depending on the platform
  [mcl]: typeof import('@johnlindquist/mac-clipboard-listener');
  //@ts-ignore This import might not work, depending on the platform
  [mpw]: typeof import('@johnlindquist/mac-panel-window');
}

const createShim = <T extends keyof Shims>(packageName: T, depth = 0): Shims[T] =>
  new Proxy(
    {},
    {
      get: (_target, prop: string) => {
        log.warn(`Accessing ${prop.toString()} not supported on ${packageName}`);

        if (depth > 0) {
          log.error(
            `The shim for ${packageName} appears to get accessed deeply with '${prop}', indicating ` +
              'that platform checks are missing.',
          );
        }

        return createShim(packageName, depth + 1);
      },
    },
  ) as Shims[T];

const shims: Shims = {
  [robot]: createShim('@jitsi/robotjs'),
  [uiohook]: createShim('uiohook-napi'),
  [nmp]: createShim('node-mac-permissions'),
  [nwm]: createShim('@johnlindquist/node-window-manager'),
  [mf]: createShim('@johnlindquist/mac-frontmost'),
  [mpw]: createShim('@johnlindquist/mac-panel-window'),
  [mcl]: createShim('@johnlindquist/mac-clipboard-listener'),
};

export const include = () => {
  const deps = supportMap[target] || [];
  console.log(`Including shims for ${target}: ${deps.join(', ')}`);
  return deps;
};

export const external = () => {
  const internal = include();
  const deps = optionalDependencies.filter((dep) => !internal.includes(dep));
  console.log(`External shims: ${deps.join(', ')}`);
  return deps;
};

export async function loadSupportedOptionalLibraries() {
  log.info(`


>>>>>>>>>> LOADING OPTIONAL LIBRARIES

  `);
  const deps = include();
  for (const dep of deps) {
    log.info(`Loading: ${dep}`);
    const shim = await import(dep);
    shims[dep] = exportDefaults.includes(dep) ? shim.default : shim;
    log.info(`Loaded: ${dep}. Available:`, Object.keys(shims[dep]));
  }
}

export default shims;
