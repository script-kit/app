import { clipboard, NativeImage } from 'electron';
import { interval, merge } from 'rxjs';
import { distinctUntilChanged, map, share, tap } from 'rxjs/operators';
import { format } from 'date-fns';
import { writeFile, mkdir } from 'fs/promises';
import low from 'lowdb';
import FileSync from 'lowdb/adapters/FileSync';
import { existsSync } from 'fs';
import path from 'path';
import { kenvPath } from './helpers';

const tmpClipboardDir = kenvPath('tmp', 'clipboard');
(async () => {
  if (!existsSync(tmpClipboardDir)) {
    await mkdir(tmpClipboardDir);
  }
})();

const adapter = new FileSync(kenvPath('db', 'clipboard-history.json'));
const db = low(adapter);

db.defaults({ history: [] }).write();

const tick$ = interval(1000).pipe(share());

const clipboardText$ = tick$.pipe(
  map(() => clipboard.readText()),
  distinctUntilChanged()
);

let image: NativeImage | null = null;
const clipboardImage$ = tick$.pipe(
  tap(() => {
    image = clipboard.readImage();
  }),
  map(() => image?.toDataURL()),
  distinctUntilChanged(),
  map(() => image)
);

merge(clipboardText$, clipboardImage$).subscribe(async (textOrImage) => {
  let value = '';
  let type = '';
  const timestamp = format(new Date(), 'yyyy-MM-dd-hh-mm-ss');

  if (typeof textOrImage === 'string') {
    type = 'text';
    value = textOrImage;
  } else {
    type = 'image';
    value = path.join(tmpClipboardDir, `${timestamp}.png`);
    await writeFile(value, (textOrImage as NativeImage).toPNG());
  }

  db.update('history', (history) =>
    [{ value, type, timestamp }, ...history].slice(0, 50)
  ).write();
});
