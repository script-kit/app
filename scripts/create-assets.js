/* eslint-disable */

// import '@johnlindquist/kit';

console.log("Creating assets");

let { chdir } = await import('process');
let tar = await npm('tar');

console.log(`PWD`, process.env.PWD);
chdir(process.env.PWD);

let { stdout: releaseChannel } = await exec(`git rev-parse --abbrev-ref HEAD`);
console.log({ releaseChannel });

let releaseChannelTxt = path.resolve(
  process.env.PWD,
  'assets',
  'release_channel.txt'
);
console.log({ releaseChannelTxt });

await writeFile(releaseChannelTxt, releaseChannel);

let nodeModulesKit = kitPath();
let outTarz = path.resolve(process.env.PWD, 'assets', 'kit.tar.gz');

console.log(`Tar ${nodeModulesKit} to ${outTarz}`);

await tar.c(
  {
    cwd: nodeModulesKit,
    gzip: true,
    file: outTarz,
    follow: true,
    filter: (item) => {
      if (item.match(/^.{0,2}node/)) {
        console.log(`SKIPPING`, item);
        return false;
      }
      if (item.includes('kit.sock')) return false;

      return true;
    },
  },
  ['.']
);

// console.log(`Removing`, kitDir);
// await rm(kitDir, {
//   recursive: true,
//   force: true,
// });

await download(
  `https://github.com/johnlindquist/kenv/tarball/${releaseChannel}`,
  path.resolve(process.env.PWD, 'assets'),
  { filename: 'kenv.tar.gz' }
);
