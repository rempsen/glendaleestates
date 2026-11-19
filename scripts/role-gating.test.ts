// Phase 2 Task 16 (spec §6.9): the staff role end to end. Pure permission map (routes × roles, nav), the edge gate
// authorizeStaffOrAdmin, which edge functions use which gate, and that pricing / users / QBO / settings RLS stays admin-only.
import { test, expect, describe } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  ADMIN_ROUTES, NAV_ITEMS, canAccess, navItemsFor, resolveRole, routeRequiresAdmin, type AppRole,
} from '../src/lib/rolePermissions';
import { authorizeInternalOrAdmin, authorizeStaffOrAdmin } from '../supabase/functions/_shared/internalAuth';

const ROOT = join(import.meta.dir, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

// Expected access per route: S = staff and admin, A = admin only. Clients and signed-out users never reach /admin.
const EXPECTED: Record<string, 'S' | 'A'> = {
  '/admin': 'S',
  '/admin/quotes': 'S',
  '/admin/quotes/:id': 'S',
  '/admin/pricing-queue': 'S',
  '/admin/submissions': 'S',
  '/admin/submissions/:id/console': 'S',
  '/admin/homes': 'S',
  '/admin/reports': 'S',
  '/admin/export': 'S',
  '/admin/pipeline': 'A',               // sales_pipeline RLS is admin-only
  '/admin/sales-analytics': 'A',        // reads sales_pipeline
  '/admin/project-management': 'A',     // submission_payments / line_items / suppliers RLS is admin-only
  '/admin/pricing': 'A',
  '/admin/users': 'A',
  '/admin/email-preview': 'A',          // send-selections-email admin preview path
  '/admin/settings/quickbooks': 'A',
  '/admin/settings/notifications': 'A', // portal_settings RLS is admin-only
};

describe('route × role', () => {
  test('the map covers exactly the expected routes', () => {
    expect(Object.keys(ADMIN_ROUTES).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  for (const [route, who] of Object.entries(EXPECTED)) {
    test(`${route}: admin yes, staff ${who === 'S' ? 'yes' : 'no'}, client/none no`, () => {
      expect(canAccess(route, 'admin')).toBe(true);
      expect(canAccess(route, 'staff')).toBe(who === 'S');
      expect(canAccess(route, 'client')).toBe(false);
      expect(canAccess(route, null)).toBe(false);
      expect(routeRequiresAdmin(route)).toBe(who === 'A');
    });
  }

  test('concrete pathnames match their patterns', () => {
    expect(canAccess('/admin/quotes/7b1c2d', 'staff')).toBe(true);
    expect(canAccess('/admin/submissions/7b1c2d/console', 'staff')).toBe(true);
    expect(canAccess('/admin/pricing/', 'staff')).toBe(false);
    expect(canAccess('/admin/pricing', 'admin')).toBe(true);
  });

  test('unknown admin routes fail closed for staff', () => {
    expect(canAccess('/admin/something-new', 'staff')).toBe(false);
    expect(canAccess('/admin/something-new', 'admin')).toBe(true);
    expect(routeRequiresAdmin('/admin/something-new')).toBe(true);
    expect(canAccess('/admin/quotes/a/b', 'staff')).toBe(false);
  });

  test('every admin route in App.tsx is classified and uses the map', () => {
    const app = read('src/App.tsx');
    const paths = [...app.matchAll(/<Route path="(\/admin[^"]*)"/g)].map((m) => m[1]);
    expect(paths.sort()).toEqual(Object.keys(EXPECTED).sort());
    for (const p of paths) {
      const line = app.split('\n').find((l) => l.includes(`<Route path="${p}"`)) ?? '';
      expect(line).toContain(`<ProtectedRoute requireAdmin={routeRequiresAdmin('${p}')}>`);
    }
    // Buyer pages keep their own gates.
    expect(app).toContain('<Route path="/my-quote" element={<BuyerRoute><MyQuote /></BuyerRoute>} />');
    expect(app).toContain('<Route path="/select" element={<SelectionWizard />} />');
  });
});

describe('nav', () => {
  const paths = (r: AppRole | null) => navItemsFor(r).map((i) => i.path);
  test('admin sees every item, in order', () => {
    expect(paths('admin')).toEqual(NAV_ITEMS.map((i) => i.path));
    expect(paths('admin')).toContain('/admin/pricing');
  });
  test('staff: no Pricing Control, Users, QuickBooks, Notifications, PM, Pipeline, Analytics, Email Preview', () => {
    expect(paths('staff')).toEqual([
      '/admin/quotes', '/admin/pricing-queue', '/admin', '/admin/submissions', '/admin/homes', '/admin/reports', '/admin/export',
    ]);
    const labels = navItemsFor('staff').map((i) => i.label);
    for (const hidden of ['Pricing Control', 'User Management', 'QuickBooks', 'Notifications']) expect(labels).not.toContain(hidden);
  });
  test('client and signed-out see nothing', () => {
    expect(navItemsFor('client')).toEqual([]);
    expect(navItemsFor(null)).toEqual([]);
  });
  test('every nav item points at a classified route', () => {
    for (const i of NAV_ITEMS) expect(Object.keys(ADMIN_ROUTES)).toContain(i.path);
  });
  test('AdminLayout renders navItemsFor(role), not a local list', () => {
    const src = read('src/components/AdminLayout.tsx');
    expect(src).toContain('navItemsFor(');
    expect(src).not.toContain("label: 'Pricing Control'");
  });
});

describe('resolveRole', () => {
  test('admin wins, then staff, else client; signed out is null', () => {
    expect(resolveRole(['staff', 'admin'], true)).toBe('admin');
    expect(resolveRole(['staff'], true)).toBe('staff');
    expect(resolveRole(['user'], true)).toBe('client');
    expect(resolveRole([], true)).toBe('client');
    expect(resolveRole(['admin'], false)).toBeNull();
  });
});

describe('authorizeStaffOrAdmin', () => {
  const KEY = 'service-role-key';
  const env = { serviceRoleKey: KEY };
  const getUser = async (jwt: string) =>
    jwt === 'admin-jwt' ? { email: 'dan@bmdmaterials.com', isAdmin: true, isStaff: true, id: 'a1' }
    : jwt === 'staff-jwt' ? { email: 'noni@bmdmaterials.com', isStaff: true, id: 's1' }
    : jwt === 'buyer-jwt' ? { email: 'buyer@example.com', id: 'b1' } : null;
  const req = (h: Record<string, string>) => ({ headers: { get: (n: string) => h[n] ?? null } });
  const bearer = (t: string) => req({ Authorization: `Bearer ${t}` });

  test('admin ok', async () => {
    expect(await authorizeStaffOrAdmin(bearer('admin-jwt'), env, getUser)).toEqual({ ok: true, kind: 'admin', email: 'dan@bmdmaterials.com', userId: 'a1' });
  });
  test('staff ok', async () => {
    expect(await authorizeStaffOrAdmin(bearer('staff-jwt'), env, getUser)).toEqual({ ok: true, kind: 'staff', email: 'noni@bmdmaterials.com', userId: 's1' });
  });
  test('client (buyer) JWT 403', async () => {
    expect(await authorizeStaffOrAdmin(bearer('buyer-jwt'), env, getUser)).toEqual({ ok: false, status: 403 });
  });
  test('no JWT / anon / bad JWT 401', async () => {
    expect(await authorizeStaffOrAdmin(req({}), env, getUser)).toEqual({ ok: false, status: 401 });
    expect(await authorizeStaffOrAdmin(bearer('anon-key'), env, getUser)).toEqual({ ok: false, status: 401 });
    const throws = async () => { throw new Error('gotrue down'); };
    expect(await authorizeStaffOrAdmin(bearer('x'), env, throws)).toEqual({ ok: false, status: 401 });
  });
  test('service key and x-internal-secret still pass (server-to-server callers)', async () => {
    expect(await authorizeStaffOrAdmin(bearer(KEY), env, getUser)).toEqual({ ok: true, kind: 'service' });
    expect(await authorizeStaffOrAdmin(req({ 'x-internal-secret': KEY }), env, getUser)).toEqual({ ok: true, kind: 'internal' });
  });
  test('authorizeInternalOrAdmin stays admin-only for staff', async () => {
    expect(await authorizeInternalOrAdmin(bearer('staff-jwt'), env, getUser)).toEqual({ ok: false, status: 401 });
  });
});

describe('edge function gates', () => {
  const fn = (name: string) => read(`supabase/functions/${name}/index.ts`);
  for (const name of ['send-for-signature', 'resend-confirmation-email', 'resend-corrected-summary', 'sync-hubspot']) {
    test(`${name} accepts staff via authorizeStaffOrAdmin`, () => {
      expect(fn(name)).toContain('authorizeStaffOrAdmin(');
    });
  }
  for (const name of ['qbo-sync-submission', 'qbo-oauth-start', 'qbo-list-accounts', 'qbo-disconnect', 'manage-users', 'summarize-upgrade-requests', 'notify-pricing-request', 'audit-pricing-consistency']) {
    test(`${name} stays admin-only`, () => {
      const src = fn(name);
      expect(src).not.toContain('authorizeStaffOrAdmin');
      expect(src).not.toContain('allowStaff');
      expect(src).not.toMatch(/isStaff|role=in\.\(admin,staff\)|'staff'/);
    });
  }
  test('no function uses the removed allowStaff option', () => {
    for (const d of readdirSync(join(ROOT, 'supabase/functions'))) {
      if (d.startsWith('_')) continue;
      let src = '';
      try { src = fn(d); } catch { continue; }
      expect(src).not.toContain('allowStaff');
    }
  });
});

describe('RLS: pricing, users, QBO, settings stay admin-only', () => {
  const sql = [
    ...readdirSync(join(ROOT, 'supabase/migrations')).map((f) => read(`supabase/migrations/${f}`)),
    ...readdirSync(join(ROOT, 'drizzle/migrations')).filter((f) => f.endsWith('.sql')).map((f) => read(`drizzle/migrations/${f}`)),
  ].join('\n');
  const policies = [...sql.matchAll(/CREATE POLICY[\s\S]*?;/g)].map((m) => m[0]);
  const ADMIN_TABLES = ['pricing_config', 'upgrade_materials', 'upgrade_line_items', 'user_roles', 'qbo_connections', 'qbo_entity_map', 'qbo_sync_log', 'qbo_settings', 'portal_settings'];
  for (const t of ADMIN_TABLES) {
    test(`${t}: no policy grants is_staff, and every write policy is has_role admin`, () => {
      const mine = policies.filter((p) => new RegExp(`ON public\\.${t}\\b`).test(p));
      for (const p of mine) {
        expect(p).not.toContain('is_staff');
        if (/FOR (INSERT|UPDATE|DELETE|ALL)/.test(p)) expect(p).toMatch(/has_role\(auth\.uid\(\), 'admin'/);
      }
    });
  }
});

describe('RLS: staff edits are audited (0014)', () => {
  const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
  const all = squash([
    ...readdirSync(join(ROOT, 'supabase/migrations')).map((f) => read(`supabase/migrations/${f}`)),
    ...readdirSync(join(ROOT, 'drizzle/migrations')).filter((f) => f.endsWith('.sql')).map((f) => read(`drizzle/migrations/${f}`)),
  ].join('\n'));
  test('staff SELECT and own-row INSERT (never the pricing dedupe claim) on submission_audit_logs', () => {
    expect(all).toContain('CREATE POLICY "Staff view audit logs" ON public.submission_audit_logs FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));');
    expect(all).toContain('CREATE POLICY "Staff add audit logs" ON public.submission_audit_logs FOR INSERT TO authenticated '
      + "WITH CHECK (public.is_staff(auth.uid()) AND changed_by_user_id = auth.uid() AND action_type <> 'pricing_request_notified');");
  });
  test('admin audit policies still exist and nothing drops them', () => {
    expect(all).toContain('CREATE POLICY "Admins can view all audit logs" ON public.submission_audit_logs');
    expect(all).toContain('CREATE POLICY "Admins can insert audit logs" ON public.submission_audit_logs');
    expect(all).not.toMatch(/DROP POLICY (IF EXISTS )?"Admins can (view all|insert) audit logs"/);
  });
  test('createAuditLog stamps changed_by_user_id with the signed-in user (satisfies the WITH CHECK)', () => {
    expect(read('src/lib/auditLog.ts')).toContain('changed_by_user_id: user?.id ||');
  });
});

describe('Submissions bulk delete is admin-only and honest', () => {
  test('summarizeBulkDelete counts returned rows, not the selection', async () => {
    const { summarizeBulkDelete } = await import('../src/lib/bulkDelete');
    expect(summarizeBulkDelete(['a', 'b'], [])).toMatchObject({ kind: 'none' });
    expect(summarizeBulkDelete(['a', 'b'], null).deletedIds.size).toBe(0);
    const partial = summarizeBulkDelete(['a', 'b'], [{ id: 'a' }]);
    expect(partial.kind).toBe('partial');
    expect([...partial.deletedIds]).toEqual(['a']);
    expect(summarizeBulkDelete(['a', 'b'], [{ id: 'a' }, { id: 'b' }])).toMatchObject({ kind: 'success', message: 'Deleted 2 submission(s)' });
    expect(summarizeBulkDelete(['a'], [{ id: 'zzz' }]).kind).toBe('none');
  });
  test('AdminSubmissions renders Delete and its dialog only for admins and selects the deleted ids', () => {
    const src = read('src/pages/AdminSubmissions.tsx');
    expect(src).toContain('{isAdmin && selectedIds.size > 0 && (');
    expect(src).toContain('{isAdmin && <AlertDialog open={deleteDialogOpen}');
    expect(src).toMatch(/\.delete\(\)\s*\.in\('id', requested\)\s*\.select\('id'\)/);
    expect(src).toContain('summarizeBulkDelete(requested, data)');
    expect(src).not.toContain('toast.success(`Deleted ${selectedIds.size} submission(s)`)');
  });
});

describe('useRole never caches a failed lookup', () => {
  test('queryFn throws on error; isError resolves to client', () => {
    const src = read('src/hooks/useRole.ts');
    expect(src).toMatch(/if \(error\) \{[\s\S]*?throw error;/);
    expect(src).not.toMatch(/if \(error\) \{[^}]*return \[\];/);
    expect(src).toContain('q.isError ? []');
  });
});
