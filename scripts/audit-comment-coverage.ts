/**
 * Comment Coverage Audit
 * ----------------------
 * Static check that every "comment / notes" field captured in the selection wizard
 * is propagated end-to-end:
 *   1. Wizard component payload (SelectionWizard.tsx)
 *   2. Edge function validation + DB insert (send-selections-email/index.ts)
 *   3. Admin HTML email body
 *   4. Admin CSV export
 *   5. HubSpot sync (sync-hubspot/index.ts)
 *   6. Admin submission PDF (submissionPdfGenerator.ts)
 *   7. Buyer-facing PDF (buyerPdfGenerator.ts)
 *
 * Run:  bun scripts/audit-comment-coverage.ts
 * Exits non-zero if any expected field is missing in any pipeline stage.
 */

import { readFileSync } from 'node:fs';

type Stage = {
  label: string;
  path: string;
  // For each comment field, which token MUST appear in the file
  // (camelCase for TS payloads, snake_case for DB / HubSpot)
  needles: Record<string, string[]>;
};

const COMMENT_FIELDS = [
  'lvpComments',
  'spcTileComments',
  'windowComments',
  'backsplashGroutComments',
  'salesComments',
  'upgradeComments',
  'upgradeInterestsNotes',
  'areaUpgradeComments', // per-area upgrade .comments
] as const;

const stages: Stage[] = [
  {
    label: 'Wizard payload',
    path: 'src/pages/SelectionWizard.tsx',
    needles: {
      lvpComments: ['lvpComments'],
      spcTileComments: ['spcTileComments'],
      windowComments: ['windowComments'],
      backsplashGroutComments: ['backsplashGroutComments', 'backsplashGrout.comments'],
      salesComments: ['salesComments'],
      upgradeComments: ['upgradeComments'],
      upgradeInterestsNotes: ['upgradeInterestsNotes'],
      areaUpgradeComments: ['areaUpgrades'],
    },
  },
  {
    label: 'Edge function (validation, DB insert, HubSpot payload, CSV, admin HTML)',
    path: 'supabase/functions/send-selections-email/index.ts',
    needles: {
      lvpComments: ['lvp_comments', 'lvpComments'],
      spcTileComments: ['spc_tile_comments', 'spcTileComments'],
      windowComments: ['window_comments', 'windowComments'],
      backsplashGroutComments: ['backsplash_grout_comments', 'backsplashGroutComments'],
      salesComments: ['sales_comments', 'salesComments'],
      upgradeComments: ['upgrade_comments', 'upgradeComments'],
      upgradeInterestsNotes: ['upgrade_interests_notes', 'upgradeInterestsNotes'],
      areaUpgradeComments: ['upgrade.comments', 'u.comments'],
    },
  },
  {
    label: 'HubSpot sync',
    path: 'supabase/functions/sync-hubspot/index.ts',
    needles: {
      lvpComments: ['lvp_comments'],
      spcTileComments: ['spc_tile_comments'],
      windowComments: ['window_comments'],
      backsplashGroutComments: ['backsplash_grout_comments'],
      salesComments: ['sales_comments'],
      upgradeComments: ['upgrade_comments'],
      upgradeInterestsNotes: ['upgrade_interests_notes'],
      areaUpgradeComments: ['area_upgrades'],
    },
  },
  {
    label: 'Admin submission PDF',
    path: 'src/lib/submissionPdfGenerator.ts',
    needles: {
      lvpComments: ['lvp_comments'],
      spcTileComments: ['spc_tile_comments'],
      windowComments: ['window_comments'],
      backsplashGroutComments: ['backsplash_grout_comments'],
      salesComments: ['sales_comments'],
      upgradeComments: ['upgrade_comments'],
      upgradeInterestsNotes: ['upgrade_interests_notes'],
      areaUpgradeComments: ['u.comments'],
    },
  },
  {
    label: 'Buyer-facing PDF',
    path: 'src/lib/buyerPdfGenerator.ts',
    needles: {
      lvpComments: ['lvpComments'],
      spcTileComments: ['spcTileComments'],
      windowComments: ['windowComments'],
      backsplashGroutComments: ['backsplashGrout?.comments', 'backsplashGrout.comments'],
      salesComments: ['salesComments'],
      upgradeComments: ['upgradeComments'],
      upgradeInterestsNotes: ['upgradeInterestsNotes'],
      areaUpgradeComments: ['u.comments'],
    },
  },
];

let failures = 0;
const report: string[] = [];

for (const stage of stages) {
  const src = readFileSync(stage.path, 'utf8');
  for (const field of COMMENT_FIELDS) {
    const needles = stage.needles[field] ?? [];
    const found = needles.some(n => src.includes(n));
    if (!found) {
      failures++;
      report.push(`❌ ${stage.label} (${stage.path}) is missing "${field}" — looked for: ${needles.join(' | ')}`);
    } else {
      report.push(`✅ ${stage.label}: ${field}`);
    }
  }
}

console.log(report.join('\n'));
console.log('\n----------');
if (failures === 0) {
  console.log('✅ All comment fields are wired end-to-end.');
  process.exit(0);
} else {
  console.log(`❌ ${failures} coverage gap(s) found. See above.`);
  process.exit(1);
}
