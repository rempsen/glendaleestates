// =====================================================================
// SINGLE SOURCE OF TRUTH for upgrade pricing on the server.
//
// This file is the Deno/edge mirror of `src/lib/upgradeTotals.ts`.
// It MUST stay byte-for-byte equivalent in its math so that the UI,
// the buyer PDF, the admin email HTML, the buyer email HTML, and the
// CSV attachment can never drift apart again.
//
// Anything that emits pricing on the server (admin email body, buyer
// confirmation body, CSV attachment, admin preview) must read its line
// items, subtotals, GST, and grand total from `computeUpgradeTotalsServer()`
// — never re-derive prices inline.
//
// Informational-only selections (Premium Carpet (Bedrooms), Premium
// Underpad (Bedrooms), Premium Underpad (Stairs)) are intentionally
// OMITTED from the pricing rows. They remain available as Yes/No flags
// on the SelectionData object for non-pricing display.
// =====================================================================

export interface ServerAreaUpgrade {
  areaId: string;
  materialType: string;
  productName?: string;
  productColor?: string;
  comments?: string;
  heatedFloor?: boolean;
  manualPrice?: number | null;
  manualPriceNote?: string;
}


export interface ServerUnitArea {
  allLvp?: number;
  mainLiving?: number;
  secondBedroom?: number;
  masterBedroomLvp?: number;
  masterBedroom?: number;
  secondBedroomCarpet?: number;
  guestBathroom?: number;
  masterEnsuite?: number;
  laundry?: number;
  backsplash?: number;
  [key: string]: number | undefined;
}

export interface ServerPricing {
  materials: Record<string, number>;
  config: Record<string, number>;
  unitAreas: Record<string, ServerUnitArea>;
  markupPercentage: number;
  gstRate: number;
}

export interface ServerTotalsInput {
  unitTypeCode: string | null;
  upgradeFloorSelection?: string | null;
  areaUpgrades: ServerAreaUpgrade[];
  backsplashGroutEnabled?: boolean;
  backsplashGroutColor?: string | null;
  stairLvpUpgradeSelected?: boolean;
  stairPremiumCarpetSelected?: boolean;
  stairPremiumUnderpadSelected?: boolean;
  bedroomFlooringChoice?: 'carpet' | 'lvp' | string | null;
  bedroomPremiumCarpetSelected?: boolean;
  bedroomPremiumUnderpadSelected?: boolean;
  stairUpgradeType?: 'standard' | 'lvp' | 'premium_lvp' | null;
  additionalWindowsQty?: number;
  patioDoorsQty?: number;
  automatedWindowsQty?: number;
  bathroomTileSelected?: boolean;
  bathroomTileEnsuiteSelected?: boolean;
  bathroomTileGuestSelected?: boolean;
  heatedFloorBathrooms?: number;
  customTiledShower?: boolean;
  customPricing?: any;
}

type OvKey = 'stair' | 'grout' | 'bathroomTile' | 'heatedFloor' | 'customShower' | 'stairCarpet' | 'stairUnderpad' | 'bedroomCarpet' | 'bedroomUnderpad';

export interface ServerLineItem {
  group: 'stair' | 'grout' | 'window' | 'flooring' | 'bathroom' | 'custom';
  label: string;
  detail?: string;
  amount: number;
}

