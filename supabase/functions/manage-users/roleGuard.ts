// Task 16 fix round 1: never strand the portal without an admin. Removing `admin` from yourself, or from the last
// admin, is refused (409). Pure; tested in scripts/manage-users-role-guard.test.ts.
export interface RoleChange {
  role: string;
  roleAction: string;
  targetUserId: string;
  callerId: string;
  /** user_ids currently holding the admin role. */
  adminIds: readonly string[];
}

export function adminRemovalRefusal(c: RoleChange): string | null {
  if (c.roleAction !== 'remove' || c.role !== 'admin') return null;
  if (c.targetUserId === c.callerId) return 'You cannot remove your own admin role';
  const remaining = c.adminIds.filter((id) => id !== c.targetUserId);
  if (c.adminIds.includes(c.targetUserId) && remaining.length === 0) return 'Cannot remove the last admin';
  return null;
}
