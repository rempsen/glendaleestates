// send-selections-email's request-body → `buyer_selections` insert mapping, extracted (Phase 2 Task 9) so the wizard
// can build the exact row the server will insert (src/lib/generateInputFromSelections.ts `wizardSelectionsToRow`) and
// generate the same quote lines the server regenerates after the insert. Pure; no Deno/Node/browser globals.
// The edge function calls these two functions and nothing else for the insert payload.

// Area upgrade selection interface
export interface AreaUpgrade {
  areaId: string;
  materialType: string;
  productName: string;
  productColor: string;
  comments: string; // internal (staff only)
  clientComment?: string; // buyer-visible
  heatedFloor?: boolean;
  manualPrice?: number;
  manualPriceNote?: string;
}

// Document upload interface
export interface DocumentUpload {
  name: string;
  path: string;
  size: number;
  type: string;
  uploadedAt: string;
}

export interface SelectionData {
  unitNumber: string;
  unitType?: string | null;
  firstName: string;
  lastName: string;
  phoneNumber?: string | null;
  email: string;
  estimatedPossessionDate?: string | null;
  hasStairs: boolean;
  lvpColour?: string | null;
  lvpComments?: string | null;
  spcTileColour?: string | null;
  spcTileComments?: string | null;
  backsplashOrientation?: string | null;
  stairCarpetColour?: string | null;
  stairLvpUpgradeSelected?: boolean;
  stairPremiumCarpetSelected?: boolean;
  stairUpgradeType?: 'standard' | 'lvp' | 'premium_lvp' | null;
  bedroomFlooringChoice?: string | null;
  bedroomCarpetColour?: string | null;
  bedroomLvpColour?: string | null;
  bedroomLvpSameAsMain: boolean;
  additionalWindowsQty: number;
  patioDoorsQty: number;
  automatedWindowsQty: number;
  windowComments?: string | null;
  salesComments?: string | null;
  upgradeInterests: Record<string, boolean>;
  windowTotal: number;
  hardwoodUpgradeSelected?: boolean;
  bathroomTileSelected?: boolean;
  bathroomTileEnsuiteSelected?: boolean;
  bathroomTileGuestSelected?: boolean;
  heatedFloorBathrooms?: number;
  premiumCarpetBedroom?: boolean;
  /** Premium carpet style + colour as stored text (2026-11-26; columns from 0017). */
  premiumCarpetBedroomStyle?: string | null;
  premiumCarpetBedroomColour?: string | null;
  stairPremiumCarpetStyle?: string | null;
  stairPremiumCarpetColour?: string | null;
  premiumUnderpadBedroom?: boolean;
  premiumUnderpadStairs?: boolean;
  customTiledShower?: boolean;
  // New upgrade fields
  areaUpgrades?: AreaUpgrade[];
  upgradeFloorSelection?: string | null;
  backsplashGroutEnabled?: boolean;
  backsplashGroutColor?: string | null;
  backsplashGroutComments?: string | null;
  // Comments collected on Upgrade Pricing Summary and Upgrade Interests steps
  upgradeComments?: string | null;
  upgradeInterestsNotes?: string | null;
  // PDF for HubSpot
  pdfBase64?: string | null;
  // Document uploads
  documentUploads?: DocumentUpload[];
}

/** Largest `pdfBase64` forwarded to HubSpot (characters of base64; ~6 MB of PDF). Larger bodies are dropped, not refused. */
export const MAX_PDF_BASE64_CHARS = 8 * 1024 * 1024;

function parsePdfBase64(v: unknown): string | null {
  if (typeof v !== 'string' || v === '') return null;
  if (v.length > MAX_PDF_BASE64_CHARS) {
    console.warn(`[submit] pdfBase64 dropped: ${v.length} chars exceeds the ${MAX_PDF_BASE64_CHARS} cap; HubSpot gets no PDF for this submission`);
    return null;
  }
  return v;
}

