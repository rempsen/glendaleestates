// Admin-defined flat-rate items stored in pricing_config under `custom_flat_*` keys.
// Like all flat-rate pricing, the stored value is the customer-facing price:
// already marked up, excluding GST. GST is added on top; no further markup.
import { withGst } from '@/lib/quoteLines';

export const CUSTOM_FLAT_PREFIX = 'custom_flat_';
export const isCustomFlatKey = (key: string) => key.startsWith(CUSTOM_FLAT_PREFIX);
const r2 = (n: number) => Math.round(n * 100) / 100;
export const gstInclusiveFromCost = (clientPrice: number, gstRate: number) => r2(withGst(Number(clientPrice) || 0, gstRate));
export const customFlatKey = (name: string) =>
  `${CUSTOM_FLAT_PREFIX}${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40)}_${Date.now().toString(36)}_price`;
