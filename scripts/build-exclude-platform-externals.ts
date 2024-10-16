import { external } from './src/main/shims';

console.log('Building with config');
try {
  const uninstallDeps = external();
  console.log(`Excluding external dependencies from package.json: ${uninstallDeps.join(', ')}`);
  if (uninstallDeps.length > 0) {
    const packageJson = await readJSON('./package.json');
    for (const dep of uninstallDeps) {
      // Remove the dep from the package.json optionalDependencies
      console.log(`Removing ${dep} from package.json`);
      delete packageJson.optionalDependencies[dep];
    }
    await writeJSON('./package.json', packageJson, {
      spaces: 2,
    });

    console.log('Updated package.json optionalDependencies', {
      optionalDependencies: packageJson.optionalDependencies,
    });
  }
} catch (e) {
  console.error('Build failed', e);
  process.exit(1);
}
