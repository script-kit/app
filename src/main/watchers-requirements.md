# File Watching Requirements

### Be SPECIFIC

_Only_ watch the the directories and files mentioned. If you try to watch the entire kenvPath/kitPath or use a hi, you'll end up watching node_motules, logs, etc, so it's critical we only watch exactly what we need.


## Root Directories
There are two root directories that need to be watched:
1. `kenvPath()` - The Kit Environment path
2. `kitPath()` - The Kit SDK path

## KenvPath Watching Requirements

### Core Directories
The following directories in the root kenvPath need to be watched for all file changes (add/remove/change/etc):
- `scripts/*`
- `snippets/*`
- `scriptlets/*`

for example:
```
kenvPath('scripts', 'my-script.ts')
```

### Kenvs Directory Structure
- Location: `kenvPath('kenvs')`
- Each kenv is a modular environment inside the kenvs directory
- Structure for each kenv:
  ```
  kenvPath('kenvs')
    └── {kenv_name}
        ├── scripts/*
        ├── snippets/*
        └── scriptlets/*
  ```

for example, a "kenv" named "my-kenv":
```
kenvPath('kenvs', 'my-kenv', 'scripts', 'my-script.ts')    
```

### Dynamic Kenv Watching
The `kenvPath('kenvs')` directory requires special watching behavior:

1. Watch the kenvs directory itself for:
   - New kenv directories being added (`addDir` event)
   - Existing kenv directories being removed (`unlinkDir` event)

2. When a new kenv directory is added:
   - Set up new watchers for that kenv's:
     - `scripts/*`
     - `snippets/*`
     - `scriptlets/*`
   - These new watchers should monitor all the standard events (add/change/unlink etc)

3. When a kenv directory is removed:
   - Clean up/remove all watchers associated with that kenv's:
     - `scripts/*`
     - `snippets/*`
     - `scriptlets/*`

4. Initial setup:
   - On startup, scan `kenvPath('kenvs')` for existing kenvs
   - Set up watchers for each existing kenv's directories

- All files in these subdirectories need to be watched for changes

### Individual Files
The following files in kenvPath need to be watched:
- `.env` (and any `.env.*` variants)
- `globals.ts`
- `package.json`

## KitPath Watching Requirements

### Individual Files
The following files need to be watched:
- `ping.txt` kitPath("ping.txt") 
- `run.txt` kitPath("run.txt")
- `db/user.json` kitPath("db", "user.json")
- `db/scripts.json` kitPath("db", "scripts.json")

It should be fine to watche the entire "kitPath("db")" directory

## Watch Event Types
All watched paths should monitor for these events:
- `add` - File/directory creation
- `addDir` - Directory creation
- `change` - File modifications
- `unlink` - File deletion
- `unlinkDir` - Directory deletion


Chokidar Weekly downloads
Minimal and efficient cross-platform file watching library

Why?
There are many reasons to prefer Chokidar to raw fs.watch / fs.watchFile in 2024:

Events are properly reported
macOS events report filenames
events are not reported twice
changes are reported as add / change / unlink instead of useless rename
Atomic writes are supported, using atomic option
Some file editors use them
Chunked writes are supported, using awaitWriteFinish option
Large files are commonly written in chunks
File / dir filtering is supported
Symbolic links are supported
Recursive watching is always supported, instead of partial when using raw events
Includes a way to limit recursion depth
Chokidar relies on the Node.js core fs module, but when using fs.watch and fs.watchFile for watching, it normalizes the events it receives, often checking for truth by getting file stats and/or dir contents. The fs.watch-based implementation is the default, which avoids polling and keeps CPU usage down. Be advised that chokidar will initiate watchers recursively for everything within scope of the paths that have been specified, so be judicious about not wasting system resources by watching much more than needed. For some cases, fs.watchFile, which utilizes polling and uses more resources, is used.

Made for Brunch in 2012, it is now used in ~30 million repositories and has proven itself in production environments.

Sep 2024 update: v4 is out! It decreases dependency count from 13 to 1, removes support for globs, adds support for ESM / Common.js modules, and bumps minimum node.js version from v8 to v14. Check out upgrading.

Getting started
Install with npm:

npm install chokidar
Use it in your code:

import chokidar from 'chokidar';

// One-liner for current directory
chokidar.watch('.').on('all', (event, path) => {
  console.log(event, path);
});


