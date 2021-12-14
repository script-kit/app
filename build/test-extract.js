const extractTar = async (tarFile, outDir) => {
  const tar = await import('tar');
  await import('@johnlindquist/kit/api/global');
  console.log(`Extracting ${tarFile} to ${outDir}`);
  await ensureDir(outDir);

  await tar.x({
    file: tarFile,
    C: outDir,
    strip: 1,
  });
};

const go = async () => {
  await import('@johnlindquist/kit/api/global');

  await trash(home('junk'));
  await ensureDir(home('junk'));
  await extractTar('./assets/kit.tar.gz', home('junk'));
};

go();
