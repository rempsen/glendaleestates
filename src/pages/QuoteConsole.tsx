import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/AdminLayout';

// Placeholder: Task 8 replaces the body with the real quote console.
export default function QuoteConsole() {
  const { id } = useParams<{ id: string }>();
  const [unit, setUnit] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    supabase
      .from('buyer_selections')
      .select('unit_number')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => setUnit(data?.unit_number ?? null));
  }, [id]);

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold">Quote — Unit {unit ?? '…'}</h1>
      <p className="text-muted-foreground">Console coming in Task 8</p>
    </AdminLayout>
  );
}