// Extended options
// ----------------

// Initialize watcher.
const watcher = chokidar.watch('file, dir, or array', {
  ignored: (path, stats) => stats?.isFile() && !path.endsWith('.js'), // only watch js files
  persistent: true
});

// Something to use when events are received.
const log = console.log.bind(console);
// Add event listeners.
watcher
  .on('add', path => log(`File ${path} has been added`))
  .on('change', path => log(`File ${path} has been changed`))
  .on('unlink', path => log(`File ${path} has been removed`));

// More possible events.
watcher
  .on('addDir', path => log(`Directory ${path} has been added`))
  .on('unlinkDir', path => log(`Directory ${path} has been removed`))
  .on('error', error => log(`Watcher error: ${error}`))
  .on('ready', () => log('Initial scan complete. Ready for changes'))
  .on('raw', (event, path, details) => { // internal
    log('Raw event info:', event, path, details);
  });

// 'add', 'addDir' and 'change' events also receive stat() results as second
// argument when available: https://nodejs.org/api/fs.html#fs_class_fs_stats
watcher.on('change', (path, stats) => {
  if (stats) console.log(`File ${path} changed size to ${stats.size}`);
});

// Watch new files.
watcher.add('new-file');
watcher.add(['new-file-2', 'new-file-3']);

// Get list of actual paths being watched on the filesystem
let watchedPaths = watcher.getWatched();

// Un-watch some files.
await watcher.unwatch('new-file');

// Stop watching. The method is async!
await watcher.close().then(() => console.log('closed'));

// Full list of options. See below for descriptions.
// Do not use this example!
chokidar.watch('file', {
  persistent: true,

  // ignore .txt files
  ignored: (file) => file.endsWith('.txt'),
  // watch only .txt files
  // ignored: (file, _stats) => _stats?.isFile() && !file.endsWith('.txt'),

  awaitWriteFinish: true, // emit single event when chunked writes are completed
  atomic: true, // emit proper events when "atomic writes" (mv _tmp file) are used

  // The options also allow specifying custom intervals in ms
  // awaitWriteFinish: {
  //   stabilityThreshold: 2000,
  //   pollInterval: 100
  // },
  // atomic: 100,

  interval: 100,
  binaryInterval: 300,

  cwd: '.',
  depth: 99,

  followSymlinks: true,
  ignoreInitial: false,
  ignorePermissionErrors: false,
  usePolling: false,
  alwaysStat: false,
});
chokidar.watch(paths, [options])

paths (string or array of strings). Paths to files, dirs to be watched recursively.
options (object) Options object as defined below:
Persistence
persistent (default: true). Indicates whether the process should continue to run as long as files are being watched.
Path filtering
ignored function, regex, or path. Defines files/paths to be ignored. The whole relative or absolute path is tested, not just filename. If a function with two arguments is provided, it gets called twice per path - once with a single argument (the path), second time with two arguments (the path and the fs.Stats object of that path).
ignoreInitial (default: false). If set to false then add/addDir events are also emitted for matching paths while instantiating the watching as chokidar discovers these file paths (before the ready event).
followSymlinks (default: true). When false, only the symlinks themselves will be watched for changes instead of following the link references and bubbling events through the link's path.
cwd (no default). The base directory from which watch paths are to be derived. Paths emitted with events will be relative to this.
Performance
usePolling (default: false). Whether to use fs.watchFile (backed by polling), or fs.watch. If polling leads to high CPU utilization, consider setting this to false. It is typically necessary to set this to true to successfully watch files over a network, and it may be necessary to successfully watch files in other non-standard situations. Setting to true explicitly on MacOS overrides the useFsEvents default. You may also set the CHOKIDAR_USEPOLLING env variable to true (1) or false (0) in order to override this option.
Polling-specific settings (effective when usePolling: true)
interval (default: 100). Interval of file system polling, in milliseconds. You may also set the CHOKIDAR_INTERVAL env variable to override this option.
binaryInterval (default: 300). Interval of file system polling for binary files. (see list of binary extensions)
alwaysStat (default: false). If relying upon the fs.Stats object that may get passed with add, addDir, and change events, set this to true to ensure it is provided even in cases where it wasn't already available from the underlying watch events.
depth (default: undefined). If set, limits how many levels of subdirectories will be traversed.
awaitWriteFinish (default: false). By default, the add event will fire when a file first appears on disk, before the entire file has been written. Furthermore, in some cases some change events will be emitted while the file is being written. In some cases, especially when watching for large files there will be a need to wait for the write operation to finish before responding to a file creation or modification. Setting awaitWriteFinish to true (or a truthy value) will poll file size, holding its add and change events until the size does not change for a configurable amount of time. The appropriate duration setting is heavily dependent on the OS and hardware. For accurate detection this parameter should be relatively high, making file watching much less responsive. Use with caution.
options.awaitWriteFinish can be set to an object in order to adjust timing params:
awaitWriteFinish.stabilityThreshold (default: 2000). Amount of time in milliseconds for a file size to remain constant before emitting its event.
awaitWriteFinish.pollInterval (default: 100). File size polling interval, in milliseconds.
Errors
ignorePermissionErrors (default: false). Indicates whether to watch files that don't have read permissions if possible. If watching fails due to EPERM or EACCES with this set to true, the errors will be suppressed silently.
atomic (default: true if useFsEvents and usePolling are false). Automatically filters out artifacts that occur when using editors that use "atomic writes" instead of writing directly to the source file. If a file is re-added within 100 ms of being deleted, Chokidar emits a change event rather than unlink then add. If the default of 100 ms does not work well for you, you can override it by setting atomic to a custom value, in milliseconds.
Methods & Events
chokidar.watch() produces an instance of FSWatcher. Methods of FSWatcher:

