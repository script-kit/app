module.exports = {
  branches: ['main', 'beta', 'alpha'],
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
  ],
};
