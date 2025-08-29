import { debounce } from 'lodash-es';

export type FlushPayload = string | Buffer;

export class OutputAggregator {
  private isBinary: boolean;
  private flushMs: number;
  private onFlush: (payload: FlushPayload) => void;

  private str: string = '';
  private bufs: Buffer[] = [];
  private len = 0;
  private schedule: (() => void) | null = null;

  constructor({ binary, flushMs, onFlush }: { binary: boolean; flushMs: number; onFlush: (p: FlushPayload) => void }) {
    this.isBinary = binary;
    this.flushMs = Math.max(0, flushMs | 0);
    this.onFlush = onFlush;

    // Prepare debounced flusher
    this.schedule = debounce(() => this.flushNow(), this.flushMs, { leading: false, trailing: true });
  }

  push(data: string | Buffer) {
    if (this.isBinary) {
      const d = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
      this.bufs.push(d);
      this.len += d.length;
    } else {
      this.str += typeof data === 'string' ? data : data.toString('utf8');
    }
    this.schedule?.();
  }

  flushNow() {
    try {
      if (this.isBinary) {
        if (this.len === 0) return;
        const b = Buffer.concat(this.bufs, this.len);
        this.onFlush(b);
      } else {
        if (!this.str) return;
        this.onFlush(this.str);
      }
    } finally {
      // reset
      this.str = '';
      this.bufs = [];
      this.len = 0;
    }
  }

  dispose() {
    if (this.schedule as any) {
      (this.schedule as any).cancel?.();
    }
    this.flushNow();
  }
}

