// Buyer-side route gate (Phase 2 Task 13). Buyer pages have no role check (any signed-in buyer); signed-out visitors go
// to /buyer-auth in sign-in mode and come back here. What a buyer can see is enforced in the database by the
// SECURITY DEFINER RPCs (email match), not by this component.
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { buyerAuthPath } from '@/lib/buyerNext';

export function BuyerRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!loading && !user) navigate(buyerAuthPath(location.pathname), { replace: true });
  }, [loading, user, navigate, location.pathname]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" aria-label="Loading" />
      </div>
    );
  }
  return <>{children}</>;
}
