// Per-id debounced save scheduling with in-flight dedupe and an awaitable flush. Timers are injected so it is testable.
//
// - schedule(id): (re)starts that id's debounce timer; one timer per id.
// - When a timer fires and the id is already saving, the id is queued and sent once the in-flight save settles.
// - flush(extraIds?): fires every pending timer now (plus extraIds), then resolves only when nothing is pending,
//   queued or in flight — including follow-up saves queued during the flush.
// - send(id) is expected to read the latest state for the id itself; a rejected send is swallowed (the caller
//   records errors in its own state) so the scheduler never wedges.

type Handle = unknown;

export interface SaveSchedulerOptions {
  delayMs: number;
  send: (id: string) => Promise<void>;
  setTimeout?: (fn: () => void, ms: number) => Handle;
  clearTimeout?: (h: Handle) => void;
}

export class SaveScheduler {
  private timers = new Map<string, Handle>();
  private inflight = new Map<string, Promise<void>>();
  private queued = new Set<string>();
  private disposed = false;
  private readonly setT: (fn: () => void, ms: number) => Handle;
  private readonly clearT: (h: Handle) => void;

  constructor(private readonly opts: SaveSchedulerOptions) {
    this.setT = opts.setTimeout ?? ((fn, ms) => globalThis.setTimeout(fn, ms));
    this.clearT = opts.clearTimeout ?? ((h) => globalThis.clearTimeout(h as ReturnType<typeof globalThis.setTimeout>));
  }

  schedule(id: string): void {
    if (this.disposed) return;
    this.cancel(id);
    this.timers.set(id, this.setT(() => { this.timers.delete(id); this.run(id); }, this.opts.delayMs));
  }

  cancel(id: string): void {
    const h = this.timers.get(id);
    if (h !== undefined) { this.clearT(h); this.timers.delete(id); }
    this.queued.delete(id);
  }

  isInflight(id: string): boolean { return this.inflight.has(id); }

  isIdle(): boolean { return !this.timers.size && !this.inflight.size && !this.queued.size; }

  async flush(extraIds: string[] = []): Promise<void> {
    const now = new Set<string>([...this.timers.keys(), ...extraIds]);
    for (const id of this.timers.keys()) this.clearT(this.timers.get(id));
    this.timers.clear();
    for (const id of now) this.run(id);
    // Queued follow-ups start inside run()'s settle handler, so keep awaiting until everything has drained.
    while (this.inflight.size || this.queued.size || this.timers.size) {
      if (this.timers.size) {
        for (const [id, h] of this.timers) { this.clearT(h); this.timers.delete(id); this.run(id); }
      }
      await Promise.all([...this.inflight.values()]);
    }
  }

  dispose(): void {
    for (const h of this.timers.values()) this.clearT(h);
    this.timers.clear();
    this.queued.clear();
    this.disposed = true;
  }

  private run(id: string): void {
    if (this.inflight.has(id)) { this.queued.add(id); return; }
    let p: Promise<void>;
    try {
      p = Promise.resolve(this.opts.send(id));
    } catch {
      p = Promise.resolve();
    }
    const settled = p.catch(() => undefined).then(() => {
      this.inflight.delete(id);
      if (this.queued.has(id)) {
        this.queued.delete(id);
        if (!this.disposed) this.run(id);
      }
    });
    this.inflight.set(id, settled);
  }
}
