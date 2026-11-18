// Render-time buyer wording for strings produced by the pricing engine (which keeps its internal names).
// Mirrors toBuyerWording in src/lib/outputLabels.ts (bun mirror test: scripts/buyer-pdf-selections.test.ts).
export const toBuyerWording = (s: string): string => s.replace(/Master Bedroom/g, 'Primary Bedroom');
