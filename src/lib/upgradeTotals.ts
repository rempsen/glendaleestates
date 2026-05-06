// Shared upgrade pricing calculator — single source of truth used by:
//   - On-screen UpgradePricingSummary
//   - buyerPdfGenerator (buyer-facing PDF)
//   - submissionPdfGenerator (admin PDF)
//   - send-selections-email edge function (CSV summary)
//
// All consumers MUST go through computeUpgradeTotals() so the buyer total
// in the UI, PDF, email and CRM never diverge.

import {
  AreaUpgradeSelection,
  BacksplashGroutSelection,
  AREA_DEFINITIONS,
  UPGRADE_MATERIALS,
  MaterialType,
  normalizeUnitTypeCode,
} from '@/lib/upgradeCostData';

export interface UnitAreaForTotals {
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

export interface UpgradeTotalsPricing {
  markupPercentage: number;
  gstRate: number;
  getMaterialCost: (m: MaterialType | string) => number;
  getGroutColorFee: () => number;
  getAdditionalWindowPrice: () => number;
  getPatioDoorPrice: () => number;
  getAutomatedMotorPrice: () => number;
  getHeatedFloorPrice: () => number;
  getStairLvpUpgradePrice?: () => number;
  getStairCarpetUpgradePrice?: () => number;
  getUnitAreaData?: (code: string) => UnitAreaForTotals | null;
}

export interface UpgradeTotalsInput {
  unitTypeCode: string | null;
  upgradeFloorSelection?: '1' | '2' | null;
  areaUpgrades: AreaUpgradeSelection[];
  backsplashGrout?: BacksplashGroutSelection | null;
  stairLvpUpgradeSelected?: boolean;
  stairPremiumCarpetSelected?: boolean;
  additionalWindowsQty?: number;
  patioDoorsQty?: number;
  automatedWindowsQty?: number;
  bathroomTileSelected?: boolean;
  bathroomTileEnsuiteSelected?: boolean;
  bathroomTileGuestSelected?: boolean;
  heatedFloorBathrooms?: number;
  customTiledShower?: boolean;
}

export interface UpgradeLineItem {
  group: 'stair' | 'grout' | 'window' | 'flooring' | 'bathroom';
  label: string;
  detail?: string;
  amount: number;
}

export interface UpgradeTotalsResult {
  windowSubtotal: number;
  upgradesSubtotal: number;
  grandSubtotal: number;
  gst: number;
  grandTotal: number;
  lineItems: UpgradeLineItem[];
  // Individual pieces, useful for itemised tables
  pieces: {
    stairLvp: number;
    stairCarpet: number;
    grout: number;
    windowAdditional: number;
    windowPatio: number;
    windowAutomation: number;
    flooringUpgrades: Array<{ areaId: string; areaName: string; materialName: string; amount: number; productName?: string; productColor?: string; heatedFloorAmount: number; sqft: number }>;
    bathroomTile: number;
    bathroomTileSqft: number;
    section4HeatedFloor: number;
    customShower: number;
  };
}

function resolveUnitCode(
  unitTypeCode: string | null,
  floor: '1' | '2' | null | undefined,
  pricing: UpgradeTotalsPricing
): string | null {
  const normalized = normalizeUnitTypeCode(unitTypeCode);
  if (!normalized) return null;
  const upper = normalized.toUpperCase();
  if (upper.includes('-')) return upper;
  if ((upper === 'G' || upper === 'H')) {
    if (floor) return `${upper}-${floor}`;
    if (pricing.getUnitAreaData) {
      if (pricing.getUnitAreaData(`${upper}-1`)) return `${upper}-1`;
      if (pricing.getUnitAreaData(`${upper}-2`)) return `${upper}-2`;
    }
  }
  return upper;
}

function getBathroomAreas(
  unitTypeCode: string | null,
  pricing: UpgradeTotalsPricing
): { guest: number; ensuite: number } {
  if (!unitTypeCode || !pricing.getUnitAreaData) return { guest: 0, ensuite: 0 };
  const code = unitTypeCode.toUpperCase();
  if (['G', 'H'].includes(code)) {
    const d1 = pricing.getUnitAreaData(`${code}-1`);
    const d2 = pricing.getUnitAreaData(`${code}-2`);
    return {
      guest: Math.max(d1?.guestBathroom || 0, d2?.guestBathroom || 0),
      ensuite: Math.max(d1?.masterEnsuite || 0, d2?.masterEnsuite || 0),
    };
  }
  const a = pricing.getUnitAreaData(code);
  return { guest: a?.guestBathroom || 0, ensuite: a?.masterEnsuite || 0 };
}

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

export function computeUpgradeTotals(
  input: UpgradeTotalsInput,
  pricing: UpgradeTotalsPricing
): UpgradeTotalsResult {
  const resolvedCode = resolveUnitCode(input.unitTypeCode, input.upgradeFloorSelection, pricing);
  const unitData = resolvedCode && pricing.getUnitAreaData ? pricing.getUnitAreaData(resolvedCode) : null;

  const heatedFloorPerBathroom = pricing.getHeatedFloorPrice();
  const sectionHeatedFloorCount = Number(input.heatedFloorBathrooms) || 0;
  const lineItems: UpgradeLineItem[] = [];

  // ---- Stair upgrades ----
  const stairLvp = input.stairLvpUpgradeSelected ? (pricing.getStairLvpUpgradePrice?.() || 0) : 0;
  const stairCarpet = input.stairPremiumCarpetSelected && !input.stairLvpUpgradeSelected
    ? (pricing.getStairCarpetUpgradePrice?.() || 0) : 0;
  if (stairLvp > 0) lineItems.push({ group: 'stair', label: 'LVP with Custom Stair Nosings', amount: stairLvp });
  if (stairCarpet > 0) lineItems.push({ group: 'stair', label: 'Premium Carpet Stairs Upgrade', amount: stairCarpet });

  // ---- Grout ----
  const grout = input.backsplashGrout?.enabled ? pricing.getGroutColorFee() : 0;
  if (grout > 0) {
    lineItems.push({
      group: 'grout',
      label: 'Custom Grout Color',
      detail: input.backsplashGrout?.groutColor || undefined,
      amount: grout,
    });
  }

  // ---- Window coverings ----
  const aw = pricing.getAdditionalWindowPrice();
  const pd = pricing.getPatioDoorPrice();
  const am = pricing.getAutomatedMotorPrice();
  const windowAdditional = (input.additionalWindowsQty || 0) * aw;
  const windowPatio = (input.patioDoorsQty || 0) * pd;
  const windowAutomation = (input.automatedWindowsQty || 0) * am;
  if (windowAdditional > 0) lineItems.push({ group: 'window', label: `Additional Windows (${input.additionalWindowsQty} × $${aw.toFixed(2)})`, amount: windowAdditional });
  if (windowPatio > 0) lineItems.push({ group: 'window', label: `Patio Door Panel Track (${input.patioDoorsQty} × $${pd.toFixed(2)})`, amount: windowPatio });
  if (windowAutomation > 0) lineItems.push({ group: 'window', label: `Somfy Automation (${input.automatedWindowsQty} × $${am.toFixed(2)})`, amount: windowAutomation });
  const windowSubtotal = windowAdditional + windowPatio + windowAutomation;

  // ---- Flooring & tile area upgrades ----
  const flooringUpgrades: UpgradeTotalsResult['pieces']['flooringUpgrades'] = [];
  let flooringSubtotal = 0;
  let areaHeatedFloorSubtotal = 0;
  for (const sel of input.areaUpgrades || []) {
    if (sel.areaId === 'stairs') continue;
    const fieldName = AREA_FIELD_MAP[sel.areaId] || sel.areaId;
    const qty = unitData ? Number((unitData as Record<string, number | undefined>)[fieldName]) || 0 : 0;
    const cost = pricing.getMaterialCost(sel.materialType);
    const base = qty * cost;
    const markedUp = base * (1 + pricing.markupPercentage);
    const areaDef = AREA_DEFINITIONS.find(a => a.id === sel.areaId);
    const matDef = UPGRADE_MATERIALS.find(m => m.id === sel.materialType);
    const hasHeat = !!sel.heatedFloor && sectionHeatedFloorCount === 0 && (sel.materialType === 'tile' || sel.materialType === 'nonstandard_tile');
    const heatAmount = hasHeat ? heatedFloorPerBathroom : 0;
    flooringSubtotal += markedUp;
    areaHeatedFloorSubtotal += heatAmount;
    flooringUpgrades.push({
      areaId: sel.areaId,
      areaName: areaDef?.name || sel.areaId,
      materialName: matDef?.name || sel.materialType,
      productName: sel.productName,
      productColor: sel.productColor,
      amount: markedUp,
      heatedFloorAmount: heatAmount,
      sqft: qty,
    });
    lineItems.push({
      group: 'flooring',
      label: `${areaDef?.name || sel.areaId} (${matDef?.name || sel.materialType})`,
      detail: sel.productName ? `${sel.productName}${sel.productColor ? ` - ${sel.productColor}` : ''}` : undefined,
      amount: markedUp,
    });
    if (heatAmount > 0) {
      lineItems.push({ group: 'flooring', label: `  └ Heated Floor (${areaDef?.name || sel.areaId})`, amount: heatAmount });
    }
  }

  // ---- Bathroom upgrades (Section 4) ----
  const hasPricedBathroomTileAreas = (input.areaUpgrades || []).some(sel =>
    ['guestBathroom', 'masterEnsuite'].includes(sel.areaId) &&
    (sel.materialType === 'tile' || sel.materialType === 'nonstandard_tile')
  );
  const tileCostPerSqft = pricing.getMaterialCost('tile');
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
  let bathroomTileSqft = 0;
  if (masterOn && !hasPricedBathroomTileAreas && tileCostPerSqft > 0) {
    const ensuiteSqft = ensuiteOn ? baths.ensuite : 0;
    const guestSqft = guestOn && baths.guest > 0 ? baths.guest : 0;
    bathroomTileSqft = ensuiteSqft + guestSqft;
    bathroomTile = bathroomTileSqft * tileCostPerSqft * (1 + pricing.markupPercentage);
  }
  const section4HeatedFloor = sectionHeatedFloorCount > 0
    ? sectionHeatedFloorCount * heatedFloorPerBathroom
    : 0;
  const showerBaseCost = pricing.getMaterialCost('tiled_shower');
  const customShower = input.customTiledShower && showerBaseCost > 0
    ? showerBaseCost * (1 + pricing.markupPercentage)
    : 0;
  if (bathroomTile > 0) lineItems.push({ group: 'bathroom', label: 'Porcelain Tile Floor Upgrade', amount: bathroomTile });
  if (section4HeatedFloor > 0) {
    const n = sectionHeatedFloorCount;
    lineItems.push({
      group: 'bathroom',
      label: `Heated Tile Floor (${n} bathroom${n > 1 ? 's' : ''} × $${heatedFloorPerBathroom.toLocaleString()})`,
      amount: section4HeatedFloor,
    });
  }
  if (customShower > 0) lineItems.push({ group: 'bathroom', label: 'Custom Tiled Shower', amount: customShower });

  const upgradesSubtotal =
    flooringSubtotal + areaHeatedFloorSubtotal + stairLvp + stairCarpet + grout +
    bathroomTile + section4HeatedFloor + customShower;

  const grandSubtotal = upgradesSubtotal + windowSubtotal;
  const gst = grandSubtotal * pricing.gstRate;
  const grandTotal = grandSubtotal + gst;

  return {
    windowSubtotal,
    upgradesSubtotal,
    grandSubtotal,
    gst,
    grandTotal,
    lineItems,
    pieces: {
      stairLvp,
      stairCarpet,
      grout,
      windowAdditional,
      windowPatio,
      windowAutomation,
      flooringUpgrades,
      bathroomTile,
      bathroomTileSqft,
      section4HeatedFloor,
      customShower,
    },
  };
}
