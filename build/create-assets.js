const go = async () => {
  const { chdir } = await import('process');
  const path = await import('path');

  console.log(`PWD`, process.env.PWD);
  chdir(process.env.PWD);

  const { execa } = await import('execa');
  const { stdout: releaseChannel } = await execa(
    `git rev-parse --abbrev-ref HEAD`,
    { shell: true }
  );
  console.log({ releaseChannel });

  const { writeFile } = await import('fs/promises');
  const releaseChannelTxt = path.resolve(
    process.env.PWD,
    'assets',
    'release_channel.txt'
  );
  console.log({ releaseChannelTxt });

  await writeFile(releaseChannelTxt, releaseChannel);

  const tar = await import('tar');

  const nodeModulesKit = path.resolve('node_modules', '@johnlindquist', 'kit');

  console.log({ nodeModulesKit });

  await tar.c(
    {
      cwd: nodeModulesKit,
      gzip: true,
      file: './assets/kit.tar.gz',
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

  const { default: download } = await import('download');

  await download(
    `https://github.com/johnlindquist/kenv/tarball/${releaseChannel}`,
    path.resolve(process.env.PWD, 'assets'),
    { filename: 'kenv.tar.gz' }
  );
};

go();
