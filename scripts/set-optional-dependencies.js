console.log(
  `some of these packages successfully install,
  but then break the distribution,
  so we need to set them conditionally based on platform and architecture`,
);

const optionalDependencies = await readJson('optional-dependencies.json');
const pkg = await readJson('package.json');

console.log(`BEFORE`, {
  optionalDependencies,
  pkg,
});

const optionalDependenciesToSet = optionalDependencies[process.platform][process.arch];

console.log(`SET`, {
  optionalDependenciesToSet,
});

pkg.optionalDependencies = optionalDependenciesToSet;

await writeJson('package.json', pkg);

console.log(`AFTER`, {
  pkg,
});

await rm('pnpm-lock.yaml');
