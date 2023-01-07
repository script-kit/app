/* eslint-disable */

// import '@johnlindquist/kit';

let { chdir } = await import('process');
let tar = await npm('tar');

console.log('Creating assets');

console.log(`🕵️‍♀️ process.env.SCRIPTS_DIR:`, process.env.SCRIPTS_DIR);
console.log(`kenvPkgPath:`, kenvPath(process.env.SCRIPTS_DIR || ''));

chdir(process.env.PWD);

let releaseChannel = await arg('Enter the release channel');

let releaseChannelTxt = path.resolve(
  process.env.PWD,
  'assets',
  'release_channel.txt'
);
console.log({ releaseChannelTxt });

await writeFile(releaseChannelTxt, releaseChannel);

await download(
  `https://github.com/johnlindquist/kenv/tarball/${releaseChannel}`,
  path.resolve(process.env.PWD, 'assets'),
  { filename: 'kenv.tar.gz' }
);
