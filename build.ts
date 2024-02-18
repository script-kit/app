import { build } from 'electron-builder'
import type { Configuration } from 'electron-builder'

console.log('Building for', process.platform)

const config: Configuration = {
  appId: 'app.scriptkit', // Updated appId from package.json
  artifactName: '${productName}-macOS-${version}-${arch}.${ext}',
  productName: 'Kit', // Updated productName from package.json
  directories: {
    output: './dist',
    buildResources: "assets" // Added from package.json
  },
  asar: true,
  asarUnpack: [
    "assets/**/*",
    "out"
  ],

  // afterSign: !isTestBuild ? '.erb/scripts/Notarize.js' : undefined, // Updated from package.json
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    shortcutName: 'Kit' // Updated from massCode to Kit
  },
  mac: {
    icon: 'assets/icon.icns',
    category: 'public.app-category.productivity', // Keep as is or update based on package.json if needed
    hardenedRuntime: true,
    entitlements: 'assets/entitlements.mac.plist', // Updated from package.json
    entitlementsInherit: 'assets/entitlements.mac.plist', // Added from package.json
    gatekeeperAssess: false, // Added from package.json
    notarize: false, // Added from package.json
    extendInfo: { // Added from package.json
      "CFBundleDocumentTypes": [
        {
          "CFBundleTypeName": "Folders",
          "CFBundleTypeRole": "Viewer",
          "LSHandlerRank": "Alternate",
          "LSItemContentTypes": [
            "public.folder",
            "com.apple.bundle",
            "com.apple.package",
            "com.apple.resolvable"
          ]
        },
        {
          "CFBundleTypeName": "UnixExecutables",
          "CFBundleTypeRole": "Shell",
          "LSHandlerRank": "Alternate",
          "LSItemContentTypes": [
            "public.unix-executable"
          ]
        }
      ]
    }
  },
  win: {
    target: 'nsis',
    icon: 'config/icons/icon.ico',
    artifactName: '${productName}-Windows-${version}-${arch}.${ext}' // Updated from package.json
  },
  linux: {
    target: ['snap'],
    icon: 'config/icons',
    category: "Development", // Updated from package.json
    executableName: "scriptkit", // Added from package.json
    artifactName: '${productName}-Linux-${version}-${arch}.${ext}' // Updated from package.json
  },
  protocols: [
    {
      name: 'kit', // Updated from package.json
      schemes: ['kit'] // Updated from package.json
    }
  ],
  files: [
    'out/**/*',
  ],
  publish: { // Added from package.json
    "provider": "github",
    "owner": "johnlindquist",
    "repo": "kitapp"
  }
}


console.log('Building with config')
const result = await build({ config })
console.log('Build result', result)

export {}
