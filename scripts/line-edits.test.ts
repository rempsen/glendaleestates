// Task 8 fix round 1: pending lines carry no amount; under review / deferred keep their client reason.
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { applyStatusChange, priceEditPatch, clientNoteEdit, provisionalEdit } from '../src/lib/lineEdits';

const line = (over: Record<string, unknown> = {}) => ({
  status: 'upgrade' as const, quantity: 2, unit_price: 100, amount: 200, pricing_mode: 'catalog' as const, client_note: null, ...over,
}) as Parameters<typeof applyStatusChange>[0];

describe('applyStatusChange', () => {
  test('→ pending clears the amount', () => {
    expect(applyStatusChange(line(), 'pending')).toEqual({ ok: true, patch: { status: 'pending', amount: null } });
  });
  test('→ under_review needs a reason and stores it as the client note', () => {
    expect(applyStatusChange(line(), 'under_review', '').ok).toBe(false);
    expect(applyStatusChange(line(), 'under_review', ' Checking count ')).toEqual({
      ok: true, patch: { status: 'under_review', client_note: 'Checking count' },
    });
  });
  test('→ upgrade / included leave amount and note alone', () => {
    expect(applyStatusChange(line({ status: 'deferred', amount: 500 }), 'upgrade')).toEqual({ ok: true, patch: { status: 'upgrade' } });
    expect(applyStatusChange(line(), 'included')).toEqual({ ok: true, patch: { status: 'included' } });
  });
  test('→ removed is refused', () => {
    expect(applyStatusChange(line(), 'removed').ok).toBe(false);
  });
});

describe('fix round 2: leaving pending restores the amount', () => {
  test('pending → upgrade with qty and unit price: amount = qty × unit price', () => {
    expect(applyStatusChange(line({ status: 'pending', amount: null, quantity: 3, unit_price: 112.5 }), 'upgrade'))
      .toEqual({ ok: true, patch: { status: 'upgrade', amount: 337.5 } });
  });
  test('pending → upgrade with no qty / unit price: amount stays null (cell becomes editable)', () => {
    expect(applyStatusChange(line({ status: 'pending', amount: null, quantity: null, unit_price: null }), 'upgrade'))
      .toEqual({ ok: true, patch: { status: 'upgrade', amount: null } });
    expect(applyStatusChange(line({ status: 'pending', amount: null, quantity: 2, unit_price: null }), 'upgrade'))
      .toEqual({ ok: true, patch: { status: 'upgrade', amount: null } });
  });
  test('pending → included: amount 0', () => {
    expect(applyStatusChange(line({ status: 'pending', amount: null }), 'included')).toEqual({ ok: true, patch: { status: 'included', amount: 0 } });
  });
  test('pending → under_review / deferred: reason plus restored amount (shown as not in total)', () => {
    expect(applyStatusChange(line({ status: 'pending', amount: null, quantity: 1, unit_price: 840 }), 'deferred', 'After possession'))
      .toEqual({ ok: true, patch: { status: 'deferred', client_note: 'After possession', amount: 840 } });
  });
  test('after leaving pending, a typed amount is accepted again', () => {
    const priced = line({ status: 'upgrade', amount: null, quantity: null, unit_price: null });
    expect(priceEditPatch(priced, { amount: 1005 })).toEqual({ ok: true, patch: { amount: 1005, pricing_mode: 'manual' } });
  });
  test('LineRow locks the amount cell on status, not on a null amount', () => {
    const src = readFileSync(new URL('../src/components/quote/LineRow.tsx', import.meta.url), 'utf8');
    expect(src).toContain("const pending = line.status === 'pending';");
    expect(src).toMatch(/\{computed \|\| included \|\| pending \? \(/);
    expect(src).not.toMatch(/\{[^}]*amount == null \? \(/);
  });
});

describe('priceEditPatch', () => {
  test('upgrade: qty recomputes the amount', () => {
    expect(priceEditPatch(line(), { quantity: 3 })).toEqual({ ok: true, patch: { quantity: 3, amount: 300 } });
  });
  test('upgrade: unit price recomputes and switches to manual pricing', () => {
    expect(priceEditPatch(line(), { unit_price: 50 })).toEqual({ ok: true, patch: { unit_price: 50, amount: 100, pricing_mode: 'manual' } });
  });
  test('pending: qty and unit price never produce an amount', () => {
    const p = line({ status: 'pending', amount: null });
    expect(priceEditPatch(p, { quantity: 3 })).toEqual({ ok: true, patch: { quantity: 3 } });
    expect(priceEditPatch(p, { unit_price: 50 })).toEqual({ ok: true, patch: { unit_price: 50, pricing_mode: 'manual' } });
  });
  test('pending: typing an amount is refused', () => {
    expect(priceEditPatch(line({ status: 'pending', amount: null }), { amount: 500 }).ok).toBe(false);
  });
  test('upgrade: a typed amount is kept', () => {
    expect(priceEditPatch(line({ quantity: null }), { amount: 1005 })).toEqual({ ok: true, patch: { amount: 1005, pricing_mode: 'manual' } });
  });
});

describe('clientNoteEdit', () => {
  test('blank note refused on under_review / deferred', () => {
    expect(clientNoteEdit(line({ status: 'under_review', client_note: 'x' }), '  ').ok).toBe(false);
    expect(clientNoteEdit(line({ status: 'deferred', client_note: 'x' }), '').ok).toBe(false);
  });
  test('edits allowed otherwise; blank clears', () => {
    expect(clientNoteEdit(line({ status: 'under_review' }), ' new reason ')).toEqual({ ok: true, patch: { client_note: 'new reason' } });
    expect(clientNoteEdit(line(), '')).toEqual({ ok: true, patch: { client_note: null } });
  });
});

describe('provisional toggle (Task 18 fix round 1)', () => {
  test('clearing a provisional line patches only the flag; a no-op toggle patches nothing', () => {
    expect(provisionalEdit({ provisional: true }, false)).toEqual({ ok: true, patch: { provisional: false } });
    expect(provisionalEdit({ provisional: false }, true)).toEqual({ ok: true, patch: { provisional: true } });
    expect(provisionalEdit({ provisional: false }, false)).toEqual({ ok: true, patch: {} });
  });
  test('LineRow exposes the toggle through provisionalEdit', () => {
    const src = readFileSync(new URL('../src/components/quote/LineRow.tsx', import.meta.url), 'utf8');
    expect(src).toContain('aria-label="Provisional"');
    expect(src).toContain('provisionalEdit(line, c === true)');
  });
});
