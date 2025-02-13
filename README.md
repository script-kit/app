# Script Kit App v3

The Script Kit App

The SDK is here: [https://github.com/johnlindquist/kit](https://github.com/johnlindquist/kit)

[https://scriptkit.com](https://scriptkit.com)

## Getting Started

Install pnpm:

[https://pnpm.io/installation](https://pnpm.io/installation)


Run the following:

```
pnpm i
pnpm dev
```

## Feature Map

| OS      | Arch  | Copy/Paste/Set Text | Expand Text | Monitor Clipboard |
|---------|-------|:------------------:|:-----------:|:----------------:|
| Mac     | x64   | ✅                 | ✅          | ✅               |
| Mac     | arm64 | ✅                 | ✅          | ✅               |
| Windows | x64   | ✅                 | ✅          | ✅               |
| Windows | arm64 | ✅                 | ❌          | ✅               |
| Linux   | x64   | ✅                 | ✅          | ❌               |
| Linux   | arm64 | ✅                 | ❌          | ❌               |


### Reloading

If you make a change in the `main` dir/process, you'll need to stop and run `pnpm run dev` again.
If you make a change in the `renderer`, it should attempt to hot reload. If that fails, `cmd+w` to close the window, and open a new one.


### node-gyp Issues?

You'll have to Google for your specific issues. On mac, it's usually update xcode command line tools.


### System Specific Notes

### Mac - Homebrew Users

@see - https://stackoverflow.com/questions/77251296/distutils-not-found-when-running-npm-install

If you're using homebrew for Python (or python 3.12), you'll need to install the `setuptools` to be able to run `pnpm i`

```
brew install python-setuptools
```

### Windows
Putting this here in case anyone has trouble with node-gyp while setting up a dev environment on Windows. I had to install the following using the Visual Studio Installer:

Desktop Development with C++ workload
MSVC v143 - VS 2022 C++ x64/x86 build tools (Latest)
MSVC v143 - VS 2022 C++ x64/x86 Spectre-mitigated libs (Latest)

### Linux

I've had the most issues working on Linux. I've often had to manually end the Electron process:

```
killall Electron
```

Or clear the vite cache:

```
pnpm clear-cache
```

#### arm64

You may need to uninstall uiohook-napi to avoid errors:
```bash
pnpm un uiohook-napi
```


### Kit SDK Notes

#### pnpm

This will install pnpm to ~/.kit/pnpm

#### Native Dependencies

Some dependencies require build scripts. These are configured in package.json under `pnpm.onlyBuiltDependencies`. If you see build script warnings, you may need to run:

```bash
pnpm rebuild
```

#### Vite Cache Issues

When rebuilding the Kit SDK, also run:

```
npm run clear-cache
```

This is due to Vite not picking up on some changes to a linked SDK.

## Current Weather Alerts for Utah

### Winter Weather Advisory
- Area: Western Uinta Mountains
- Status: Active
- Severity: Moderate
- Details: Winter Weather Advisory issued February 7 at 10:59PM MST until February 7 at 11:00PM MST

### Wind Advisory
Multiple areas affected:
- Great Salt Lake Desert and Mountains
- Tooele and Rush Valleys
- Western Millard and Juab Counties
- Southwest Utah
- Eastern Uinta Basin
- Lower Yampa River Basin
- Central Yampa River Basin
- Central Colorado River Basin

Status: Active
Severity: Moderate

*Weather information last updated: February 7, 2024*