/** Validated, clamped request body (the edge function's `data`). Mirrors the code that lived inline in index.ts. */
// deno-lint-ignore no-explicit-any
export function parseSelectionBody(rawData: Record<string, any>): SelectionData {
  // Parse area upgrades — preserve partial entries so buyer comments are never dropped.
  // An entry is kept if ANY meaningful field is present (areaId, materialType, productName,
  // productColor, comments, or heatedFloor). Missing identifiers are backfilled with a
  // stable placeholder so downstream rendering and HubSpot sync can still surface the note.
  let areaUpgrades: AreaUpgrade[] = [];
  if (Array.isArray(rawData.areaUpgrades)) {
    areaUpgrades = rawData.areaUpgrades
      .map((u: unknown, idx: number) => {
        const upgrade = (u && typeof u === 'object') ? u as Record<string, unknown> : {};
        const areaId = String(upgrade.areaId || '').trim();
        const materialType = String(upgrade.materialType || '').trim();
        const productName = String(upgrade.productName || '').trim().slice(0, 200);
        const productColor = String(upgrade.productColor || '').trim().slice(0, 100);
        const comments = String(upgrade.comments || '').trim().slice(0, 2000);
        const clientComment = String(upgrade.clientComment || '').trim().slice(0, 2000);
        const heatedFloor = Boolean(upgrade.heatedFloor);

        const hasAnyMeaningfulData =
          areaId !== '' ||
          materialType !== '' ||
          productName !== '' ||
          productColor !== '' ||
          comments !== '' ||
          clientComment !== '' ||
          heatedFloor === true;

        if (!hasAnyMeaningfulData) return null;

        return {
          areaId: areaId || `unspecified_area_${idx + 1}`,
          materialType: materialType || 'unspecified',
          productName,
          productColor,
          comments,
          ...(clientComment ? { clientComment } : {}),
          heatedFloor,
          ...(upgrade.manualPrice !== undefined && upgrade.manualPrice !== null && upgrade.manualPrice !== '' && Number.isFinite(Number(upgrade.manualPrice))
            ? { manualPrice: Number(upgrade.manualPrice) } : {}),
          ...(upgrade.manualPriceNote ? { manualPriceNote: String(upgrade.manualPriceNote).slice(0, 500) } : {}),
        } as AreaUpgrade;
      })
      .filter((u: AreaUpgrade | null): u is AreaUpgrade => u !== null);

    const droppedEmpty = (rawData.areaUpgrades as unknown[]).length - areaUpgrades.length;
    if (droppedEmpty > 0) {
      console.log(`[areaUpgrades] Dropped ${droppedEmpty} empty entries; kept ${areaUpgrades.length} (including any with comment-only data).`);
    }
  }

  const data: SelectionData = {
    unitNumber: String(rawData.unitNumber || '').trim().slice(0, 50),
    unitType: rawData.unitType ? String(rawData.unitType).trim().slice(0, 100) : null,
    firstName: String(rawData.firstName || '').trim().slice(0, 100),
    lastName: String(rawData.lastName || '').trim().slice(0, 100),
    phoneNumber: rawData.phoneNumber ? String(rawData.phoneNumber).trim().slice(0, 30) : null,
    email: String(rawData.email || '').trim().slice(0, 255),
    estimatedPossessionDate: rawData.estimatedPossessionDate ? String(rawData.estimatedPossessionDate).slice(0, 50) : null,
    hasStairs: Boolean(rawData.hasStairs),
    lvpColour: rawData.lvpColour ? String(rawData.lvpColour).trim().slice(0, 100) : null,
    lvpComments: rawData.lvpComments ? String(rawData.lvpComments).trim().slice(0, 2000) : null,
    spcTileColour: rawData.spcTileColour ? String(rawData.spcTileColour).trim().slice(0, 100) : null,
    spcTileComments: rawData.spcTileComments ? String(rawData.spcTileComments).trim().slice(0, 2000) : null,
    backsplashOrientation: rawData.backsplashOrientation ? String(rawData.backsplashOrientation).trim().slice(0, 100) : null,
    stairCarpetColour: rawData.stairCarpetColour ? String(rawData.stairCarpetColour).trim().slice(0, 100) : null,
    stairLvpUpgradeSelected: Boolean(rawData.stairLvpUpgradeSelected),
    stairPremiumCarpetSelected: Boolean(rawData.stairPremiumCarpetSelected),
    stairUpgradeType: rawData.stairUpgradeType ? String(rawData.stairUpgradeType).trim().slice(0, 20) as 'standard' | 'lvp' | 'premium_lvp' : null,
    premiumCarpetBedroom: Boolean(rawData.premiumCarpetBedroom),
    premiumCarpetBedroomStyle: shortText(rawData.premiumCarpetBedroomStyle),
    premiumCarpetBedroomColour: shortText(rawData.premiumCarpetBedroomColour),
    stairPremiumCarpetStyle: shortText(rawData.stairPremiumCarpetStyle),
    stairPremiumCarpetColour: shortText(rawData.stairPremiumCarpetColour),
    premiumUnderpadBedroom: Boolean(rawData.premiumUnderpadBedroom),
    premiumUnderpadStairs: Boolean(rawData.premiumUnderpadStairs),
    bedroomFlooringChoice: rawData.bedroomFlooringChoice ? String(rawData.bedroomFlooringChoice).trim().slice(0, 100) : null,
    bedroomCarpetColour: rawData.bedroomCarpetColour ? String(rawData.bedroomCarpetColour).trim().slice(0, 100) : null,
    bedroomLvpColour: rawData.bedroomLvpColour ? String(rawData.bedroomLvpColour).trim().slice(0, 100) : null,
    bedroomLvpSameAsMain: Boolean(rawData.bedroomLvpSameAsMain),
    additionalWindowsQty: Math.max(0, Math.min(100, Number(rawData.additionalWindowsQty) || 0)),
    patioDoorsQty: Math.max(0, Math.min(50, Number(rawData.patioDoorsQty) || 0)),
    automatedWindowsQty: Math.max(0, Math.min(50, Number(rawData.automatedWindowsQty) || 0)),
    windowComments: rawData.windowComments ? String(rawData.windowComments).trim().slice(0, 2000) : null,
    salesComments: rawData.salesComments ? String(rawData.salesComments).trim().slice(0, 5000) : null,
    upgradeInterests: typeof rawData.upgradeInterests === 'object' ? rawData.upgradeInterests : {},
    windowTotal: Math.max(0, Math.min(1000000, Number(rawData.windowTotal) || 0)),
    hardwoodUpgradeSelected: Boolean(rawData.hardwoodUpgradeSelected),
    bathroomTileSelected: Boolean(rawData.bathroomTileSelected),
    bathroomTileEnsuiteSelected: rawData.bathroomTileEnsuiteSelected !== undefined ? Boolean(rawData.bathroomTileEnsuiteSelected) : undefined,
    bathroomTileGuestSelected: rawData.bathroomTileGuestSelected !== undefined ? Boolean(rawData.bathroomTileGuestSelected) : undefined,
    heatedFloorBathrooms: Math.max(0, Math.min(10, Number(rawData.heatedFloorBathrooms) || 0)),
    customTiledShower: Boolean(rawData.customTiledShower),
    // New upgrade fields
    areaUpgrades: areaUpgrades,
    upgradeFloorSelection: rawData.upgradeFloorSelection ? String(rawData.upgradeFloorSelection).trim().slice(0, 10) : null,
    backsplashGroutEnabled: Boolean(rawData.backsplashGroutEnabled),
    backsplashGroutColor: rawData.backsplashGroutColor ? String(rawData.backsplashGroutColor).trim().slice(0, 100) : null,
    backsplashGroutComments: rawData.backsplashGroutComments ? String(rawData.backsplashGroutComments).trim().slice(0, 2000) : null,
    upgradeComments: rawData.upgradeComments ? String(rawData.upgradeComments).trim().slice(0, 5000) : null,
    upgradeInterestsNotes: rawData.upgradeInterestsNotes ? String(rawData.upgradeInterestsNotes).trim().slice(0, 5000) : null,
    // The buyer's PDF, forwarded to sync-hubspot (never stored on the row).
    pdfBase64: parsePdfBase64(rawData.pdfBase64),
    // Document uploads
    documentUploads: Array.isArray(rawData.documentUploads) ? rawData.documentUploads.map((doc: unknown) => {
      const d = doc as Record<string, unknown>;
      return {
        name: String(d.name || '').slice(0, 255),
        path: String(d.path || '').slice(0, 500),
        size: Number(d.size) || 0,
        type: String(d.type || '').slice(0, 100),
        uploadedAt: String(d.uploadedAt || new Date().toISOString()),
      };
    }) : [],
  };
  return data;
}

