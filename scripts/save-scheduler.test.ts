// Task 6: per-id debounce + in-flight dedupe + flush, with injected fake timers.
import { test, expect, describe } from 'bun:test';
import { SaveScheduler } from '@/lib/saveScheduler';

function fakeTimers() {
  let now = 0;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    setTimeout: (fn: () => void, ms: number) => { const h = ++seq; timers.set(h, { at: now + ms, fn }); return h; },
    clearTimeout: (h: unknown) => { timers.delete(h as number); },
    advance(ms: number) {
      now += ms;
      for (const [h, t] of [...timers].sort((a, b) => a[1].at - b[1].at)) {
        if (t.at <= now) { timers.delete(h); t.fn(); }
      }
    },
    get pending() { return timers.size; },
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('SaveScheduler', () => {
  test('debounce coalesces 3 edits into 1 request', () => {
    const t = fakeTimers();
    const sent: string[] = [];
    const s = new SaveScheduler({ delayMs: 500, send: async (id) => { sent.push(id); }, setTimeout: t.setTimeout, clearTimeout: t.clearTimeout });
    s.schedule('a');
    t.advance(200);
    s.schedule('a');
    t.advance(200);
    s.schedule('a');
    t.advance(499);
    expect(sent).toEqual([]);
    t.advance(1);
    expect(sent).toEqual(['a']);
  });

  test('one timer per id: different ids do not reset each other', () => {
    const t = fakeTimers();
    const sent: string[] = [];
    const s = new SaveScheduler({ delayMs: 500, send: async (id) => { sent.push(id); }, setTimeout: t.setTimeout, clearTimeout: t.clearTimeout });
    s.schedule('a');
    t.advance(300);
    s.schedule('b');
    t.advance(200);
    expect(sent).toEqual(['a']);
    t.advance(300);
    expect(sent).toEqual(['a', 'b']);
  });

  test('an edit during an in-flight save of the same id is queued and sent after the ack', async () => {
    const t = fakeTimers();
    const sent: string[] = [];
    const gates: ReturnType<typeof deferred>[] = [];
    const s = new SaveScheduler({
      delayMs: 500, setTimeout: t.setTimeout, clearTimeout: t.clearTimeout,
      send: (id) => { sent.push(id); const d = deferred(); gates.push(d); return d.promise; },
    });
    s.schedule('a');
    t.advance(500);
    expect(sent).toEqual(['a']);
    s.schedule('a');
    t.advance(500); // timer fires while the first save is still in flight
    expect(sent).toEqual(['a']); // not sent concurrently
    expect(s.isInflight('a')).toBe(true);
    gates[0].resolve();
    await tick();
    expect(sent).toEqual(['a', 'a']);
    gates[1].resolve();
    await tick();
    expect(s.isIdle()).toBe(true);
  });

  test('flush sends pending timers immediately and awaits every in-flight save, including queued follow-ups', async () => {
    const t = fakeTimers();
    const sent: string[] = [];
    const gates: ReturnType<typeof deferred>[] = [];
    const s = new SaveScheduler({
      delayMs: 500, setTimeout: t.setTimeout, clearTimeout: t.clearTimeout,
      send: (id) => { sent.push(id); const d = deferred(); gates.push(d); return d.promise; },
    });
    s.schedule('a');
    t.advance(500); // a in flight
    s.schedule('a'); // a queued behind in-flight
    s.schedule('b'); // b pending timer
    let done = false;
    const p = s.flush().then(() => { done = true; });
    expect(t.pending).toBe(0);
    expect(sent).toEqual(['a', 'b']);
    await tick();
    expect(done).toBe(false);
    gates[0].resolve(); // first a acks → queued a goes out
    await tick();
    expect(sent).toEqual(['a', 'b', 'a']);
    expect(done).toBe(false);
    gates[1].resolve();
    await tick();
    expect(done).toBe(false); // second a still in flight
    gates[2].resolve();
    await p;
    expect(done).toBe(true);
    expect(s.isIdle()).toBe(true);
  });

  test('flush also sends extra ids that have no timer (e.g. restored after an error)', async () => {
    const t = fakeTimers();
    const sent: string[] = [];
    const s = new SaveScheduler({ delayMs: 500, send: async (id) => { sent.push(id); }, setTimeout: t.setTimeout, clearTimeout: t.clearTimeout });
    await s.flush(['x']);
    expect(sent).toEqual(['x']);
  });

  test('a rejecting send does not wedge the scheduler or reject flush', async () => {
    const t = fakeTimers();
    const s = new SaveScheduler({ delayMs: 500, send: async () => { throw new Error('boom'); }, setTimeout: t.setTimeout, clearTimeout: t.clearTimeout });
    s.schedule('a');
    await s.flush();
    expect(s.isIdle()).toBe(true);
  });

  test('cancel drops a pending timer; dispose clears all', () => {
    const t = fakeTimers();
    const sent: string[] = [];
    const s = new SaveScheduler({ delayMs: 500, send: async (id) => { sent.push(id); }, setTimeout: t.setTimeout, clearTimeout: t.clearTimeout });
    s.schedule('a');
    s.schedule('b');
    s.cancel('a');
    s.dispose();
    t.advance(1000);
    expect(sent).toEqual([]);
  });
});