export interface ServerTotalsResult {
  windowSubtotal: number;
  upgradesSubtotal: number;
  grandSubtotal: number;
  gst: number;
  grandTotal: number;
  gstRate: number;
  markupPercentage: number;
  lineItems: ServerLineItem[];
  pieces: {
    stairLvp: number;
    stairCarpet: number;
    stairUnderpad: number;
    bedroomCarpet: number;
    bedroomUnderpad: number;
    bedroomCarpetSqyd: number;
    grout: number;
    windowAdditional: number;
    windowPatio: number;
    windowAutomation: number;
    flooringUpgrades: Array<{
      areaId: string;
      areaName: string;
      materialName: string;
      productName?: string;
      productColor?: string;
      amount: number;
      heatedFloorAmount: number;
    }>;
    bathroomTile: number;
    section4HeatedFloor: number;
    customShower: number;
    customItemsTotal: number;
    includedItems: Array<{ label: string; detail?: string; area?: string }>;
  };
  // Raw quantities used for transparency labels (server-side only — kept
  // out of the UI counterpart because the UI never displays sq ft).
  context: {
    bathroomGuestSqft: number;
    bathroomEnsuiteSqft: number;
    tileCostPerSqft: number;
    showerBaseCost: number;
    heatedFloorPerBathroom: number;
    additionalWindowPrice: number;
    patioDoorPrice: number;
    automatedMotorPrice: number;
    groutColorPrice: number;
  };
}

const AREA_NAMES: Record<string, string> = {
  mainLiving: 'Main Living Area',
  secondBedroom: 'Second Bedroom',
  masterBedroomLvp: 'Master Bedroom (LVP)',
  masterBedroom: 'Master Bedroom (Carpet)',
  secondBedroomCarpet: 'Second Bedroom Carpet',
  guestBathroom: 'Guest Bathroom',
  masterEnsuite: 'Master Ensuite',
  laundry: 'Laundry Room',
  backsplash: 'Kitchen Backsplash',
  allLvp: 'All Standard LVP Areas',
  stairs: 'Stairs',
};

const MATERIAL_NAMES: Record<string, string> = {
  lvp: 'Premium LVP',
  hardwood: 'Hardwood',
  lvt: 'Premium LVT',
  carpet: 'Premium Carpet',
  tile: 'Porcelain Tile',
  tiled_shower: 'Custom Tiled Shower',
  nonstandard_lvp: 'Non Standard LVP Color',
  nonstandard_lvt: 'Non Standard LVT Color',
  nonstandard_tile: 'Non Standard Tile Color',
  premium_carpet_underpad: 'Premium Underpad',
};

const AREA_FIELD_MAP: Record<string, string> = {
  allLvp: 'allLvp',
  mainLiving: 'mainLiving',
  secondBedroom: 'secondBedroom',
  masterBedroomLvp: 'masterBedroomLvp',
  masterBedroom: 'masterBedroom',
  secondBedroomCarpet: 'secondBedroomCarpet',
  masterBedroomCarpet: 'masterBedroom',
  guestBathroom: 'guestBathroom',
  masterEnsuite: 'masterEnsuite',
  laundry: 'laundry',
  backsplash: 'backsplash',
};

export function normalizeUnitTypeCode(unitType: string | null | undefined): string {
  if (!unitType) return '';
  const typeUpper = unitType.toUpperCase().trim();
  if (/^[A-J]$/.test(typeUpper)) return typeUpper;
  if (/^[GH]-[12]$/.test(typeUpper)) return typeUpper;
  const patterns = [
    /CORNER\s*UNIT\s*([A-J])/i,
    /UNIT\s*TYPE\s*([A-J])/i,
    /TYPE\s*([A-J])/i,
    /UNIT\s*([A-J])/i,
    /^([A-J])$/i,
  ];
  for (const p of patterns) {
    const m = typeUpper.match(p);
    if (m && m[1]) return m[1].toUpperCase();
  }
  return typeUpper;
}

function resolveUnitCode(
  unitTypeCode: string | null,
  floor: string | null | undefined,
  pricing: ServerPricing
): string | null {
  const normalized = normalizeUnitTypeCode(unitTypeCode);
  if (!normalized) return null;
  const upper = normalized.toUpperCase();
  if (upper.includes('-')) return upper;
  if (upper === 'G' || upper === 'H') {
    if (floor) return `${upper}-${floor}`;
    if (pricing.unitAreas[`${upper}-1`]) return `${upper}-1`;
    if (pricing.unitAreas[`${upper}-2`]) return `${upper}-2`;
  }
  return upper;
}

