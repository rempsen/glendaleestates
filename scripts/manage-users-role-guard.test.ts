// Task 16 fix round 1: manage-users updateRole refuses to remove your own admin role or the last admin.
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { adminRemovalRefusal } from '../supabase/functions/manage-users/roleGuard';

const base = { role: 'admin', roleAction: 'remove', callerId: 'dan', adminIds: ['dan', 'brian'] };

test('self removal refused', () => {
  expect(adminRemovalRefusal({ ...base, targetUserId: 'dan' })).toBe('You cannot remove your own admin role');
});
test('last admin refused', () => {
  expect(adminRemovalRefusal({ ...base, callerId: 'svc', targetUserId: 'dan', adminIds: ['dan'] })).toBe('Cannot remove the last admin');
});
test('removing another admin while one remains is allowed', () => {
  expect(adminRemovalRefusal({ ...base, targetUserId: 'brian' })).toBeNull();
});
test('add, and staff removal, are never refused', () => {
  expect(adminRemovalRefusal({ ...base, roleAction: 'add', targetUserId: 'dan' })).toBeNull();
  expect(adminRemovalRefusal({ ...base, role: 'staff', targetUserId: 'dan' })).toBeNull();
});
test('index checks the guard before deleting and answers 409', () => {
  const src = readFileSync(join(import.meta.dir, '../supabase/functions/manage-users/index.ts'), 'utf8');
  const guard = src.indexOf('adminRemovalRefusal({');
  expect(guard).toBeGreaterThan(-1);
  expect(guard).toBeLessThan(src.indexOf('.from("user_roles")\n            .delete()'));
  expect(src).toContain('status: 409');
});
