// Task 8 fix round 1: header outputs name their audience; client copies never pass staff=true.
import { test, expect } from 'bun:test';
import { OUTPUT_ACTIONS, runOutputAction, type OutputAction, type Renderers } from '../src/lib/consoleActions';

function spy() {
  const calls: string[] = [];
  const r: Renderers = {
    pdf: async (id, save, staff) => { calls.push(`pdf(${id},save=${save},staff=${staff})`); return 'b64'; },
    word: async (id, staff) => { calls.push(`word(${id},staff=${staff})`); },
    showPdf: (b64) => { calls.push(`show(${b64})`); },
  };
  return { r, calls };
}
const run = async (a: OutputAction) => { const s = spy(); await runOutputAction(a, 'S1', s.r); return s.calls; };

test('each action asks for the right copy', async () => {
  expect(await run('preview')).toEqual(['pdf(S1,save=false,staff=false)', 'show(b64)']);
  expect(await run('word_client')).toEqual(['word(S1,staff=false)']);
  expect(await run('word_staff')).toEqual(['word(S1,staff=true)']);
  expect(await run('pdf_client')).toEqual(['pdf(S1,save=true,staff=false)']);
  expect(await run('pdf_staff')).toEqual(['pdf(S1,save=true,staff=true)']);
});

test('labels: staff copies say so, client ones never do; the table matches what runs', async () => {
  for (const a of OUTPUT_ACTIONS) {
    expect(a.label.includes('staff copy')).toBe(a.staff);
    const calls = await run(a.id);
    expect(calls.some((c) => c.includes('staff=true'))).toBe(a.staff);
  }
  expect(OUTPUT_ACTIONS.map((a) => a.label)).toContain('Word (staff copy)');
  expect(OUTPUT_ACTIONS.map((a) => a.label)).toContain('Word (client)');
});
