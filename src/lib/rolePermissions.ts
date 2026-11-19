// Phase 2 Task 16 (spec §6.9): the one permission map for the admin area. Pure; tested in scripts/role-gating.test.ts.
// `staff` (Noni) gets the console, quotes, pricing queue, submissions and read views; `admin` keeps everything.
// A route is open to staff only when the data it reads is staff-readable under RLS (0006: buyer_selections, profiles,
// quote_lines, documents, reviews). Pricing Control, users, QuickBooks and settings stay admin-only, as do pages whose
// tables are admin-only RLS (sales_pipeline, submission_payments / line_items / suppliers). Unknown routes fail closed.

export type AppRole = 'admin' | 'staff' | 'client';
export type RouteAccess = 'staff' | 'admin';

/** Route pattern (as in src/App.tsx) → lowest role allowed. Every /admin route must be listed (test-enforced). */
export const ADMIN_ROUTES: Record<string, RouteAccess> = {
  '/admin': 'staff',
  '/admin/quotes': 'staff',
  '/admin/quotes/:id': 'staff',
  '/admin/pricing-queue': 'staff',
  '/admin/submissions': 'staff',
  '/admin/submissions/:id/console': 'staff',
  '/admin/homes': 'staff',
  '/admin/reports': 'staff',
  '/admin/export': 'staff',
  '/admin/pipeline': 'admin',
  '/admin/sales-analytics': 'admin',
  '/admin/project-management': 'admin',
  '/admin/pricing': 'admin',
  '/admin/users': 'admin',
  '/admin/email-preview': 'admin',
  '/admin/settings/quickbooks': 'admin',
  '/admin/settings/notifications': 'admin',
};

export interface NavItem { label: string; path: string }

/** Admin sidebar, in display order. AdminLayout adds icons by path. */
export const NAV_ITEMS: NavItem[] = [
  { label: 'Quotes', path: '/admin/quotes' },
  { label: 'Pricing queue', path: '/admin/pricing-queue' },
  { label: 'Dashboard', path: '/admin' },
  { label: 'Pipeline', path: '/admin/pipeline' },
  { label: 'Submissions', path: '/admin/submissions' },
  { label: 'All Homes', path: '/admin/homes' },
  { label: 'Project Management', path: '/admin/project-management' },
  { label: 'Sales Analytics', path: '/admin/sales-analytics' },
  { label: 'Reports', path: '/admin/reports' },
  { label: 'Export', path: '/admin/export' },
  { label: 'Pricing Control', path: '/admin/pricing' },
  { label: 'User Management', path: '/admin/users' },
  { label: 'Email Preview', path: '/admin/email-preview' },
  { label: 'QuickBooks', path: '/admin/settings/quickbooks' },
  { label: 'Notifications', path: '/admin/settings/notifications' },
];

function matches(pattern: string, path: string): boolean {
  const a = pattern.split('/');
  const b = path.split('/');
  if (a.length !== b.length) return false;
  return a.every((seg, i) => (seg.startsWith(':') ? b[i] !== '' : seg === b[i]));
}

/** Access level for a route pattern or a concrete pathname; unknown routes are admin-only. */
export function routeAccess(route: string): RouteAccess {
  if (route in ADMIN_ROUTES) return ADMIN_ROUTES[route];
  for (const [pattern, access] of Object.entries(ADMIN_ROUTES)) if (matches(pattern, route)) return access;
  return 'admin';
}

export function routeRequiresAdmin(route: string): boolean {
  return routeAccess(route) === 'admin';
}

export function canAccess(route: string, role: AppRole | null): boolean {
  if (role === 'admin') return true;
  if (role === 'staff') return routeAccess(route) === 'staff';
  return false;
}

export function navItemsFor(role: AppRole | null): NavItem[] {
  return NAV_ITEMS.filter((i) => canAccess(i.path, role));
}

/** Highest role from the user's user_roles rows; any signed-in user without admin/staff is a client (buyer). */
export function resolveRole(roles: readonly string[], signedIn: boolean): AppRole | null {
  if (!signedIn) return null;
  if (roles.includes('admin')) return 'admin';
  if (roles.includes('staff')) return 'staff';
  return 'client';
}
