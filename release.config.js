module.exports = {
  branches: ['main', 'vite'],
  plugins: [
    [
      '@semantic-release/npm',
      {
        npmPublish: false,
      },
    ],
  ],
};
