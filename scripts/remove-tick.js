import '@johnlindquist/kit';

console.log(`Removing tick 🐞`);

await global.replace({
  files: ['src/main.dev.ts'],
  from: './tick',
  to: './no-tick',
});
