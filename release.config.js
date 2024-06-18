module.exports = {
  branches: ['main', 'next'],
  plugins: [
    [
      '@semantic-release/npm',
      {
        npmPublish: false,
        pkgRoot: '.',
      },
    ],
  ],
};