.add(path / paths): Add files, directories for tracking. Takes an array of strings or just one string.
.on(event, callback): Listen for an FS event. Available events: add, addDir, change, unlink, unlinkDir, ready, raw, error. Additionally all is available which gets emitted with the underlying event name and path for every event other than ready, raw, and error. raw is internal, use it carefully.
.unwatch(path / paths): Stop watching files or directories. Takes an array of strings or just one string.
.close(): async Removes all listeners from watched files. Asynchronous, returns Promise. Use with await to ensure bugs don't happen.
.getWatched(): Returns an object representing all the paths on the file system being watched by this FSWatcher instance. The object's keys are all the directories (using absolute paths unless the cwd option was used), and the values are arrays of the names of the items contained in each directory.
CLI
Check out third party chokidar-cli, which allows to execute a command on each change, or get a stdio stream of change events.

Troubleshooting
Sometimes, Chokidar runs out of file handles, causing EMFILE and ENOSP errors:

bash: cannot set terminal process group (-1): Inappropriate ioctl for device bash: no job control in this shell
Error: watch /home/ ENOSPC
There are two things that can cause it.

Exhausted file handles for generic fs operations
Can be solved by using graceful-fs, which can monkey-patch native fs module used by chokidar: let fs = require('fs'); let grfs = require('graceful-fs'); grfs.gracefulify(fs);
Can also be solved by tuning OS: echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf && sudo sysctl -p.
Exhausted file handles for fs.watch
Can't seem to be solved by graceful-fs or OS tuning
It's possible to start using usePolling: true, which will switch backend to resource-intensive fs.watchFile
All fsevents-related issues (WARN optional dep failed, fsevents is not a constructor) are solved by upgrading to v4+.

Changelog
v4 (Sep 2024): remove glob support and bundled fsevents. Decrease dependency count from 13 to 1. Rewrite in typescript. Bumps minimum node.js requirement to v14+
v3 (Apr 2019): massive CPU & RAM consumption improvements; reduces deps / package size by a factor of 17x and bumps Node.js requirement to v8.16+.
v2 (Dec 2017): globs are now posix-style-only. Tons of bugfixes.
v1 (Apr 2015): glob support, symlink support, tons of bugfixes. Node 0.8+ is supported
v0.1 (Apr 2012): Initial release, extracted from Brunch
Upgrading
If you've used globs before and want do replicate the functionality with v4:

// v3
chok.watch('**/*.js');
chok.watch("./directory/**/*");

// v4
chok.watch('.', {
  ignored: (path, stats) => stats?.isFile() && !path.endsWith('.js'), // only watch js files
});
chok.watch('./directory');

// other way
import { glob } from 'node:fs/promises';
const watcher = watch(await Array.fromAsync(glob('**/*.js')));

// unwatching
// v3
chok.unwatch('**/*.js');
// v4
chok.unwatch(await glob('**/*.js'));
