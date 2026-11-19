// Phase 2 Task 16: the signed-in user's portal role ('admin' | 'staff' | 'client' | null when signed out).
// Reads the caller's own user_roles rows (RLS: users read their own roles); cached per user by react-query so
// ProtectedRoute, AdminLayout and pages share one lookup. A failed lookup resolves to 'client' (fail closed).
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { resolveRole, type AppRole } from '@/lib/rolePermissions';

export function useRole(): { role: AppRole | null; loading: boolean; isAdmin: boolean; isStaff: boolean } {
  const { user, loading: authLoading } = useAuth();
  const q = useQuery({
    queryKey: ['user-role', user?.id ?? null],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.from('user_roles').select('role').eq('user_id', user!.id);
      if (error) {
        console.error('Error checking role:', error);
        return [];
      }
      return (data ?? []).map((r) => String(r.role));
    },
  });
  const loading = authLoading || (!!user && q.isPending);
  const role = loading ? null : resolveRole(q.data ?? [], !!user);
  return { role, loading, isAdmin: role === 'admin', isStaff: role === 'admin' || role === 'staff' };
}
