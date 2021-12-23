const go = async () => {
  let wd = process.cwd();
  const { execa } = await import('execa');
  let { chdir } = await import('process');

  const { writeFile } = await import('fs/promises');
  await writeFile('./assets/release_channel.txt', 'dev');

  const tar = await import('tar');

  const path = await import('path');
  const { homedir } = await import('os');
  const kitPath = (...pathParts) =>
    path.resolve(
      process.env.KIT || path.resolve(homedir(), '.kit'),
      ...pathParts
    );

  await execa('npm run build-kit', {
    cwd: path.resolve(homedir(), 'dev', 'kit'),
    shell: true,
  });

  await tar.c(
    {
      cwd: kitPath(),
      follow: true,
      gzip: true,
      file: './assets/kit.tar.gz',
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
    `https://github.com/johnlindquist/kenv/tarball/main`,
    `./assets`,
    { filename: 'kenv.tar.gz' }
  );
};

go();
