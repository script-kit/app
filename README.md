# Script Kit App v3

The companion app to Script Kit

[https://scriptkit.com](https://scriptkit.com)

## Development

```
npm i
npm run dev
```

### node-gyp Issues?

You'll have to Google for your specific issues. On mac, it's usually update xcode command line tools.


## Installation

### Mac - Homebrew Users

@see - https://stackoverflow.com/questions/77251296/distutils-not-found-when-running-npm-install

If you're using homebrew for Python (or python 3.12), you'll need to install the `setuptools` to be able to run `npm i`

```
brew install python-setuptools
```

### Windows
Putting this here in case anyone has trouble with node-gyp while setting up a dev environment on Windows. I had to install the following using the Visual Studio Installer:

Desktop Development with C++ workload
MSVC v143 - VS 2022 C++ x64/x86 build tools (Latest)
MSVC v143 - VS 2022 C++ x64/x86 Spectre-mitigated libs (Latest)

This got it working for me.


### Kit SDK Notes

#### Vite Cache Issues

When rebuilding the Kit SDK, also run:

```
npm run clear-cache
```

This is due to Vite not picking up on some changes to a linked SDK.
