import { clipboard } from 'electron';
import { interval, merge } from 'rxjs';
import { distinct, distinctUntilChanged, map, share } from 'rxjs/operators';

const tick$ = interval(1000).pipe(share());

const clipboardText$ = tick$.pipe(
  map(() => clipboard.readText()),
  distinctUntilChanged()
);

const clipboardImage$ = tick$.pipe(
  map(() => clipboard.readImage().toDataURL()),
  distinctUntilChanged()
);

merge(clipboardText$, clipboardImage$).subscribe((value) => {
  console.log(value.slice(0, 20));
});
