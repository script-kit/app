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

const pnpmUninstallCommand = optionalDependenciesToRemove.map((dep) => `pnpm remove ${dep}`).join(' && ');

console.log(
  `BEFORE`,
  JSON.stringify({
    pkg: pkg.optionalDependencies,
    optionalDependenciesToSet: optionalDependenciesToKeep,
    optionalDependenciesToRemove,
  }),
);

console.log(`UNINSTALL COMMAND`, pnpmUninstallCommand);

await exec(pnpmUninstallCommand);
