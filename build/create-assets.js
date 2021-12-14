const go = async () => {
  const { execa } = await import('execa');
  const { stdout: releaseChannel } = await execa(
    `git rev-parse --abbrev-ref HEAD`,
    { shell: true }
  );
  console.log({ releaseChannel });

  const { writeFile } = await import('fs/promises');
  await writeFile('./assets/release_channel.txt', releaseChannel);

  const { chdir } = await import('process');

  const tar = await import('tar');

  const path = await import('path');
  const { homedir } = await import('os');
  const kitPath = (...pathParts) =>
    path.resolve(
      process.env.KIT || path.resolve(homedir(), '.kit'),
      ...pathParts
    );

  await tar.c(
    {
      gzip: true,
      file: './assets/kit.tar.gz',
      filter: (item) => {
        if (item.includes('node')) return false;
        if (item.includes('kit.sock')) return false;

        return true;
      },
    },
    ['./node_modules/@johnlindquist/kit']
  );

  const { default: download } = await import('download');

  await download(
    `https://github.com/johnlindquist/kenv/tarball/${releaseChannel}`,
    `./assets`,
    { filename: 'kenv.tar.gz' }
  );
};

go();
