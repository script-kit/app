const { homedir } = require('os');

const go = async () => {
  const { chdir } = await import('process');
  const path = await import('path');
  const fs = await import('fs-extra');

  console.log(`PWD`, process.env.PWD);
  chdir(process.env.PWD);

  const { execa } = await import('execa');
  const {
    stdout: releaseChannel,
  } = await execa(`git rev-parse --abbrev-ref HEAD`, { shell: true });
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

  // const nodeModulesKit = path.resolve(homedir(), '.kit');
  const nodeModulesKit = path.resolve('node_modules', '@johnlindquist', 'kit');
  const asssetsKit = path.resolve('./assets', 'kit');
  if (await fs.exists(asssetsKit)) {
    await fs.remove(asssetsKit);
  }
  await fs.ensureDir(asssetsKit);
  console.log({ nodeModulesKit, asssetsKit, d: path.dirname(asssetsKit) });

  await fs.copy(nodeModulesKit, asssetsKit, {
    recursive: true,
    overwrite: true,
    filter: (src, dest) => {
      if (
        src.endsWith('node') ||
        src.endsWith('node_modules' || src.endsWith('.sock'))
      ) {
        console.log(`SKIP`, src);
        return false;
      }
      return true;
    },
  });

  await execa(`cd ${asssetsKit} && npm install`, {
    shell: true,
    stdio: 'inherit',
    // env: {
    //   ...process.env,
    //   PATH:
    //     path.resolve(homedir(), '.kit', 'node', 'bin') +
    //     path.delimiter +
    //     process.env.PATH,
    // },
  });

  await tar.c(
    {
      cwd: asssetsKit,
      gzip: true,
      file: './assets/kit.tar.gz',
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

  const { default: download } = await import('download');

  await download(
    `https://github.com/johnlindquist/kenv/tarball/${releaseChannel}`,
    path.resolve(process.env.PWD, 'assets'),
    { filename: 'kenv.tar.gz' }
  );

  await fs.copy(`./node_modules/monaco-editor/min/vs`, `./assets`);
};

go();
