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

  constructor(private opts: Required<TermCapture>) {
    if (opts.mode === "tail") {
      this.tail = new RingBuffer(opts.tailLines)
    }
  }

  push(chunk: string) {
    // Guard against null/undefined input
    if (!chunk) return
    
    const txt = this.opts.stripAnsi ? chunk.replace(ansiRegex(), '') : chunk
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
    if (this.opts.mode === "tail") return this.tail!.contents()
    return this.lines.join('')
  }
}