function getBathroomAreas(unitTypeCode: string | null, pricing: ServerPricing): { guest: number; ensuite: number } {
  if (!unitTypeCode) return { guest: 0, ensuite: 0 };
  const code = unitTypeCode.toUpperCase();
  if (code === 'G' || code === 'H') {
    const d1 = pricing.unitAreas[`${code}-1`];
    const d2 = pricing.unitAreas[`${code}-2`];
    return {
      guest: Math.max(d1?.guestBathroom || 0, d2?.guestBathroom || 0),
      ensuite: Math.max(d1?.masterEnsuite || 0, d2?.masterEnsuite || 0),
    };
  }
  const a = pricing.unitAreas[code];
  return { guest: a?.guestBathroom || 0, ensuite: a?.masterEnsuite || 0 };
}

export function computeUpgradeTotalsServer(
  input: ServerTotalsInput,
  pricing: ServerPricing
): ServerTotalsResult {
  // ---- Resolve scalars from the same config keys the UI uses ----
  const additionalWindowPrice = pricing.config['additional_window_price'] || 673.50;
  const patioDoorPrice = pricing.config['patio_door_price'] || 2347.80;
  const automatedMotorPrice = pricing.config['automated_motor_price'] || 495.00;
  const heatedFloorPerBathroom = pricing.config['heated_floor_per_bathroom'] || 1650.00;
  const stairLvpPrice = pricing.config['stair_lvp_upgrade_price'] || 2160.00;
  const stairPremiumLvpPrice = pricing.config['stair_premium_lvp_upgrade_price'] || 3145.00;
  const stairCarpetUpgradePrice = pricing.config['premium_carpet_stairs_price'] || 640.00;
  const stairUnderpadPrice = pricing.config['premium_underpad_stairs_price'] || 0;
  const groutColorPrice = pricing.config['grout_color_change_price'] || 300.00;

  const tileCostPerSqft = pricing.materials['tile'] || 0;
  const showerBaseCost = pricing.materials['tiled_shower'] || 0;

  const resolvedCode = resolveUnitCode(input.unitTypeCode, input.upgradeFloorSelection || null, pricing);
  const unitData = resolvedCode ? pricing.unitAreas[resolvedCode] : undefined;
  const sectionHeatedFloorCount = Number(input.heatedFloorBathrooms) || 0;

  const lineItems: ServerLineItem[] = [];
  const cp = (input.customPricing && typeof input.customPricing === 'object') ? input.customPricing : {};
  const overrides = (cp.overrides || {}) as Record<string, { amount?: number | null; label?: string }>;
  const ov = (k: OvKey, calc: number, active: boolean): number => {
    const o = overrides[k];
    if (!active || !o || o.amount === null || o.amount === undefined || String(o.amount) === '') return calc;
    const a = Number(o.amount);
    return Number.isNaN(a) || a < 0 ? calc : a;
  };
  const lbl = (k: OvKey, d: string) => (overrides[k]?.label || '').trim() || d;

  // ---- Stair upgrades (one of: premium LVP, LVP, premium carpet) ----
  let stairLvp = 0;
  if (input.stairUpgradeType === 'premium_lvp') {
    stairLvp = stairPremiumLvpPrice;
  } else if (input.stairUpgradeType === 'lvp' || input.stairLvpUpgradeSelected) {
    stairLvp = stairLvpPrice;
  }
  // Selection-based, evaluated before any override (matches the client's !isStairLvp).
  const isStairLvp = stairLvp > 0;
  if (stairLvp > 0) stairLvp = ov('stair', stairLvp, true);
  const stairCarpet = ov('stairCarpet', input.stairPremiumCarpetSelected && !isStairLvp ? stairCarpetUpgradePrice : 0, !!input.stairPremiumCarpetSelected && !isStairLvp);
  if (stairLvp > 0) lineItems.push({ group: 'stair', label: lbl('stair', 'LVP with Custom Stair Nosings'), amount: stairLvp });
  const stairUnderpad = ov('stairUnderpad', input.stairPremiumUnderpadSelected && !isStairLvp ? stairUnderpadPrice : 0, !!input.stairPremiumUnderpadSelected && !isStairLvp);
  if (stairCarpet > 0) lineItems.push({ group: 'stair', label: overrides.stairCarpet?.label?.trim() || 'Premium Carpet — Stairs to Lower Level', amount: stairCarpet });
  if (stairUnderpad > 0) lineItems.push({ group: 'stair', label: overrides.stairUnderpad?.label?.trim() || 'Premium Underpad — Stairs to Lower Level', amount: stairUnderpad });

  // ---- Bedroom premium carpet / underpad (carpet bedrooms only; a hard-surface second bedroom is excluded) ----
  const secondBedroomIsHard = (input.areaUpgrades || []).some(a => a.areaId === 'secondBedroom' && /lvp|lvt|laminate|hardwood|tile/i.test(String(a.materialType)));
  const bedroomIsCarpet = input.bedroomFlooringChoice === 'carpet';
  // Split-floor units G/H keep every bedroom on the 2nd floor, whatever floor the upgrades are on.
  const unitBase = (normalizeUnitTypeCode(input.unitTypeCode) || '').toUpperCase().split('-')[0];
  const bedroomUnitData = unitBase === 'G' || unitBase === 'H' ? pricing.unitAreas[`${unitBase}-2`] : unitData;
  const bedroomCarpetSqyd = bedroomIsCarpet ? (bedroomUnitData?.masterBedroom || 0) + (secondBedroomIsHard ? 0 : (bedroomUnitData?.secondBedroomCarpet || 0)) : 0;
  const bedroomWord = secondBedroomIsHard ? 'Primary Bedroom' : 'Bedrooms';
  const bedroomCarpet = ov('bedroomCarpet',
    bedroomIsCarpet && input.bedroomPremiumCarpetSelected ? bedroomCarpetSqyd * (pricing.materials['carpet'] || 0) * (1 + pricing.markupPercentage) : 0,
    bedroomIsCarpet && !!input.bedroomPremiumCarpetSelected);
  const bedroomUnderpad = ov('bedroomUnderpad',
    bedroomIsCarpet && input.bedroomPremiumUnderpadSelected ? bedroomCarpetSqyd * (pricing.materials['premium_carpet_underpad'] || 0) * (1 + pricing.markupPercentage) : 0,
    bedroomIsCarpet && !!input.bedroomPremiumUnderpadSelected);
  if (bedroomCarpet > 0) lineItems.push({ group: 'flooring', label: lbl('bedroomCarpet', `Premium Carpet — ${bedroomWord} (${bedroomCarpetSqyd} sq yd)`), amount: bedroomCarpet });
  if (bedroomUnderpad > 0) lineItems.push({ group: 'flooring', label: lbl('bedroomUnderpad', `Premium Underpad — ${bedroomWord} (${bedroomCarpetSqyd} sq yd)`), amount: bedroomUnderpad });

  // ---- Grout ----
  const grout = input.backsplashGroutEnabled ? ov('grout', groutColorPrice, true) : 0;
  if (grout > 0) {
    lineItems.push({
      group: 'grout',
      label: lbl('grout', 'Custom Grout Color'),
      detail: input.backsplashGroutColor || undefined,
      amount: grout,
    });
  }

  // ---- Window coverings ----
  const aw = additionalWindowPrice;
  const pd = patioDoorPrice;
  const am = automatedMotorPrice;
  const aq = input.additionalWindowsQty || 0;
  const pq = input.patioDoorsQty || 0;
  const mq = input.automatedWindowsQty || 0;
  const windowAdditional = aq * aw;
  const windowPatio = pq * pd;
  const windowAutomation = mq * am;
  if (windowAdditional > 0) lineItems.push({ group: 'window', label: `Additional Windows (${aq} × $${aw.toFixed(2)})`, amount: windowAdditional });
  if (windowPatio > 0) lineItems.push({ group: 'window', label: `Patio Door Panel Track (${pq} × $${pd.toFixed(2)})`, amount: windowPatio });
  if (windowAutomation > 0) lineItems.push({ group: 'window', label: `Somfy Automation (${mq} × $${am.toFixed(2)})`, amount: windowAutomation });
  const windowSubtotal = windowAdditional + windowPatio + windowAutomation;

  // ---- Flooring & tile area upgrades ----
  const flooringUpgrades: ServerTotalsResult['pieces']['flooringUpgrades'] = [];
  let flooringSubtotal = 0;
  let areaHeatedFloorSubtotal = 0;
  for (const sel of input.areaUpgrades || []) {
    // Stair rows are priced by the stair flat rates; only an office manual price adds to the total here.
    if (sel.areaId === 'stairs' && !(Number(sel.manualPrice) > 0)) continue;
    const fieldName = AREA_FIELD_MAP[sel.areaId] || sel.areaId;
    const qty = unitData ? Number(unitData[fieldName]) || 0 : 0;
    const cost = pricing.materials[sel.materialType] || 0;
    const base = qty * cost;
    const manual = Number(sel.manualPrice) || 0;
    const markedUp = manual > 0 ? manual : base * (1 + pricing.markupPercentage);
    const areaName = (sel as { areaLabel?: string }).areaLabel?.trim() || AREA_NAMES[sel.areaId] || sel.areaId;
    const materialName = MATERIAL_NAMES[sel.materialType] || sel.materialType;
    const hasHeat = !!sel.heatedFloor && sectionHeatedFloorCount === 0 && (sel.materialType === 'tile' || sel.materialType === 'nonstandard_tile');
    const heatAmount = hasHeat ? heatedFloorPerBathroom : 0;
    flooringSubtotal += markedUp;
    areaHeatedFloorSubtotal += heatAmount;
    flooringUpgrades.push({
      areaId: sel.areaId,
      areaName,
      materialName,
      productName: sel.productName,
      productColor: sel.productColor,
      amount: markedUp,
      heatedFloorAmount: heatAmount,
    });
    if (markedUp > 0) {
      lineItems.push({
        group: 'flooring',
        label: `${areaName} (${materialName})`,
        detail: sel.productName ? `${sel.productName}${sel.productColor ? ` - ${sel.productColor}` : ''}` : undefined,
        amount: markedUp,
      });
    }
    if (heatAmount > 0) {
      lineItems.push({ group: 'flooring', label: `  └ Heated Floor (${areaName})`, amount: heatAmount });
    }
  }

  // ---- Bathroom upgrades (Section 4) ----
  const hasPricedBathroomTileAreas = (input.areaUpgrades || []).some(sel =>
    ['guestBathroom', 'masterEnsuite'].includes(sel.areaId) &&
    (sel.materialType === 'tile' || sel.materialType === 'nonstandard_tile')
  );
  const baths = getBathroomAreas(resolvedCode, pricing);
  // Per-bathroom tile selection. If neither sub-flag was provided but the
  // master flag is true (legacy data), default to BOTH bathrooms to preserve
  // historical pricing.
  const subFlagsProvided = input.bathroomTileEnsuiteSelected !== undefined ||
    input.bathroomTileGuestSelected !== undefined;
  const ensuiteOn = subFlagsProvided
    ? !!input.bathroomTileEnsuiteSelected
    : !!input.bathroomTileSelected;
  const guestOn = subFlagsProvided
    ? !!input.bathroomTileGuestSelected
    : !!input.bathroomTileSelected;
  const masterOn = !!input.bathroomTileSelected || ensuiteOn || guestOn;
  let bathroomTile = 0;
  if (masterOn && !hasPricedBathroomTileAreas && tileCostPerSqft > 0) {
    const ensuiteSqft = ensuiteOn ? baths.ensuite : 0;
    const guestSqft = guestOn && baths.guest > 0 ? baths.guest : 0;
    bathroomTile = (ensuiteSqft + guestSqft) * tileCostPerSqft * (1 + pricing.markupPercentage);
  }
  const heatedFloorCount = sectionHeatedFloorCount;
  bathroomTile = ov('bathroomTile', bathroomTile, masterOn && !hasPricedBathroomTileAreas);
  const section4HeatedFloor = ov('heatedFloor', heatedFloorCount > 0 ? heatedFloorCount * heatedFloorPerBathroom : 0, heatedFloorCount > 0);
  const customShower = ov('customShower', input.customTiledShower && showerBaseCost > 0
    ? showerBaseCost * (1 + pricing.markupPercentage)
    : 0, !!input.customTiledShower);
  if (bathroomTile > 0) lineItems.push({ group: 'bathroom', label: lbl('bathroomTile', 'Porcelain Tile Floor Upgrade'), amount: bathroomTile });
  if (section4HeatedFloor > 0) {
    lineItems.push({
      group: 'bathroom',
      label: overrides.heatedFloor?.label?.trim() || `Heated Tile Floor (${heatedFloorCount} bathroom${heatedFloorCount > 1 ? 's' : ''} × $${heatedFloorPerBathroom.toLocaleString()})`,
      amount: section4HeatedFloor,
    });
  }
  if (customShower > 0) lineItems.push({ group: 'bathroom', label: lbl('customShower', 'Custom Tiled Shower'), amount: customShower });

  const includedItems = (Array.isArray(cp.customItems) ? cp.customItems : [])
    .filter((i: any) => i?.status === 'included')
    .map((i: any) => ({ label: String(i.label || '').trim() || 'Custom Item', detail: String(i.detail || '').trim() || undefined, area: String(i.area || '').trim() || undefined }));
  let customItemsTotal = 0;
  for (const i of (Array.isArray(cp.customItems) ? cp.customItems : [])) {
    // Only 'upgrade' lines (default) are committed; included/pending/disputed/deferred are not charged.
    if (i?.status && i.status !== 'upgrade') continue;
    const q = Number(i?.quantity); const u = Number(i?.unitPrice);
    const amt = q > 0 && u ? q * u : (Number(i?.amount) || 0);
    if (!amt) continue;
    customItemsTotal += amt;
    lineItems.push({ group: 'custom', label: String(i.label || '').trim() || 'Custom Item', detail: i.detail || undefined, amount: amt });
  }

  const upgradesSubtotal =
    flooringSubtotal + areaHeatedFloorSubtotal + stairLvp + stairCarpet + stairUnderpad + bedroomCarpet + bedroomUnderpad + grout +
    bathroomTile + section4HeatedFloor + customShower + customItemsTotal;

  const grandSubtotal = upgradesSubtotal + windowSubtotal;
  const gst = grandSubtotal * pricing.gstRate;
  const grandTotal = grandSubtotal + gst;

  return {
    windowSubtotal,
    upgradesSubtotal,
    grandSubtotal,
    gst,
    grandTotal,
    gstRate: pricing.gstRate,
    markupPercentage: pricing.markupPercentage,
    lineItems,
    pieces: {
      stairLvp,
      stairCarpet,
      stairUnderpad,
      bedroomCarpet,
      bedroomUnderpad,
      bedroomCarpetSqyd,
      grout,
      windowAdditional,
      windowPatio,
      windowAutomation,
      flooringUpgrades,
      bathroomTile,
      section4HeatedFloor,
      customShower,
      customItemsTotal,
      includedItems,
    },
    context: {
      bathroomGuestSqft: baths.guest,
      bathroomEnsuiteSqft: baths.ensuite,
      tileCostPerSqft,
      showerBaseCost,
      heatedFloorPerBathroom,
      additionalWindowPrice: aw,
      patioDoorPrice: pd,
      automatedMotorPrice: am,
      groutColorPrice,
    },
  };
}
