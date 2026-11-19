// Edge/generator mirror of the colour option names in src/lib/mockData.ts (lvpOptions, spcTileOptions, carpetOptions
// and OPTION_ALIASES), so the import-free generator can resolve stored colour ids ("venatino-auguste",
// "winterbrooke-898", legacy "venatino") to the names Phase 1's resolveOptionName printed. Names only, no prices.
// scripts/renderer-lines-parity.test.ts proves this resolves every id, name and alias exactly as resolveOptionName.
// Dependency-free (runs under Deno, bun and Vite).

/** Option id → display name (lvpOptions, spcTileOptions, carpetOptions). */
export const OPTION_NAMES: Readonly<Record<string, string>> = {
  'cortland': 'Cortland', 'opal': 'Opal', 'wolf-river': 'Wolf River',
  'pezzo': 'Pezzo', 'piccolo': 'Piccolo', 'venatino-auguste': 'Venatino Auguste',
  'winterbrooke-898': 'Winterbrooke 898', 'midnight-shadow-427': 'Midnight Shadow 427',
  'jet-stream-200': 'Jet Stream 200', 'sawgrass-701': 'Sawgrass 701',
};

/** Legacy / alternate names staff use (normalised key → option id), as OPTION_ALIASES in mockData.ts. */
export const OPTION_ALIASES: Readonly<Record<string, string>> = {
  venatinopolished: 'venatino-auguste', venatino: 'venatino-auguste', pezzogrey: 'pezzo', piccolowhite: 'piccolo',
  winterbrooke: 'winterbrooke-898', midnight: 'midnight-shadow-427', midnightshadow: 'midnight-shadow-427',
  jetstream: 'jet-stream-200', sawgrass: 'sawgrass-701',
};

/** Normalisation used by toOptionId: lowercase, alphanumerics only. */
export const colourKey = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * `GenerateInput.colourNames`: normalised key (id, name or alias) → display name. Lookup is
 * `COLOUR_NAMES[colourKey(value)]`; unknown values are kept as typed (as resolveOptionName does).
 */
export const COLOUR_NAMES: Readonly<Record<string, string>> = (() => {
  const out: Record<string, string> = {};
  for (const [id, name] of Object.entries(OPTION_NAMES)) { out[colourKey(id)] = name; out[colourKey(name)] = name; }
  for (const [alias, id] of Object.entries(OPTION_ALIASES)) out[alias] = OPTION_NAMES[id];
  return out;
})();
