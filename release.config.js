module.exports = {
  branches: ['main', 'beta', 'alpha'],
  plugins: [
    [
      '@semantic-release/npm',
      {
        npmPublish: false,
        pkgRoot: 'src',
      },
    ],
  ],
};
