// import '@johnlindquist/kit';

let { chdir } = await import('process');
let tar = await npm('tar');

chdir(process.env.PWD);

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
