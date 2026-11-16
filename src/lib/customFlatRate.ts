// Admin-defined flat-rate items stored in pricing_config under `custom_flat_*` keys.
// Staff enter the price INCLUDING GST; we store the pre-GST cost, and the global
// markup is applied on top like other marked-up catalog pricing.
export const CUSTOM_FLAT_PREFIX = 'custom_flat_';
export const isCustomFlatKey = (key: string) => key.startsWith(CUSTOM_FLAT_PREFIX);
const r2 = (n: number) => Math.round(n * 100) / 100;
export const costFromGstInclusive = (enteredInclGst: number, gstRate: number) => r2((Number(enteredInclGst) || 0) / (1 + gstRate));
export const gstInclusiveFromCost = (cost: number, gstRate: number) => r2((Number(cost) || 0) * (1 + gstRate));
/** Client price before GST (markup applied). */
export const clientPriceExGst = (cost: number, markup: number) => r2((Number(cost) || 0) * (1 + markup));
/** Client price including GST (markup + GST applied). */
export const clientPriceInclGst = (cost: number, markup: number, gstRate: number) => r2(clientPriceExGst(cost, markup) * (1 + gstRate));
export const customFlatKey = (name: string) =>
  `${CUSTOM_FLAT_PREFIX}${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40)}_${Date.now().toString(36)}_price`;
