module.exports = {
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    '@electron-toolkit/eslint-config-ts/recommended',
    '@electron-toolkit/eslint-config-prettier'
  ],
  rules: {
    // Prevent barrel files by disallowing re-exports
    // Allow only jotai.ts and state/atoms/index.ts as exceptions
    'no-restricted-syntax': [
      'error',
      {
        selector: 'ExportAllDeclaration',
        message: 'Barrel files (re-exports) are not allowed to prevent circular dependencies. Import directly from the source file instead.'
      },
      {
        selector: 'ExportNamedDeclaration[source]',
        message: 'Re-exporting from other modules is not allowed to prevent barrel files. Import directly from the source file instead.'
      }
    ]
  },
  overrides: [
    {
      // Allow re-exports only in these specific files
      files: [
        'src/renderer/src/jotai.ts',
        'src/renderer/src/state/atoms/index.ts'
      ],
      rules: {
        'no-restricted-syntax': 'off'
      }
    }
  ]
}
