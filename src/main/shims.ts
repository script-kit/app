import os from 'node:os';
import log from 'electron-log';

// get arch
const arch = process.arch;
const platform = os.platform();

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
type OptionalDependencies = (typeof optionalDependencies)[number];

const supportMap: Partial<Record<Target, OptionalDependencies[]>> = {
  'win32-arm64': [robot, uiohook, nwm],
  'win32-x64': [robot, uiohook, nwm],
  'darwin-arm64': [robot, uiohook, nmp, nwm, mcl, mf, mpw],
  'darwin-x64': [robot, uiohook, nmp, nwm, mcl, mf, mpw],
  'linux-arm64': [],
  'linux-x64': [robot, uiohook],
} as const;

interface Shims {
  [robot]: typeof import('@jitsi/robotjs');
  [uiohook]: typeof import('uiohook-napi');
  [nmp]: typeof import('node-mac-permissions');
  [nwm]: typeof import('@johnlindquist/node-window-manager');
  [mf]: typeof import('@johnlindquist/mac-frontmost');
  [mcl]: typeof import('@johnlindquist/mac-clipboard-listener');
  [mpw]: typeof import('@johnlindquist/mac-panel-window');
}

const notImplemented = new Proxy(
  {},
  {
    get: (target, prop: string) => () => {
      log.warn(`${prop} not supported on ${target}`);
    },
  },
);

const shims: Shims = {
  [robot]: notImplemented as Shims['@jitsi/robotjs'],
  [uiohook]: notImplemented as Shims['uiohook-napi'],
  [nmp]: notImplemented as Shims['node-mac-permissions'],
  [nwm]: notImplemented as Shims['@johnlindquist/node-window-manager'],
  [mf]: notImplemented as Shims['@johnlindquist/mac-frontmost'],
  [mpw]: notImplemented as Shims['@johnlindquist/mac-panel-window'],
  [mcl]: notImplemented as Shims['@johnlindquist/mac-clipboard-listener'],
};

export const include = () => {
  return supportMap[target] || [];
};

export const external = () => {
  const internal = include();
  return optionalDependencies.filter((dep) => !internal.includes(dep));
};

export async function loadShims() {
  const exportDefaults: OptionalDependencies[] = [nmp];
  const deps = include();
  for (const dep of deps) {
    log.info(`Loading shim: ${dep}`);
    const shim = await import(dep);
    log.info(`Loaded shim: ${dep}`);
    shims[dep] = exportDefaults.includes(dep) ? shim.default : shim;
  }
}

export default shims;