const shortText = (v: unknown): string | null => {
  const t = v === null || v === undefined ? '' : String(v).trim().slice(0, 100);
  return t || null;
};

/** The 0017 premium-carpet columns for a parsed body: present only when that upgrade is ticked and a style chosen. */
export function premiumCarpetColumns(data: SelectionData): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  const bedroom = !!data.premiumCarpetBedroom && data.bedroomFlooringChoice === 'carpet' && !!data.premiumCarpetBedroomStyle;
  if (bedroom) {
    out.premium_carpet_bedroom_style = data.premiumCarpetBedroomStyle || null;
    out.premium_carpet_bedroom_colour = data.premiumCarpetBedroomColour || null;
  }
  const stairs = !!data.stairPremiumCarpetSelected && !!data.stairPremiumCarpetStyle;
  if (stairs) {
    out.stair_premium_carpet_style = data.stairPremiumCarpetStyle || null;
    out.stair_premium_carpet_colour = data.stairPremiumCarpetColour || null;
  }
  return out;
}

/** The `buyer_selections` insert payload for a parsed body. */
export function buyerSelectionsInsertRow(data: SelectionData): Record<string, unknown> {
  return {
    unit_number: data.unitNumber,
    unit_type: data.unitType || null,
    first_name: data.firstName,
    last_name: data.lastName,
    phone_number: data.phoneNumber || null,
    email: data.email,
    estimated_possession_date: data.estimatedPossessionDate || null,
    has_stairs: data.hasStairs,
    lvp_colour: data.lvpColour || null,
    lvp_comments: data.lvpComments || null,
    spc_tile_colour: data.spcTileColour || null,
    spc_tile_comments: data.spcTileComments || null,
    backsplash_orientation: data.backsplashOrientation || null,
    stair_carpet_colour: data.stairCarpetColour || null,
    stair_lvp_upgrade_selected: data.stairLvpUpgradeSelected || false,
    stair_upgrade_type: data.stairUpgradeType || null,
    bedroom_flooring_choice: data.bedroomFlooringChoice || null,
    bedroom_carpet_colour: data.bedroomCarpetColour || null,
    bedroom_lvp_colour: data.bedroomLvpColour || null,
    bedroom_lvp_same_as_main: data.bedroomLvpSameAsMain,
    additional_windows_qty: data.additionalWindowsQty,
    patio_doors_qty: data.patioDoorsQty,
    window_total: data.windowTotal,
    window_comments: data.windowComments || null,
    sales_comments: data.salesComments || null,
    upgrade_interests: data.upgradeInterests,
    hardwood_upgrade_selected: data.hardwoodUpgradeSelected,
    bathroom_tile_selected: data.bathroomTileSelected,
    bathroom_tile_ensuite_selected: data.bathroomTileEnsuiteSelected ?? data.bathroomTileSelected,
    bathroom_tile_guest_selected: data.bathroomTileGuestSelected ?? data.bathroomTileSelected,
    heated_floor_bathrooms: data.heatedFloorBathrooms,
    // New upgrade fields
    area_upgrades: data.areaUpgrades,
    upgrade_floor_selection: data.upgradeFloorSelection,
    backsplash_grout_enabled: data.backsplashGroutEnabled,
    backsplash_grout_color: data.backsplashGroutColor,
    backsplash_grout_comments: data.backsplashGroutComments,
    premium_carpet_bedroom: data.premiumCarpetBedroom || false,
    premium_underpad_bedroom: data.premiumUnderpadBedroom || false,
    premium_underpad_stairs: data.premiumUnderpadStairs || false,
    stair_premium_carpet_selected: data.stairPremiumCarpetSelected || false,
    // Premium carpet style / colour (0017). Only written when chosen, and only for a ticked upgrade, so a submission
    // without a premium carpet inserts exactly the columns it did before 0017.
    ...premiumCarpetColumns(data),
    automated_windows_qty: data.automatedWindowsQty || 0,
    custom_tiled_shower: data.customTiledShower || false,
    document_uploads: data.documentUploads || [],
    upgrade_comments: data.upgradeComments || null,
    upgrade_interests_notes: data.upgradeInterestsNotes || null,
    status: "submitted",
  };
}
