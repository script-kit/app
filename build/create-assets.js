const go = async () => {
  const { chdir } = await import('process');
  const path = await import('path');

  console.log(`PWD`, process.env.PWD);
  chdir(process.env.PWD);

  const { execa } = await import('execa');
  const {
    stdout: releaseChannel,
  } = await execa(`git rev-parse --abbrev-ref HEAD`, { shell: true });
  console.log({ releaseChannel });

  const { writeFile, cp, rm } = await import('fs/promises');
  const releaseChannelTxt = path.resolve(
    process.env.PWD,
    'assets',
    'release_channel.txt'
  );
  console.log({ releaseChannelTxt });

  await writeFile(releaseChannelTxt, releaseChannel);

  const tar = await import('tar');

  const nodeModulesKit = path.resolve('node_modules', '@johnlindquist', 'kit');

  // Recusively copy the contents of the kit package into the assets folder

  console.log(`PWD`, process.env.PWD);
  const kitDir = path.resolve('.', 'assets', 'kit');
  const outTarz = path.resolve('.', 'assets', 'kit.tar.gz');

  console.log(`Tar ${kitDir} to ${outTarz}`);

  const { ensureDir } = await import('fs-extra');
  await ensureDir(kitDir);

  await cp(nodeModulesKit, kitDir, {
    recursive: true,
  });

  // Install the dependencies for the kit package
  chdir(kitDir);
  console.log(`cwd for yarn`, process.cwd());
  await execa(`yarn`, { shell: true });

  chdir(process.env.PWD);
  console.log(`cwd for tar`, process.cwd());

  await tar.c(
    {
      cwd: kitDir,
      gzip: true,
      file: outTarz,
      follow: true,
      filter: (item) => {
        // if (item.match(/^.{0,2}node/)) {
        //   console.log(`SKIPPING`, item);
        //   return false;
        // }
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

  const { default: download } = await import('download');

  await download(
    `https://github.com/johnlindquist/kenv/tarball/${releaseChannel}`,
    path.resolve(process.env.PWD, 'assets'),
    { filename: 'kenv.tar.gz' }
  );
};

go();
