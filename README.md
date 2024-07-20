# Script Kit App

The companion app to Script Kit

[https://scriptkit.com](https://scriptkit.com)


## Installation

### Mac - Homebrew Users

@see - https://stackoverflow.com/questions/77251296/distutils-not-found-when-running-npm-install

If you're using homebrew for Python (or python 3.12), you'll need to install the `setuptools` to be able to run `npm i`

```
brew install python-setuptools
```


### Kit SDK Notes

#### Vite Cache Issues

When rebuilding the Kit SDK, also run:

```
npm run clear-cache
```

This is due to Vite not picking up on some changes to a linked SDK.
