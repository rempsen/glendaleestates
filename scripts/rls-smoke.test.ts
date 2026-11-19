// Final fix wave I5: the RLS smoke runner is wired up and refuses anything but a local Supabase. It is NOT run here
// (no Docker in CI / the sandbox); see scripts/rls-smoke/README.md.
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isLocal } from './rls-smoke/run';

test('only localhost / 127.0.0.1 targets are accepted', () => {
  expect(isLocal('http://127.0.0.1:54321')).toBe(true);
  expect(isLocal('http://localhost:54321/')).toBe(true);
  expect(isLocal('postgresql://postgres:postgres@127.0.0.1:54322/postgres')).toBe(true);
  expect(isLocal('https://adtbjnwaxmxhyjkjxqoz.supabase.co')).toBe(false);
  expect(isLocal('postgresql://postgres:pw@db.adtbjnwaxmxhyjkjxqoz.supabase.co:5432/postgres')).toBe(false);
  expect(isLocal('http://127.0.0.1.evil.test:54321')).toBe(false);
});

test('bun run rls-smoke is defined and the runbook runs it before the staff grant', () => {
  const pkg = JSON.parse(readFileSync(join(import.meta.dir, '../package.json'), 'utf8'));
  expect(pkg.scripts['rls-smoke']).toBe('bun scripts/rls-smoke/run.ts');
  const runbook = readFileSync(join(import.meta.dir, '../docs/deploy/phase2-runbook.md'), 'utf8');
  const smoke = runbook.indexOf('bun run rls-smoke');
  expect(smoke).toBeGreaterThan(runbook.indexOf('## 8. Noni as staff'));
  expect(smoke).toBeLessThan(runbook.indexOf("SELECT id, 'staff' FROM auth.users"));
});
