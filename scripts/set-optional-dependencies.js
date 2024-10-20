console.log(
  `some of these packages successfully install,
  but then break the distribution,
  so we need to set them conditionally based on platform and architecture`,
);

const optionalDependencies = await readJson('optional-dependencies.json');
const pkg = await readJson('package.json');

const optionalDependenciesToKeep = optionalDependencies[process.platform][process.arch];
const optionalDependenciesToRemove = Object.keys(pkg.optionalDependencies).filter(
  (dep) => !optionalDependenciesToKeep.includes(dep),
);

const command = `pnpm remove ${optionalDependenciesToRemove.join(' ')}`;

console.log(
  `BEFORE`,
  JSON.stringify({
    pkg: pkg.optionalDependencies,
    optionalDependenciesToKeep,
    optionalDependenciesToRemove,
  }),
);

console.log(`UNINSTALL COMMAND`, command);

if (optionalDependenciesToRemove.length > 0) {
  const { stdout, stderr } = await exec(command);
  console.log({
    stdout,
    stderr,
  });
}
