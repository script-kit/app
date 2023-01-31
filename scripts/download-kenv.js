/* eslint-disable */

// import '@johnlindquist/kit';

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

const url = `https://github.com/johnlindquist/kenv/releases/latest/download/kenv.zip`;

await download(url, path.resolve(process.env.PWD, 'assets'), {
  filename: 'kenv.zip',
});
