import ansiRegex from 'ansi-regex'

export type CaptureMode = "full" | "tail" | "selection" | "sentinel" | "none"

export interface TermCapture {
  mode?: CaptureMode
  tailLines?: number
  stripAnsi?: boolean
  sentinelStart?: string
  sentinelEnd?: string
}

class RingBuffer<T> {
  private buf: T[] = []
  constructor(private size: number) {}
  push(x: T) {
    if (this.size <= 0) return  // Don't store anything if size is 0
    if (this.buf.length === this.size) this.buf.shift()
    this.buf.push(x)
  }
  contents() { return this.buf.join('\n') }
}

export class TranscriptBuilder {
  private lines: string[] = []
  private tail?: RingBuffer<string>
  private inBlock = false
  private totalPushed = 0

  constructor(private opts: Required<TermCapture>) {
    if (opts.mode === "tail") {
      this.tail = new RingBuffer(opts.tailLines)
    }
    console.log('[TranscriptBuilder] Initialized with options:', {
      mode: opts.mode,
      tailLines: opts.tailLines,
      stripAnsi: opts.stripAnsi,
      sentinelStart: opts.sentinelStart,
      sentinelEnd: opts.sentinelEnd
    });
  }

  push(chunk: string) {
    // Guard against null/undefined input
    if (!chunk) return
    
    this.totalPushed++;
    const txt = this.opts.stripAnsi ? chunk.replace(ansiRegex(), '') : chunk
    
    if (this.totalPushed <= 5) {
      console.log(`[TranscriptBuilder] push #${this.totalPushed}:`, {
        mode: this.opts.mode,
        chunkLength: chunk.length,
        processedLength: txt.length,
        first50: txt.substring(0, 50).replace(/\n/g, '\\n').replace(/\r/g, '\\r')
      });
    }
    
    switch (this.opts.mode) {
      case "none":
        return
      case "full":
      case "selection":        // keep everything; filter later
        this.lines.push(txt);  return
      case "tail":
        this.tail!.push(txt);  return
      case "sentinel":
        this.handleSentinel(txt); return
    }
  }

  private handleSentinel(line: string) {
    const { sentinelStart:s, sentinelEnd:e } = this.opts
    // Keep the original line endings
    const lines = line.split(/(\r?\n)/)
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]
      if (l.includes(s)) {
        this.inBlock = true
      } else if (l.includes(e)) {
        this.inBlock = false
      } else if (this.inBlock && l.trim()) {
        // Include the line and its line ending if it exists
        this.lines.push(l)
        if (i + 1 < lines.length && lines[i + 1].match(/^\r?\n$/)) {
          this.lines.push(lines[i + 1])
          i++ // Skip the line ending in the next iteration
        }
      }
    }
  }

  result(): string {
    let result: string;
    if (this.opts.mode === "tail") {
      result = this.tail!.contents()
    } else {
      result = this.lines.join('')
    }
    
    console.log('[TranscriptBuilder] result() called:', {
      mode: this.opts.mode,
      totalPushed: this.totalPushed,
      linesCount: this.lines.length,
      resultLength: result.length,
      first100: result.substring(0, 100).replace(/\n/g, '\\n').replace(/\r/g, '\\r')
    });
    
    return result
  }
}