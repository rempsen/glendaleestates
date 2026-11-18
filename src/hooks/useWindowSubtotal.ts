import { useCallback, useMemo } from 'react';
import type { Tables } from '@/integrations/supabase/types';
import { useDynamicPricing } from '@/hooks/useDynamicPricing';
import { pricingFromDynamic } from '@/lib/pricingFromDynamic';
import { windowSubtotalForRow } from '@/lib/windowSubtotal';

/** Returns `(row) => pre-GST window subtotal`, with the pricing object built once per pricing change. */
export function useWindowSubtotal() {
  const dynamic = useDynamicPricing();
  const pricing = useMemo(() => pricingFromDynamic(dynamic as never), [dynamic.loaded, dynamic.materials, dynamic.config]);
  return useCallback((row: Tables<'buyer_selections'>) => windowSubtotalForRow(row, pricing), [pricing]);
}
