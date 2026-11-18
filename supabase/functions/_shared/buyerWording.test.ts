// Deno tests: `deno test supabase/functions/_shared/`. No-op under bun (mirror: scripts/buyer-pdf-selections.test.ts).
import { toBuyerWording } from './buyerWording.ts';
const denoTest = (globalThis as { Deno?: { test: (n: string, f: () => void) => void } }).Deno?.test;
const eq = (a: unknown, e: unknown) => { if (a !== e) throw new Error(`expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`); };
if (denoTest) {
  denoTest('masterBedroom engine labels render as Primary Bedroom', () => {
    eq(toBuyerWording('Master Bedroom (Carpet) (Premium Carpet)'), 'Primary Bedroom (Carpet) (Premium Carpet)');
    eq(toBuyerWording('Heated Floor (Master Bedroom, Master Bedroom)'), 'Heated Floor (Primary Bedroom, Primary Bedroom)');
  });
  denoTest('strings without the phrase pass through unchanged', () => {
    eq(toBuyerWording('Guest Bathroom — Porcelain Tile'), 'Guest Bathroom — Porcelain Tile');
    eq(toBuyerWording(''), '');
  });
}
