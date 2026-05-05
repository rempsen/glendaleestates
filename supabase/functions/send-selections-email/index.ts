import { getCorsHeaders, corsHeaders } from "../_shared/cors.ts";
import { computeUpgradeTotalsServer, ServerTotalsResult } from "../_shared/upgradeTotalsServer.ts";

// Dynamic CORS headers will be used for responses

// HTML escape function to prevent XSS in email content
function escapeHtml(text: string | undefined | null): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Simple validation helper
function validateInput(data: Record<string, unknown>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!data.unitNumber || typeof data.unitNumber !== 'string') {
    errors.push('Unit number is required');
  }
  if (!data.firstName || typeof data.firstName !== 'string') {
    errors.push('First name is required');
  }
  if (!data.lastName || typeof data.lastName !== 'string') {
    errors.push('Last name is required');
  }
  if (!data.email || typeof data.email !== 'string' || !data.email.includes('@')) {
    errors.push('Valid email is required');
  }
  
  return { valid: errors.length === 0, errors };
}

// Pricing breakdown for CSV — kept loose to avoid forward-decl issues
interface CsvPricingBreakdown {
  lineItems: Array<{ label: string; cost: number }>;
  subtotal: number;
  gst: number;
  grandTotal: number;
  gstRate: number;
}

// Generate CSV content from selection data
function generateCSV(data: SelectionData, savedId: string | undefined, pricingBreakdown?: CsvPricingBreakdown): string {
  const rows: string[][] = [];
  
  // Header row
  rows.push(['Field', 'Value']);
  
  // Buyer Information
  rows.push(['Database ID', savedId || 'N/A']);
  rows.push(['Unit Number', data.unitNumber]);
  rows.push(['Unit Type', data.unitType || 'N/A']);
  rows.push(['First Name', data.firstName]);
  rows.push(['Last Name', data.lastName]);
  rows.push(['Email', data.email]);
  rows.push(['Phone', data.phoneNumber || 'N/A']);
  rows.push(['Estimated Possession Date', data.estimatedPossessionDate || 'N/A']);
  rows.push(['Has Stairs', data.hasStairs ? 'Yes' : 'No']);
  
  // Flooring Selections
  rows.push(['--- FLOORING SELECTIONS ---', '']);
  rows.push(['Main Floor LVP', data.lvpColour || 'Not selected']);
  rows.push(['LVP Comments', data.lvpComments || '']);
  rows.push(['Bathroom/Laundry SPC Tile', data.spcTileColour || 'Not selected']);
  rows.push(['SPC Tile Comments', data.spcTileComments || '']);
  rows.push(['Stair Carpet Colour', data.stairCarpetColour || 'N/A']);
  rows.push(['Bedroom Flooring Choice', data.bedroomFlooringChoice || 'Not selected']);
  rows.push(['Bedroom Carpet Colour', data.bedroomCarpetColour || 'N/A']);
  rows.push(['Bedroom LVP Colour', data.bedroomLvpColour || 'N/A']);
  rows.push(['Bedroom LVP Same as Main', data.bedroomLvpSameAsMain ? 'Yes' : 'No']);
  
  // Backsplash
  rows.push(['--- BACKSPLASH ---', '']);
  rows.push(['Backsplash Orientation', data.backsplashOrientation || 'Not selected']);
  rows.push(['Custom Grout Color Change', data.backsplashGroutEnabled ? 'Yes ($300 + GST)' : 'No']);
  rows.push(['Grout Color', data.backsplashGroutColor || 'N/A']);
  rows.push(['Grout Comments', data.backsplashGroutComments || '']);
  
  // Window Coverings
  rows.push(['--- WINDOW COVERINGS ---', '']);
  rows.push(['Additional Windows Qty', String(data.additionalWindowsQty)]);
  rows.push(['Patio Doors Qty', String(data.patioDoorsQty)]);
  rows.push(['Window Total (incl. GST)', `$${data.windowTotal.toFixed(2)}`]);
  rows.push(['Window Comments', data.windowComments || '']);
  
  // Area Upgrades
  rows.push(['--- AREA UPGRADES ---', '']);
  rows.push(['Upgrade Floor Selection (G/H units)', data.upgradeFloorSelection || 'N/A']);
  
  if (data.areaUpgrades && data.areaUpgrades.length > 0) {
    data.areaUpgrades.forEach((upgrade, index) => {
      rows.push([`Upgrade ${index + 1} - Area`, upgrade.areaId || '']);
      rows.push([`Upgrade ${index + 1} - Material Type`, upgrade.materialType || '']);
      rows.push([`Upgrade ${index + 1} - Product Name`, upgrade.productName || '']);
      rows.push([`Upgrade ${index + 1} - Product Color`, upgrade.productColor || '']);
      rows.push([`Upgrade ${index + 1} - Heated Floor`, upgrade.heatedFloor ? 'Yes' : 'No']);
      rows.push([`Upgrade ${index + 1} - Comments`, upgrade.comments || '']);
    });
  } else {
    rows.push(['No area upgrades selected', '']);
  }
  
  // Other Upgrades
  rows.push(['--- OTHER UPGRADES ---', '']);
  rows.push(['Hardwood Upgrade Selected', data.hardwoodUpgradeSelected ? 'Yes' : 'No']);
  rows.push(['Bathroom Tile Selected', data.bathroomTileSelected ? 'Yes' : 'No']);
  rows.push(['Heated Floor Bathrooms', String(data.heatedFloorBathrooms)]);
  rows.push(['Premium Carpet (Bedrooms)', data.premiumCarpetBedroom ? 'Yes' : 'No']);
  rows.push(['Premium Underpad (Bedrooms)', data.premiumUnderpadBedroom ? 'Yes' : 'No']);
  rows.push(['Premium Underpad (Stairs)', data.premiumUnderpadStairs ? 'Yes' : 'No']);
  rows.push(['Custom Tiled Shower', data.customTiledShower ? 'Yes' : 'No']);
  
  // Upgrade Interests
  rows.push(['--- UPGRADE INTERESTS ---', '']);
  const interests = Object.entries(data.upgradeInterests || {})
    .filter(([_, v]) => v)
    .map(([k]) => k);
  rows.push(['Interested In', interests.length > 0 ? interests.join(', ') : 'None']);
  
  // Comments
  rows.push(['--- COMMENTS ---', '']);
  rows.push(['Sales Comments', data.salesComments || '']);
  rows.push(['Upgrade Pricing Summary Comments', data.upgradeComments || '']);
  rows.push(['Upgrade Interests Notes', data.upgradeInterestsNotes || '']);

  // Pricing Breakdown (matches PDF / on-screen / email summaries)
  if (pricingBreakdown) {
    rows.push(['--- PRICING BREAKDOWN ---', '']);
    for (const item of pricingBreakdown.lineItems) {
      rows.push([item.label, `$${item.cost.toFixed(2)}`]);
    }
    rows.push(['Subtotal (pre-GST)', `$${pricingBreakdown.subtotal.toFixed(2)}`]);
    rows.push([`GST (${(pricingBreakdown.gstRate * 100).toFixed(0)}%)`, `$${pricingBreakdown.gst.toFixed(2)}`]);
    rows.push(['GRAND TOTAL (incl. GST)', `$${pricingBreakdown.grandTotal.toFixed(2)}`]);
  }

  // Convert to CSV string with proper escaping
  return rows.map(row => 
    row.map(cell => {
      // Escape quotes and wrap in quotes if contains comma, quote, or newline
      const escaped = String(cell).replace(/"/g, '""');
      if (escaped.includes(',') || escaped.includes('"') || escaped.includes('\n')) {
        return `"${escaped}"`;
      }
      return escaped;
    }).join(',')
  ).join('\n');
}

// Send email using Resend REST API with attachment support
async function sendEmailWithAttachment(options: {
  from: string;
  to: string[];
  subject: string;
  html: string;
  attachments?: Array<{ filename: string; content: string }>;
}): Promise<{ id?: string; error?: string }> {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  
  if (!resendApiKey) {
    throw new Error("RESEND_API_KEY not configured");
  }

  const body: Record<string, unknown> = {
    from: options.from,
    to: options.to,
    subject: options.subject,
    html: options.html,
  };

  // Add attachments if provided (Resend expects base64 encoded content)
  if (options.attachments && options.attachments.length > 0) {
    // UTF-8 safe base64 encoding — btoa() only accepts Latin1 chars,
    // so buyer comments with smart quotes / em dashes / emoji would crash.
    const utf8ToBase64 = (str: string) => {
      const bytes = new TextEncoder().encode(str);
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      return btoa(binary);
    };
    body.attachments = options.attachments.map(att => ({
      filename: att.filename,
      content: utf8ToBase64(att.content),
    }));
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const result = await response.json();
  
  if (!response.ok) {
    throw new Error(result.message || "Failed to send email");
  }
  
  return result;
}

// Supabase REST API helper
async function supabaseInsert(table: string, data: Record<string, unknown>): Promise<{ data: Record<string, unknown> | null; error: string | null }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const response = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      "apikey": supabaseServiceKey,
      "Authorization": `Bearer ${supabaseServiceKey}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return { data: null, error: errorText };
  }

  const result = await response.json();
  return { data: Array.isArray(result) ? result[0] : result, error: null };
}

// Area upgrade selection interface
interface AreaUpgrade {
  areaId: string;
  materialType: string;
  productName: string;
  productColor: string;
  comments: string;
  heatedFloor?: boolean;
}

// Document upload interface
interface DocumentUpload {
  name: string;
  path: string;
  size: number;
  type: string;
  uploadedAt: string;
}

interface SelectionData {
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

// Area name mapping for display
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

// Material type display names
const MATERIAL_NAMES: Record<string, string> = {
  lvp: 'Premium LVP',
  hardwood: 'Hardwood',
  lvt: 'Premium LVT',
  carpet: 'Premium Carpet',
  tile: 'Porcelain Tile',
  nonstandard_lvp: 'Non Standard LVP Color',
  nonstandard_lvt: 'Non Standard LVT Color',
  nonstandard_tile: 'Non Standard Tile Color',
};

// Normalize unit type label to unit type code
// e.g., "Corner Unit G" -> "G", "Unit Type A" -> "A"
function normalizeUnitTypeCode(unitType: string | null | undefined): string {
  if (!unitType) return '';
  
  const typeUpper = unitType.toUpperCase().trim();
  
  // Direct match for single letters
  if (/^[A-J]$/.test(typeUpper)) return typeUpper;
  
  // Already floor-specific (G-1, G-2, H-1, H-2)
  if (/^[GH]-[12]$/.test(typeUpper)) return typeUpper;
  
  // Extract letter from common patterns
  // "Corner Unit G" -> "G"
  // "Unit Type A" -> "A"
  // "Type B" -> "B"
  const patterns = [
    /CORNER\s*UNIT\s*([A-J])/i,
    /UNIT\s*TYPE\s*([A-J])/i,
    /TYPE\s*([A-J])/i,
    /UNIT\s*([A-J])/i,
    /^([A-J])$/i,
  ];
  
  for (const pattern of patterns) {
    const match = typeUpper.match(pattern);
    if (match && match[1]) {
      return match[1].toUpperCase();
    }
  }
  
  return typeUpper;
}

// Resolve G/H unit codes to floor-specific codes (G-1, G-2, etc.)
function resolveFloorSpecificUnitCode(
  unitTypeCode: string,
  upgradeFloorSelection: string | null | undefined,
  unitAreas: Record<string, Record<string, number>>
): string {
  const upper = unitTypeCode.toUpperCase().trim();
  
  // Already floor-specific
  if (upper.includes('-')) return upper;
  
  // For G and H units, resolve to floor-specific
  if (upper === 'G' || upper === 'H') {
    if (upgradeFloorSelection) {
      return `${upper}-${upgradeFloorSelection}`;
    }
    
    // Try floor 1 first, then floor 2
    const floor1Code = `${upper}-1`;
    const floor2Code = `${upper}-2`;
    
    if (unitAreas[floor1Code]) return floor1Code;
    if (unitAreas[floor2Code]) return floor2Code;
    
    return upper;
  }
  
  return upper;
}

// Fetch dynamic pricing from database
async function fetchDynamicPricing(): Promise<{
  materials: Record<string, number>;
  config: Record<string, number>;
  unitAreas: Record<string, Record<string, number>>;
  markupPercentage: number;
  gstRate: number;
}> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const headers = {
    "apikey": supabaseServiceKey,
    "Authorization": `Bearer ${supabaseServiceKey}`,
    "Content-Type": "application/json",
  };

  // Fetch materials, config, and unit areas in parallel
  const [materialsRes, configRes, unitAreasRes] = await Promise.all([
    fetch(`${supabaseUrl}/rest/v1/upgrade_materials?is_active=eq.true`, { headers }),
    fetch(`${supabaseUrl}/rest/v1/pricing_config`, { headers }),
    fetch(`${supabaseUrl}/rest/v1/unit_area_data`, { headers }),
  ]);

  const materials: Record<string, number> = {};
  const config: Record<string, number> = {};
  const unitAreas: Record<string, Record<string, number>> = {};

  // Parse materials
  if (materialsRes.ok) {
    const data = await materialsRes.json();
    for (const m of data) {
      materials[m.material_key] = Number(m.cost_per_unit);
    }
  }

  // Parse config
  let markupPercentage = 0.60;
  let gstRate = 0.05;
  if (configRes.ok) {
    const data = await configRes.json();
    for (const c of data) {
      config[c.config_key] = Number(c.config_value);
      if (c.config_key === 'markup_percentage') markupPercentage = Number(c.config_value) / 100;
      if (c.config_key === 'gst_rate') gstRate = Number(c.config_value) / 100;
    }
  }

  // Parse unit areas
  if (unitAreasRes.ok) {
    const data = await unitAreasRes.json();
    for (const u of data) {
      unitAreas[u.unit_type_code] = {
        allLvp: Number(u.all_lvp),
        mainLiving: Number(u.main_living),
        secondBedroom: Number(u.second_bedroom),
        masterBedroomLvp: Number(u.master_bedroom_lvp || 0),
        masterBedroom: Number(u.master_bedroom),
        secondBedroomCarpet: Number(u.second_bedroom_carpet),
        guestBathroom: Number(u.guest_bathroom),
        masterEnsuite: Number(u.master_ensuite),
        laundry: Number(u.laundry),
        backsplash: Number(u.backsplash),
      };
    }
  }

  return { materials, config, unitAreas, markupPercentage, gstRate };
}

// Calculate area upgrade costs
function calculateAreaUpgradeCosts(
  unitTypeCode: string,
  areaUpgrades: AreaUpgrade[],
  upgradeFloorSelection: string | null | undefined,
  pricing: {
    materials: Record<string, number>;
    unitAreas: Record<string, Record<string, number>>;
    markupPercentage: number;
    heatedFloorPrice: number;
    stairCarpetUpgradePrice: number;
  }
): { lineItems: Array<{ areaId: string; area: string; material: string; cost: number; heatedFloor?: boolean; heatedCost?: number }>; subtotal: number } {
  const lineItems: Array<{ areaId: string; area: string; material: string; cost: number; heatedFloor?: boolean; heatedCost?: number }> = [];
  let subtotal = 0;

  // Resolve floor-specific unit code for G/H units
  const resolvedUnitCode = resolveFloorSpecificUnitCode(unitTypeCode, upgradeFloorSelection, pricing.unitAreas);
  const unitData = pricing.unitAreas[resolvedUnitCode];

  for (const upgrade of areaUpgrades) {
    // Handle stairs specially - can be either premium LVP (included in stairLvpUpgradeSelected) 
    // or premium carpet (flat rate). For area upgrades, stairs only appears for premium carpet.
    if (upgrade.areaId === 'stairs') {
      // Stairs in area upgrades is premium carpet (flat rate)
      // LVP stairs are handled separately via stairLvpUpgradeSelected flag
      const stairCost = pricing.stairCarpetUpgradePrice;
      subtotal += stairCost;
      lineItems.push({
        areaId: upgrade.areaId,
        area: AREA_NAMES[upgrade.areaId] || upgrade.areaId,
        material: MATERIAL_NAMES[upgrade.materialType] || upgrade.materialType,
        cost: stairCost,
        heatedFloor: false,
        heatedCost: 0,
      });
      continue;
    }

    // Get quantity from unit data
    const quantity = unitData ? (unitData[upgrade.areaId] || 0) : 0;
    const costPerUnit = pricing.materials[upgrade.materialType] || 0;
    const baseCost = quantity * costPerUnit;
    const markedUpCost = baseCost * (1 + pricing.markupPercentage);

    // Check for heated floor (tile in bathroom areas)
    const hasHeatedFloor = upgrade.heatedFloor && ['guestBathroom', 'masterEnsuite'].includes(upgrade.areaId);
    const heatedCost = hasHeatedFloor ? pricing.heatedFloorPrice : 0;

    // Include line item if there's any cost OR if user selected something (for display)
    subtotal += markedUpCost + heatedCost;
    lineItems.push({
      areaId: upgrade.areaId,
      area: AREA_NAMES[upgrade.areaId] || upgrade.areaId,
      material: MATERIAL_NAMES[upgrade.materialType] || upgrade.materialType,
      cost: markedUpCost,
      heatedFloor: hasHeatedFloor,
      heatedCost: heatedCost,
    });
  }

  return { lineItems, subtotal };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // ---- Preview / Test-send endpoints (no DB write, no admin email) ----
  // GET  ?action=preview&type=buyer|admin            -> returns rendered HTML
  // POST ?action=test    body: { type, to, ...data } -> sends a single test email
  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  if (action === 'preview' || action === 'test') {
    try {
      const isPost = req.method === 'POST';
      const body: Record<string, unknown> = isPost ? await req.json().catch(() => ({})) : {};
      const type = String(url.searchParams.get('type') || body.type || 'buyer');
      const sample = buildPreviewSampleData(body);
      const html = type === 'admin'
        ? renderPreviewAdminHtml(sample)
        : renderPreviewBuyerHtml(sample);

      if (action === 'preview') {
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8', ...corsHeaders },
        });
      }

      // action === 'test'
      const to = String(body.to || '').trim();
      if (!to || !to.includes('@')) {
        return new Response(JSON.stringify({ error: 'Provide a valid "to" email address' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
      const result = await sendEmailWithAttachment({
        from: 'BMD Materials <selections@bmdmaterials.com>',
        to: [to],
        subject: `[TEST] ${type === 'admin' ? 'Admin' : 'Buyer'} Email Preview — Legibility Check`,
        html,
      });
      return new Response(JSON.stringify({ ok: true, type, to, result }), {
        status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    } catch (err) {
      console.error('Preview/test error:', err);
      return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
  }

  try {
    const rawData = await req.json();

    // Validate input data
    const validation = validateInput(rawData);
    
    if (!validation.valid) {
      console.error("Validation error:", validation.errors);
      return new Response(
        JSON.stringify({ 
          error: "Invalid submission data. Please check your inputs and try again.",
          details: validation.errors
        }),
        { 
          status: 400, 
          headers: { "Content-Type": "application/json", ...corsHeaders } 
        }
      );
    }
    
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
          const heatedFloor = Boolean(upgrade.heatedFloor);

          const hasAnyMeaningfulData =
            areaId !== '' ||
            materialType !== '' ||
            productName !== '' ||
            productColor !== '' ||
            comments !== '' ||
            heatedFloor === true;

          if (!hasAnyMeaningfulData) return null;

          return {
            areaId: areaId || `unspecified_area_${idx + 1}`,
            materialType: materialType || 'unspecified',
            productName,
            productColor,
            comments,
            heatedFloor,
          } as AreaUpgrade;
        })
        .filter((u): u is AreaUpgrade => u !== null);

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

    const { data: savedSelection, error: dbError } = await supabaseInsert("buyer_selections", {
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
      custom_tiled_shower: data.customTiledShower || false,
      document_uploads: data.documentUploads || [],
      upgrade_comments: data.upgradeComments || null,
      upgrade_interests_notes: data.upgradeInterestsNotes || null,
      status: "submitted",
    });

    if (dbError) {
      console.error("Database error:", dbError);
    } else {
      console.log("Saved selection to database:", savedSelection?.id);
      
      // Sync to HubSpot in background
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabaseFunctionsUrl = `${supabaseUrl}/functions/v1/sync-hubspot`;
      fetch(supabaseFunctionsUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          id: savedSelection?.id,
          unit_number: data.unitNumber,
          unit_type: data.unitType,
          first_name: data.firstName,
          last_name: data.lastName,
          email: data.email,
          phone_number: data.phoneNumber,
          estimated_possession_date: data.estimatedPossessionDate,
          has_stairs: data.hasStairs,
          lvp_colour: data.lvpColour,
          lvp_comments: data.lvpComments,
          spc_tile_colour: data.spcTileColour,
          spc_tile_comments: data.spcTileComments,
          backsplash_orientation: data.backsplashOrientation,
          bedroom_flooring_choice: data.bedroomFlooringChoice,
          bedroom_carpet_colour: data.bedroomCarpetColour,
          bedroom_lvp_colour: data.bedroomLvpColour,
          bedroom_lvp_same_as_main: data.bedroomLvpSameAsMain,
          stair_carpet_colour: data.stairCarpetColour,
          additional_windows_qty: data.additionalWindowsQty,
          patio_doors_qty: data.patioDoorsQty,
          window_total: data.windowTotal,
          window_comments: data.windowComments,
          hardwood_upgrade_selected: data.hardwoodUpgradeSelected,
          bathroom_tile_selected: data.bathroomTileSelected,
          heated_floor_bathrooms: data.heatedFloorBathrooms,
          custom_tiled_shower: data.customTiledShower,
          backsplash_grout_enabled: data.backsplashGroutEnabled,
          backsplash_grout_color: data.backsplashGroutColor,
          backsplash_grout_comments: data.backsplashGroutComments,
          area_upgrades: data.areaUpgrades,
          upgrade_floor_selection: data.upgradeFloorSelection,
          upgrade_interests: data.upgradeInterests,
          sales_comments: data.salesComments,
          upgrade_comments: data.upgradeComments,
          upgrade_interests_notes: data.upgradeInterestsNotes,
          status: 'submitted',
          created_at: savedSelection?.created_at,
          pdf_base64: data.pdfBase64 || null,
        }),
      }).then(res => {
        if (res.ok) {
          console.log('HubSpot sync triggered successfully');
        } else {
          res.text().then(text => console.error('HubSpot sync failed:', text));
        }
      }).catch(err => console.error('HubSpot sync error:', err));
    }
    
    // Fetch dynamic pricing for accurate cost calculations
    const pricing = await fetchDynamicPricing();

    // === SINGLE SOURCE OF TRUTH ===
    // computeUpgradeTotalsServer() is the byte-for-byte mirror of the UI's
    // src/lib/upgradeTotals.ts. The admin HTML, buyer HTML, and CSV attachment
    // all derive their pricing rows and grand total from this one result so
    // they can never diverge. Informational-only flags (Premium Carpet/Underpad
    // Bedrooms/Stairs) are intentionally NOT charged here — they remain on
    // the SelectionData object as Yes/No flags for non-pricing display.
    const totals = computeUpgradeTotalsServer({
      unitTypeCode: data.unitType || null,
      upgradeFloorSelection: data.upgradeFloorSelection,
      areaUpgrades: data.areaUpgrades || [],
      backsplashGroutEnabled: data.backsplashGroutEnabled,
      backsplashGroutColor: data.backsplashGroutColor,
      stairLvpUpgradeSelected: data.stairLvpUpgradeSelected,
      stairPremiumCarpetSelected: data.stairPremiumCarpetSelected,
      stairUpgradeType: data.stairUpgradeType,
      additionalWindowsQty: data.additionalWindowsQty,
      patioDoorsQty: data.patioDoorsQty,
      automatedWindowsQty: data.automatedWindowsQty,
      bathroomTileSelected: data.bathroomTileSelected,
      heatedFloorBathrooms: data.heatedFloorBathrooms,
      customTiledShower: data.customTiledShower,
    }, pricing);

    // Pull the price scalars (still used by per-section HTML blocks for
    // line-by-line "qty × unit" display in the admin email).
    const additionalWindowPrice = totals.context.additionalWindowPrice;
    const patioDoorPrice = totals.context.patioDoorPrice;
    const automatedMotorPrice = totals.context.automatedMotorPrice;
    const heatedFloorPrice = totals.context.heatedFloorPerBathroom;
    const stairLvpPrice = pricing.config['stair_lvp_upgrade_price'] || 2160.00;
    const stairPremiumLvpPrice = pricing.config['stair_premium_lvp_upgrade_price'] || 3145.00;
    const stairCarpetUpgradePrice = pricing.config['premium_carpet_stairs_price'] || 640.00;
    const groutColorPrice = totals.context.groutColorPrice;
    const gstRate = totals.gstRate;

    // Subtotals re-exported for legacy section builders. All math comes
    // from `totals` — these are simple aliases, never independent calculations.
    const windowSubtotal = totals.windowSubtotal;
    const stairLvpSubtotal = totals.pieces.stairLvp;
    const stairCarpetSubtotal = totals.pieces.stairCarpet;
    const groutSubtotal = totals.pieces.grout;
    const bathroomTileSubtotal = totals.pieces.bathroomTile;
    const section4HeatedFloorSubtotal = totals.pieces.section4HeatedFloor;
    const customTiledShowerSubtotal = totals.pieces.customShower;
    const heatedFloorBathroomCount = Number(data.heatedFloorBathrooms) || 0;
    const bathroomGuestSqft = totals.context.bathroomGuestSqft;
    const bathroomEnsuiteSqft = totals.context.bathroomEnsuiteSqft;
    const tileCostPerSqft = totals.context.tileCostPerSqft;
    const showerBaseCost = totals.context.showerBaseCost;
    const effectiveUnitCode = normalizeUnitTypeCode(data.unitType);

    // Adapter so the existing per-row area-upgrade HTML lookups
    // (.find(l => l.areaId === ...)) keep working without change.
    const areaUpgradeCosts = {
      subtotal: totals.pieces.flooringUpgrades.reduce(
        (s, f) => s + f.amount + f.heatedFloorAmount, 0),
      lineItems: totals.pieces.flooringUpgrades.map(f => ({
        areaId: f.areaId,
        area: f.areaName,
        material: f.materialName,
        cost: f.amount,
        heatedFloor: f.heatedFloorAmount > 0,
        heatedCost: f.heatedFloorAmount,
      })),
    };

    const grandSubtotal = totals.grandSubtotal;
    const grandGst = totals.gst;
    const grandTotal = totals.grandTotal;
    
    const upgradesList = Object.entries(data.upgradeInterests)
      .filter(([_, v]) => v)
      .map(([key]) => escapeHtml(key.replace('-', ' ')))
      .join(', ') || 'None';

    // Build area upgrades HTML section WITH PRICING
    let areaUpgradesHtml = '';
    if (data.areaUpgrades && data.areaUpgrades.length > 0) {
      areaUpgradesHtml = `
        <div class="section" style="background: #ffffff; border: 1px solid #e5e7eb; border-left: 4px solid #1a1a2e;">
          <h2 style="color: #000000; margin-top: 0;">Area Upgrades Selected</h2>
          ${data.upgradeFloorSelection ? `<p style="color: #000000; margin-bottom: 15px;"><strong>Floor Selection (G/H units):</strong> Floor ${escapeHtml(data.upgradeFloorSelection)}</p>` : ''}
          <table style="color: #000000; width: 100%; border-collapse: collapse;">
            <tr style="border-bottom: 2px solid #d1d5db; background: #f9fafb;">
              <th style="text-align: left; padding: 10px 8px; color: #000000;">Area</th>
              <th style="text-align: left; padding: 10px 8px; color: #000000;">Material</th>
              <th style="text-align: left; padding: 10px 8px; color: #000000;">Product</th>
              <th style="text-align: left; padding: 10px 8px; color: #000000;">Color</th>
              <th style="text-align: left; padding: 10px 8px; color: #000000;">Heated</th>
              <th style="text-align: right; padding: 10px 8px; color: #000000;">Cost</th>
            </tr>
            ${data.areaUpgrades.map(u => {
              const lineItem = areaUpgradeCosts.lineItems.find(l => l.areaId === u.areaId);
              const materialCost = lineItem?.cost || 0;
              const heatedCost = lineItem?.heatedCost || 0;
              return `
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 10px 8px; color: #000000;">${escapeHtml(AREA_NAMES[u.areaId] || u.areaId)}</td>
                <td style="padding: 10px 8px; color: #000000;">${escapeHtml(MATERIAL_NAMES[u.materialType] || u.materialType)}</td>
                <td style="padding: 10px 8px; color: #000000;">${escapeHtml(u.productName) || 'N/A'}</td>
                <td style="padding: 10px 8px; color: #000000;">${escapeHtml(u.productColor) || 'N/A'}</td>
                <td style="padding: 10px 8px; color: #000000;">${u.heatedFloor ? '<strong style="color: #000000;">Yes (+$' + heatedFloorPrice.toFixed(0) + ')</strong>' : 'No'}</td>
                <td style="padding: 10px 8px; color: #000000; text-align: right; font-weight: bold;">$${(materialCost + heatedCost).toFixed(2)}</td>
              </tr>
              ${u.comments ? `<tr><td colspan="6" style="padding: 4px 8px 12px; color: #374151; font-size: 12px; font-style: italic;">Comments: ${escapeHtml(u.comments)}</td></tr>` : ''}
            `}).join('')}
            <tr style="border-top: 2px solid #1a1a2e; background: #f9fafb;">
              <td colspan="5" style="padding: 12px 8px 0; color: #000000; font-weight: bold;">Area Upgrades Subtotal:</td>
              <td style="padding: 12px 8px 0; color: #047857; text-align: right; font-weight: bold; font-size: 16px;">$${areaUpgradeCosts.subtotal.toFixed(2)}</td>
            </tr>
          </table>
        </div>
      `;
    }

    // Build backsplash grout HTML section with dynamic pricing
    let groutHtml = '';
    if (data.backsplashGroutEnabled) {
      const groutWithGst = groutColorPrice * (1 + gstRate);
      groutHtml = `
        <div class="section" style="background: #ffffff; border: 1px solid #e5e7eb; border-left: 4px solid #f59e0b;">
          <h2 style="color: #000000; margin-top: 0;">Custom Backsplash Grout Color</h2>
          <table style="color: #000000;">
            <tr><td style="color: #000000;"><strong>Grout Color:</strong></td><td style="color: #000000;">${escapeHtml(data.backsplashGroutColor) || 'Not specified'}</td></tr>
            <tr><td style="color: #000000;"><strong>Cost:</strong></td><td style="color: #000000;">$${groutColorPrice.toFixed(2)} + GST ($${groutWithGst.toFixed(2)} total)</td></tr>
          </table>
          ${data.backsplashGroutComments ? `<p style="margin-top: 10px; color: #374151; font-size: 14px;"><em>Comments: ${escapeHtml(data.backsplashGroutComments)}</em></p>` : ''}
        </div>
      `;
    }
    
    // Build stair flooring upgrade section
    let stairUpgradeHtml = '';
    if (data.stairLvpUpgradeSelected) {
      const stairLvpWithGst = stairLvpPrice * (1 + gstRate);
      stairUpgradeHtml = `
        <div class="section" style="background: #ffffff; border: 1px solid #e5e7eb; border-left: 4px solid #047857;">
          <h2 style="color: #000000; margin-top: 0;">Stair Flooring Upgrade</h2>
          <table style="color: #000000;">
            <tr><td style="color: #000000;"><strong>Selection:</strong></td><td style="color: #000000;">LVP with Custom Stair Nosings</td></tr>
            <tr><td style="color: #000000;"><strong>Cost:</strong></td><td style="color: #000000;">$${stairLvpPrice.toFixed(2)} + GST ($${stairLvpWithGst.toFixed(2)} total)</td></tr>
          </table>
        </div>
      `;
    } else if (data.stairPremiumCarpetSelected) {
      const stairCarpetWithGst = stairCarpetUpgradePrice * (1 + gstRate);
      stairUpgradeHtml = `
        <div class="section" style="background: #ffffff; border: 1px solid #e5e7eb; border-left: 4px solid #1a1a2e;">
          <h2 style="color: #000000; margin-top: 0;">Stair Flooring Upgrade</h2>
          <table style="color: #000000;">
            <tr><td style="color: #000000;"><strong>Selection:</strong></td><td style="color: #000000;">Premium Carpet Upgrade</td></tr>
            <tr><td style="color: #000000;"><strong>Cost:</strong></td><td style="color: #000000;">$${stairCarpetUpgradePrice.toFixed(2)} + GST ($${stairCarpetWithGst.toFixed(2)} total)</td></tr>
          </table>
        </div>
      `;
    }
    
    // Build comprehensive upgrade summary section for admin.
    // Rendered directly from `totals.lineItems` so the rows + grand total
    // here are guaranteed identical to the on-screen UpgradePricingSummary,
    // the buyer PDF, the buyer email, and the CSV attachment.
    let upgradeSummaryHtml = '';
    if (totals.grandSubtotal > 0) {
      const summaryItems = totals.lineItems.map(item => {
        const detail = item.detail
          ? `<div style="color:#374151; font-size:12px; margin-top:2px;">${escapeHtml(item.detail)}</div>`
          : '';
        return `<tr>
          <td style="padding:10px 8px; color:#000000; border-bottom:1px solid #e5e7eb;">${escapeHtml(item.label)}${detail}</td>
          <td style="padding:10px 8px; color:#000000; text-align:right; font-weight:bold; border-bottom:1px solid #e5e7eb;">$${item.amount.toFixed(2)}</td>
        </tr>`;
      }).join('');

      upgradeSummaryHtml = `
        <div class="section" style="background: #ffffff; border: 1px solid #d1d5db;">
          <h2 style="color: #000000; margin-top: 0;">Complete Upgrade Summary</h2>
          <table style="color: #000000; width: 100%; border-collapse: collapse;">
            ${summaryItems}
            <tr style="border-top: 2px solid #d1d5db;">
              <td style="padding: 12px 8px 8px; color: #000000;">Subtotal (pre-GST)</td>
              <td style="text-align: right; padding: 12px 8px 8px; color: #000000;">$${totals.grandSubtotal.toFixed(2)}</td>
            </tr>
            <tr>
              <td style="padding: 8px; color: #000000;">GST (${(totals.gstRate * 100).toFixed(0)}%)</td>
              <td style="text-align: right; padding: 8px; color: #000000;">$${totals.gst.toFixed(2)}</td>
            </tr>
            <tr style="border-top: 2px solid #1a1a2e;">
              <td style="padding: 14px 8px; color: #000000; font-size: 18px; font-weight: bold;">GRAND TOTAL (incl. GST)</td>
              <td style="text-align: right; padding: 14px 8px; font-size: 22px; font-weight: bold; color: #047857;">$${totals.grandTotal.toFixed(2)}</td>
            </tr>
          </table>
          <p style="margin-top: 12px; font-size: 11px; color: #374151;">* A 10% material overage is allowed on all quoted amounts.</p>
        </div>
      `;
    }

    // Use escaped values in HTML to prevent XSS
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #000000; background: #ffffff; }
          .container { max-width: 700px; margin: 0 auto; padding: 20px; background: #ffffff; }
          h1 { color: #000000; border-bottom: 2px solid #1a1a2e; padding-bottom: 10px; }
          h2 { color: #000000; margin-top: 25px; }
          .section { background: #ffffff; padding: 15px; border-radius: 8px; margin: 15px 0; border: 1px solid #e5e7eb; color: #000000; }
          .label { font-weight: bold; color: #000000; }
          .value { color: #000000; }
          .highlight { background: #ffffff; color: #000000; padding: 10px 15px; border-radius: 5px; border: 1px solid #e5e7eb; border-left: 4px solid #1a1a2e; }
          table { width: 100%; border-collapse: collapse; }
          td { padding: 8px 0; border-bottom: 1px solid #e5e7eb; color: #000000; }
          th { text-align: left; padding: 8px 0; color: #000000; }
          .comments { background: #fffbeb; padding: 10px; border-radius: 5px; margin-top: 10px; color: #000000; border: 1px solid #f59e0b; }
          .db-id { background: #f0fdf4; padding: 10px; border-radius: 5px; margin-bottom: 20px; color: #000000; border: 1px solid #86efac; }
          .csv-note { background: #eff6ff; padding: 10px; border-radius: 5px; margin-top: 20px; font-size: 13px; color: #000000; border: 1px solid #93c5fd; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>New Selection Submission</h1>
          
          ${savedSelection ? `<div class="db-id"><strong>Database ID:</strong> ${escapeHtml(String(savedSelection.id))}</div>` : ''}
          
          <div class="csv-note">
            <strong>CSV Data Attached:</strong> A complete CSV file with all selection data is attached to this email for easy import into spreadsheets.
          </div>
          
          <div class="section">
            <h2>Buyer Information</h2>
            <table>
              <tr><td class="label">Unit Number:</td><td class="value">${escapeHtml(data.unitNumber) || 'Not provided'}</td></tr>
              ${data.unitType ? `<tr><td class="label">Unit Type:</td><td class="value">${escapeHtml(data.unitType)}</td></tr>` : ''}
              <tr><td class="label">Name:</td><td class="value">${escapeHtml(data.firstName)} ${escapeHtml(data.lastName)}</td></tr>
              <tr><td class="label">Phone:</td><td class="value">${escapeHtml(data.phoneNumber) || 'Not provided'}</td></tr>
              <tr><td class="label">Email:</td><td class="value">${escapeHtml(data.email) || 'Not provided'}</td></tr>
              <tr><td class="label">Est. Possession:</td><td class="value">${data.estimatedPossessionDate ? new Date(data.estimatedPossessionDate).toLocaleDateString() : 'Not provided'}</td></tr>
              <tr><td class="label">Has Stairs:</td><td class="value">${data.hasStairs ? 'Yes' : 'No'}</td></tr>
            </table>
          </div>

          <div class="section">
            <h2>Flooring Selections</h2>
            <table>
              <tr><td class="label">Main Floor LVP:</td><td class="value">${escapeHtml(data.lvpColour) || 'Not selected'}</td></tr>
              <tr><td class="label">Bathroom/Laundry SPC:</td><td class="value">${escapeHtml(data.spcTileColour) || 'Not selected'}</td></tr>
              ${data.hasStairs ? `<tr><td class="label">Stairs Carpet:</td><td class="value">${escapeHtml(data.stairCarpetColour) || 'Not selected'}</td></tr>` : ''}
              <tr><td class="label">Bedroom Flooring:</td><td class="value">${data.bedroomFlooringChoice === 'lvp' ? 'Luxury Vinyl Plank' : escapeHtml(data.bedroomFlooringChoice) || 'Not selected'}</td></tr>
            </table>
            ${data.lvpComments ? `<div class="comments"><strong>LVP Comments:</strong> ${escapeHtml(data.lvpComments)}</div>` : ''}
          </div>

          <div class="section">
            <h2>Bathroom Tile</h2>
            <table>
              <tr><td class="label">Tile Selection:</td><td class="value">${escapeHtml(data.spcTileColour) || 'Not selected'}</td></tr>
            </table>
            ${data.spcTileComments ? `<div class="comments"><strong>Tile Comments:</strong> ${escapeHtml(data.spcTileComments)}</div>` : ''}
          </div>

          <div class="section">
            <h2>Kitchen Backsplash</h2>
            <table>
              <tr><td class="label">Orientation:</td><td class="value">${escapeHtml(data.backsplashOrientation) || 'Not selected'}</td></tr>
            </table>
          </div>

          ${groutHtml}
          
          ${stairUpgradeHtml}

          ${windowSubtotal > 0 ? `
          <div class="section" style="background: #ffffff; border: 1px solid #e5e7eb; border-left: 4px solid #1a1a2e;">
            <h2 style="color: #000000; margin-top: 0;">Window Covering Upgrades</h2>
            <table style="color: #000000; width: 100%; border-collapse: collapse;">
              ${data.additionalWindowsQty > 0 ? `<tr><td style="padding: 8px; color: #000000; border-bottom: 1px solid #e5e7eb;">Additional Windows (${data.additionalWindowsQty} × $${additionalWindowPrice.toFixed(2)}):</td><td style="padding: 8px; color: #000000; text-align: right; font-weight: bold; border-bottom: 1px solid #e5e7eb;">$${(data.additionalWindowsQty * additionalWindowPrice).toFixed(2)}</td></tr>` : ''}
              ${data.patioDoorsQty > 0 ? `<tr><td style="padding: 8px; color: #000000; border-bottom: 1px solid #e5e7eb;">Patio Door Panel Track (${data.patioDoorsQty} × $${patioDoorPrice.toFixed(2)}):</td><td style="padding: 8px; color: #000000; text-align: right; font-weight: bold; border-bottom: 1px solid #e5e7eb;">$${(data.patioDoorsQty * patioDoorPrice).toFixed(2)}</td></tr>` : ''}
              ${data.automatedWindowsQty > 0 ? `<tr><td style="padding: 8px; color: #000000; border-bottom: 1px solid #e5e7eb;">Somfy Automation (${data.automatedWindowsQty} × $${automatedMotorPrice.toFixed(2)}):</td><td style="padding: 8px; color: #000000; text-align: right; font-weight: bold; border-bottom: 1px solid #e5e7eb;">$${(data.automatedWindowsQty * automatedMotorPrice).toFixed(2)}</td></tr>` : ''}
              <tr style="border-top: 2px solid #d1d5db;"><td style="padding: 12px 8px; color: #000000;"><strong>Window Coverings Subtotal:</strong></td><td style="padding: 12px 8px; color: #047857; text-align: right; font-weight: bold;">$${windowSubtotal.toFixed(2)}</td></tr>
            </table>
            ${data.windowComments ? `<p style="margin-top: 10px; color: #374151; font-size: 14px;"><em>Notes: ${escapeHtml(data.windowComments)}</em></p>` : ''}
          </div>
          ` : ''}

          ${areaUpgradesHtml}
          
          ${upgradeSummaryHtml}

          ${data.upgradeComments ? `
          <div class="section" style="background: #fffbeb; border-left: 4px solid #f59e0b;">
            <h2 style="color: #92400e; margin-top: 0;">Upgrade Pricing Summary — Buyer Comments</h2>
            <p class="value">${escapeHtml(data.upgradeComments)}</p>
          </div>
          ` : ''}

          <div class="section">
            <h2>Upgrade Interests</h2>
            <p class="value">${upgradesList}</p>
            ${data.upgradeInterestsNotes ? `<div class="comments" style="margin-top: 10px;"><strong>Buyer Notes:</strong> ${escapeHtml(data.upgradeInterestsNotes)}</div>` : ''}
          </div>

          ${data.salesComments ? `
          <div class="section" style="background: #e8f4fd; border-left: 4px solid #2196F3;">
            <h2 style="color: #1565C0; margin-top: 0;">Sales Comments</h2>
            <p class="value">${escapeHtml(data.salesComments)}</p>
          </div>
          ` : ''}

          ${data.documentUploads && data.documentUploads.length > 0 ? `
          <div class="section" style="background: #fff3e0; border-left: 4px solid #ff9800;">
            <h2 style="color: #e65100; margin-top: 0;">Attached Documents (${data.documentUploads.length})</h2>
            <p style="font-size: 13px; margin-bottom: 10px;">The buyer has uploaded the following documents. Access them in Supabase Storage under the <strong>buyer-documents</strong> bucket:</p>
            <ul style="margin: 0; padding-left: 20px;">
              ${data.documentUploads.map(doc => `<li style="margin: 5px 0;"><strong>${escapeHtml(doc.name)}</strong> (${(doc.size / 1024).toFixed(1)} KB) — Path: <code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">${escapeHtml(doc.path)}</code></li>`).join('')}
            </ul>
          </div>
          ` : ''}

          <p style="margin-top: 30px; color: #374151; font-size: 12px;">
            This email was automatically generated by the BMD Materials Selection Portal.
          </p>
        </div>
      </body>
      </html>
    `;

    // CSV pricing breakdown — same line items, subtotal, GST, and grand total
    // as the admin HTML, the buyer email, and the buyer/admin PDFs.
    // Informational-only flags (Premium Carpet/Underpad Bedrooms/Stairs) are
    // intentionally omitted from these pricing rows; they remain in the CSV
    // above as Yes/No selection rows.
    const csvLineItems = totals.lineItems.map(item => ({
      label: item.detail ? `${item.label} — ${item.detail}` : item.label,
      cost: item.amount,
    }));

    const csvContent = generateCSV(data, savedSelection?.id as string | undefined, {
      lineItems: csvLineItems,
      subtotal: totals.grandSubtotal,
      gst: totals.gst,
      grandTotal: totals.grandTotal,
      gstRate: totals.gstRate,
    });
    const csvFilename = `selection_${data.unitNumber.replace(/[^a-zA-Z0-9]/g, '_')}_${data.lastName}_${new Date().toISOString().split('T')[0]}.csv`;

    // Send to BMD team (internal email with CSV) — isolated so DB save survives email failures
    let adminEmailResponse: { id?: string; error?: string } = {};
    try {
      adminEmailResponse = await sendEmailWithAttachment({
        from: "BMD Materials Portal <selections@bmdmaterials.com>",
        to: ["dan@bmdmaterials.com", "noni@bmdmaterials.com", "brian@bmdmaterials.com", "office@bmdmaterials.com", "gregor.mckenzie@nvc360.com"],
        subject: `New Selection Submission - Unit ${escapeHtml(data.unitNumber) || 'Unknown'}${data.unitType ? ` (${escapeHtml(data.unitType)})` : ''} - ${escapeHtml(data.firstName)} ${escapeHtml(data.lastName)}`,
        html: htmlContent,
        attachments: [
          {
            filename: csvFilename,
            content: csvContent,
          }
        ],
      });
      console.log("Admin email sent successfully:", adminEmailResponse);
    } catch (adminEmailError) {
      console.error("Admin email failed (submission still saved):", adminEmailError);
      adminEmailResponse = { error: adminEmailError instanceof Error ? adminEmailError.message : String(adminEmailError) };
    }

    // Send styled confirmation email to buyer with pricing data
    const buyerConfirmationHtml = generateBuyerConfirmationEmail(data, savedSelection?.id as string | undefined, {
      additionalWindowPrice,
      patioDoorPrice,
      automatedMotorPrice,
      heatedFloorPrice,
      stairLvpPrice,
      stairCarpetUpgradePrice,
      groutColorPrice,
      gstRate,
      areaUpgradeCosts,
      premiumCarpetBedroomSubtotal: 0,
      underpadBedroomSubtotal: 0,
      underpadStairsSubtotal: 0,
      bathroomTileSubtotal,
      bathroomGuestSqft,
      bathroomEnsuiteSqft,
      tileCostPerSqft,
      section4HeatedFloorSubtotal,
      heatedFloorBathroomCount,
      customTiledShowerSubtotal,
      showerBaseCost,
      markupPercentage: pricing.markupPercentage,
      totals,
    });
    
    try {
      await sendEmailWithAttachment({
        from: "BMD Materials <selections@bmdmaterials.com>",
        to: [data.email],
        subject: `Your Glendale Estates Selections Confirmed - Unit ${escapeHtml(data.unitNumber)}`,
        html: buyerConfirmationHtml,
      });
      console.log("Buyer confirmation email sent to:", data.email);
    } catch (buyerEmailError) {
      console.error("Failed to send buyer confirmation email:", buyerEmailError);
      // Don't fail the whole request if buyer email fails
    }

    return new Response(JSON.stringify({ 
      ...adminEmailResponse, 
      selectionId: savedSelection?.id,
      saved: Boolean(savedSelection?.id),
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: unknown) {
    console.error("Error in send-selections-email function:", error);
    return new Response(
      JSON.stringify({ error: "An error occurred processing your submission. Please try again." }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});

// Pricing parameters for buyer confirmation email
interface BuyerEmailPricing {
  additionalWindowPrice: number;
  patioDoorPrice: number;
  automatedMotorPrice: number;
  heatedFloorPrice: number;
  stairLvpPrice: number;
  stairCarpetUpgradePrice: number;
  groutColorPrice: number;
  gstRate: number;
  areaUpgradeCosts: { lineItems: Array<{ areaId: string; area: string; material: string; cost: number; heatedFloor?: boolean; heatedCost?: number }>; subtotal: number };
  premiumCarpetBedroomSubtotal: number;
  underpadBedroomSubtotal: number;
  underpadStairsSubtotal: number;
  bathroomTileSubtotal: number;
  bathroomGuestSqft: number;
  bathroomEnsuiteSqft: number;
  tileCostPerSqft: number;
  section4HeatedFloorSubtotal: number;
  heatedFloorBathroomCount: number;
  customTiledShowerSubtotal: number;
  showerBaseCost: number;
  markupPercentage: number;
  // Single source of truth for the Complete Upgrade Summary block.
  // When present, the buyer email renders rows + totals from this directly,
  // ensuring parity with the admin email, the CSV, and the buyer PDF.
  totals?: ServerTotalsResult;
}

// Generate a beautiful confirmation email for buyers with full details and costs
function generateBuyerConfirmationEmail(data: SelectionData, selectionId: string | undefined, pricing: BuyerEmailPricing): string {
  const submissionDate = new Date().toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  
  // Build comprehensive selection details
  const standardSelections: { label: string; value: string; detail?: string }[] = [];
  
  // Main Floor LVP
  if (data.lvpColour) {
    standardSelections.push({ 
      label: 'Main Floor LVP', 
      value: data.lvpColour,
      detail: data.lvpComments || undefined
    });
  }
  
  // Bathroom/Laundry Tile
  if (data.spcTileColour) {
    standardSelections.push({ 
      label: 'Bathroom/Laundry Tile', 
      value: data.spcTileColour,
      detail: data.spcTileComments || undefined
    });
  }
  
  // Kitchen Backsplash
  if (data.backsplashOrientation) {
    standardSelections.push({ 
      label: 'Kitchen Backsplash Orientation', 
      value: data.backsplashOrientation
    });
  }
  
  // Bedroom Flooring
  if (data.bedroomFlooringChoice) {
    let bedroomValue = data.bedroomFlooringChoice === 'lvp' ? 'Luxury Vinyl Plank' : 
                       data.bedroomFlooringChoice === 'carpet' ? 'Carpet' : data.bedroomFlooringChoice;
    if (data.bedroomFlooringChoice === 'carpet' && data.bedroomCarpetColour) {
      bedroomValue += ` - ${data.bedroomCarpetColour}`;
    } else if (data.bedroomFlooringChoice === 'lvp' && !data.bedroomLvpSameAsMain && data.bedroomLvpColour) {
      bedroomValue += ` - ${data.bedroomLvpColour}`;
    } else if (data.bedroomFlooringChoice === 'lvp' && data.bedroomLvpSameAsMain) {
      bedroomValue += ' (Same as Main Floor)';
    }
    standardSelections.push({ label: 'Bedroom Flooring', value: bedroomValue });
  }
  
  // Stair Flooring (if applicable) - use dynamic pricing
  if (data.hasStairs) {
    if (data.stairLvpUpgradeSelected) {
      standardSelections.push({ label: 'Stair Flooring', value: `LVP Upgrade with Custom Nosings ($${pricing.stairLvpPrice.toFixed(0)} + GST)` });
    } else if (data.stairPremiumCarpetSelected) {
      standardSelections.push({ label: 'Stair Flooring', value: `Premium Carpet Upgrade ($${pricing.stairCarpetUpgradePrice.toFixed(0)} + GST)` });
    } else if (data.stairCarpetColour) {
      standardSelections.push({ label: 'Stair Carpet', value: data.stairCarpetColour });
    } else {
      standardSelections.push({ label: 'Stair Flooring', value: 'Standard Carpet (Included)' });
    }
  }

  // Build standard selections HTML (no comments - those are internal)
  const standardSelectionsHtml = standardSelections.length > 0 ? `
    <tr>
      <td style="background: #ffffff; padding: 0 40px 30px;">
        <h2 style="margin: 0 0 16px; color: #000000; font-size: 18px; font-weight: 600;">Your Standard Selections</h2>
        <table role="presentation" style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
          ${standardSelections.map(item => `
            <tr>
              <td style="padding: 14px 16px; border-bottom: 1px solid #f0f0f0; color: #000000; font-size: 14px; font-weight: 600; width: 40%; background: #f9fafb;">${escapeHtml(item.label)}</td>
              <td style="padding: 14px 16px; border-bottom: 1px solid #f0f0f0; color: #000000; font-size: 14px; font-weight: 500;">
                ${escapeHtml(item.value)}
              </td>
            </tr>
          `).join('')}
        </table>
        <p style="margin: 12px 0 0; color: #374151; font-size: 13px; text-align: center;">Standard selections included with your home</p>
      </td>
    </tr>
  ` : '';

  // Window Coverings Section with Pricing
  let windowCoveringsHtml = '';
  if (data.additionalWindowsQty > 0 || data.patioDoorsQty > 0) {
    const windowItems: { item: string; qty: number; cost: string }[] = [];
    
    // Calculate window costs (using typical pricing - will be confirmed by team)
    if (data.additionalWindowsQty > 0) {
      windowItems.push({
        item: 'Additional Window Covering',
        qty: data.additionalWindowsQty,
        cost: 'See total below'
      });
    }
    if (data.patioDoorsQty > 0) {
      windowItems.push({
        item: 'Patio Door Panel Track',
        qty: data.patioDoorsQty,
        cost: 'See total below'
      });
    }

    windowCoveringsHtml = `
      <tr>
        <td style="background: #ffffff; padding: 0 40px 30px;">
          <h2 style="margin: 0 0 16px; color: #000000; font-size: 18px; font-weight: 600;">Window Covering Upgrades</h2>
          <table role="presentation" style="width: 100%; border-collapse: collapse; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
            <tr style="background: #f9fafb;">
              <th style="padding: 12px 16px; color: #000000; font-size: 13px; text-align: left; font-weight: 700; border-bottom: 2px solid #d1d5db;">Item</th>
              <th style="padding: 12px 16px; color: #000000; font-size: 13px; text-align: center; font-weight: 700; border-bottom: 2px solid #d1d5db;">Qty</th>
            </tr>
            ${windowItems.map(item => `
              <tr>
                <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; color: #000000; font-size: 14px;">${escapeHtml(item.item)}</td>
                <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; color: #000000; font-size: 14px; text-align: center; font-weight: 600;">${item.qty}</td>
              </tr>
            `).join('')}
            <tr style="background: #f9fafb;">
              <td style="padding: 14px 16px; color: #000000; font-size: 15px; font-weight: 600;">Total (incl. GST)</td>
              <td style="padding: 14px 16px; color: #047857; font-size: 18px; text-align: center; font-weight: 700;">$${data.windowTotal.toFixed(2)}</td>
            </tr>
          </table>
        </td>
      </tr>
    `;
  }

  // Premium Area Upgrades Section with PRICING
  let areaUpgradesHtml = '';
  if (data.areaUpgrades && data.areaUpgrades.length > 0) {
    const upgradeRows = data.areaUpgrades.map(upgrade => {
      const areaName = AREA_NAMES[upgrade.areaId] || upgrade.areaId;
      const materialName = MATERIAL_NAMES[upgrade.materialType] || upgrade.materialType;
      // Match by areaId for reliable lookup (same as admin email)
      const lineItem = pricing.areaUpgradeCosts.lineItems.find(l => l.areaId === upgrade.areaId);
      const materialCost = lineItem?.cost || 0;
      const heatedCost = lineItem?.heatedCost || 0;
      const totalCost = materialCost + heatedCost;
      
      return `
        <tr>
          <td style="padding: 14px 16px; border-bottom: 1px solid #e5e7eb;">
            <div style="color: #000000; font-size: 14px; font-weight: 600;">${escapeHtml(areaName)}</div>
            <div style="color: #374151; font-size: 12px; margin-top: 2px;">${escapeHtml(materialName)}</div>
          </td>
          <td style="padding: 14px 16px; border-bottom: 1px solid #e5e7eb;">
            <div style="color: #000000; font-size: 14px;">${escapeHtml(upgrade.productName) || 'Standard'}</div>
            ${upgrade.productColor ? `<div style="color: #374151; font-size: 12px; margin-top: 2px;">Color: ${escapeHtml(upgrade.productColor)}</div>` : ''}
          </td>
          <td style="padding: 14px 16px; border-bottom: 1px solid #e5e7eb; text-align: center;">
            ${upgrade.heatedFloor ? `<span style="background: #fef3c7; color: #000000; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; border: 1px solid #f59e0b;">+$${pricing.heatedFloorPrice.toFixed(0)}</span>` : '<span style="color: #6b7280; font-size: 12px;">—</span>'}
          </td>
          <td style="padding: 14px 16px; border-bottom: 1px solid #e5e7eb; text-align: right;">
            <div style="color: #000000; font-size: 14px; font-weight: 700;">$${totalCost.toFixed(2)}</div>
          </td>
        </tr>
      `;
    }).join('');

    areaUpgradesHtml = `
      <tr>
        <td style="background: #ffffff; padding: 0 40px 30px;">
          <h2 style="margin: 0 0 16px; color: #000000; font-size: 18px; font-weight: 600;">Premium Area Upgrades</h2>
          ${data.upgradeFloorSelection ? `<p style="margin: 0 0 12px; color: #000000; font-size: 14px; background: #f9fafb; padding: 10px 14px; border-radius: 6px; border: 1px solid #e5e7eb;"><strong>Floor Selection:</strong> Floor ${escapeHtml(data.upgradeFloorSelection)}</p>` : ''}
          <table role="presentation" style="width: 100%; border-collapse: collapse; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
            <tr style="background: #f9fafb;">
              <th style="padding: 12px 16px; color: #000000; font-size: 13px; text-align: left; font-weight: 700; border-bottom: 2px solid #d1d5db;">Area</th>
              <th style="padding: 12px 16px; color: #000000; font-size: 13px; text-align: left; font-weight: 700; border-bottom: 2px solid #d1d5db;">Product</th>
              <th style="padding: 12px 16px; color: #000000; font-size: 13px; text-align: center; font-weight: 700; border-bottom: 2px solid #d1d5db;">Heated</th>
              <th style="padding: 12px 16px; color: #000000; font-size: 13px; text-align: right; font-weight: 700; border-bottom: 2px solid #d1d5db;">Cost</th>
            </tr>
            ${upgradeRows}
            <tr style="background: #f9fafb;">
              <td colspan="3" style="padding: 14px 16px; color: #000000; font-size: 14px; font-weight: 700; border-top: 2px solid #d1d5db;">Area Upgrades Subtotal</td>
              <td style="padding: 14px 16px; color: #047857; font-size: 16px; text-align: right; font-weight: 700; border-top: 2px solid #d1d5db;">$${pricing.areaUpgradeCosts.subtotal.toFixed(2)}</td>
            </tr>
          </table>
        </td>
      </tr>
    `;
  }

  // Backsplash Grout Color Change with dynamic pricing
  let groutHtml = '';
  if (data.backsplashGroutEnabled) {
    const groutWithGst = pricing.groutColorPrice * (1 + pricing.gstRate);
    groutHtml = `
      <tr>
        <td style="background: #ffffff; padding: 0 40px 30px;">
          <h2 style="margin: 0 0 16px; color: #000000; font-size: 18px; font-weight: 600;">Custom Backsplash Grout</h2>
          <table role="presentation" style="width: 100%; border-collapse: collapse; background: #fffbeb; border: 1px solid #f59e0b; border-radius: 12px; overflow: hidden;">
            <tr>
              <td style="padding: 16px 20px;">
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="color: #000000; font-size: 14px; padding: 8px 0;"><strong>Grout Color:</strong></td>
                    <td style="color: #000000; font-size: 14px; font-weight: 600; padding: 8px 0;">${escapeHtml(data.backsplashGroutColor) || 'To be confirmed'}</td>
                  </tr>
                  <tr>
                    <td style="color: #000000; font-size: 14px; padding: 8px 0;"><strong>Cost:</strong></td>
                    <td style="color: #000000; font-size: 16px; font-weight: 700; padding: 8px 0;">$${groutWithGst.toFixed(2)} <span style="font-size: 12px; font-weight: 400; color: #374151;">(incl. GST)</span></td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    `;
  }

  // Heated Floors Section - now consolidated into Complete Upgrade Summary
  // Only show if using legacy heatedFloorBathrooms field AND not captured in area upgrades
  const heatedFloorAreasCheck = (data.areaUpgrades || []).filter(
    u => u.heatedFloor && ['guestBathroom', 'masterEnsuite'].includes(u.areaId)
  );
  let heatedFloorsHtml = '';
  // Only show legacy heated floors section if there are legacy selections not in area upgrades
  if (data.heatedFloorBathrooms && data.heatedFloorBathrooms > 0 && heatedFloorAreasCheck.length === 0) {
    heatedFloorsHtml = `
      <tr>
        <td style="background: #ffffff; padding: 0 40px 30px;">
          <h2 style="margin: 0 0 16px; color: #000000; font-size: 18px; font-weight: 600;">Heated Tile Floors</h2>
          <table role="presentation" style="width: 100%; border-collapse: collapse; background: #fef2f2; border: 1px solid #fca5a5; border-radius: 12px;">
            <tr>
              <td style="padding: 20px;">
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="color: #000000; font-size: 14px;"><strong>Bathrooms with Heated Floors:</strong></td>
                    <td style="color: #000000; font-size: 20px; font-weight: 700; text-align: right;">${data.heatedFloorBathrooms} bathroom${data.heatedFloorBathrooms > 1 ? 's' : ''}</td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    `;
  }

  // Upgrade Interests Section
  let upgradeInterestsHtml = '';
  const interests = Object.entries(data.upgradeInterests || {})
    .filter(([_, v]) => v)
    .map(([key]) => key.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()));
  
  if (interests.length > 0) {
    upgradeInterestsHtml = `
      <tr>
        <td style="background: #ffffff; padding: 0 40px 30px;">
          <h2 style="margin: 0 0 16px; color: #000000; font-size: 18px; font-weight: 600;">Additional Interests</h2>
          <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 12px; padding: 16px 20px;">
            <p style="margin: 0; color: #000000; font-size: 14px;">You've expressed interest in learning more about:</p>
            <div style="margin-top: 12px;">
              ${interests.map(interest => `<span style="display: inline-block; background: #ffffff; color: #000000; padding: 6px 12px; border-radius: 20px; font-size: 13px; font-weight: 500; border: 1px solid #86efac; margin: 0 6px 6px 0;">${escapeHtml(interest)}</span>`).join(' ')}
            </div>
            <p style="margin: 12px 0 0; color: #000000; font-size: 12px;">Our team will reach out to discuss these options with you.</p>
          </div>
        </td>
      </tr>
    `;
  }

  // Sales Comments Section
  let salesCommentsHtml = '';
  if (data.salesComments) {
    salesCommentsHtml = `
      <tr>
        <td style="background: #ffffff; padding: 0 40px 30px;">
          <h2 style="margin: 0 0 16px; color: #1a1a2e; font-size: 18px; font-weight: 600;">Your Comments</h2>
          <div style="background: #f8f9fa; border: 1px solid #e0e0e0; border-radius: 12px; padding: 16px 20px;">
            <p style="margin: 0; color: #1a1a2e; font-size: 14px; line-height: 1.6;">${escapeHtml(data.salesComments)}</p>
          </div>
        </td>
      </tr>
    `;
  }

  // Complete Upgrade Summary — rendered from the shared `totals` object so
  // the line items, subtotal, GST, and grand total here are guaranteed
  // identical to the on-screen summary, the buyer PDF, the admin email,
  // and the CSV attachment. Informational-only flags (Premium Carpet/
  // Underpad Bedrooms/Stairs) are intentionally omitted from pricing rows.
  let estimatedTotalHtml = '';
  const t = pricing.totals;
  if (t && t.grandSubtotal > 0) {
    const lineItemsHtml = t.lineItems.map(item => {
      const detail = item.detail
        ? `<div style="color:#374151; font-size:12px; margin-top:2px;">${escapeHtml(item.detail)}</div>`
        : '';
      return `<tr>
        <td style="padding: 10px 0; color: #1a1a2e; font-size: 14px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(item.label)}${detail}</td>
        <td style="padding: 10px 0; color: #1a1a2e; font-size: 14px; text-align: right; font-weight: 500; border-bottom: 1px solid #e5e7eb;">$${item.amount.toFixed(2)}</td>
      </tr>`;
    }).join('');

    estimatedTotalHtml = `
      <tr>
        <td style="background: #ffffff; padding: 0 40px 30px;">
          <table role="presentation" style="width: 100%; border-collapse: collapse; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
            <tr>
              <td style="padding: 24px;">
                <h2 style="margin: 0 0 16px; color: #1a1a2e; font-size: 18px; font-weight: 600; text-align: center;">Complete Upgrade Summary</h2>
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                  ${lineItemsHtml}
                  <tr>
                    <td style="padding: 14px 0 8px; color: #1a1a2e; font-size: 14px;">Subtotal (pre-GST)</td>
                    <td style="padding: 14px 0 8px; color: #1a1a2e; font-size: 14px; text-align: right;">$${t.grandSubtotal.toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #1a1a2e; font-size: 14px;">GST (${(t.gstRate * 100).toFixed(0)}%)</td>
                    <td style="padding: 8px 0; color: #1a1a2e; font-size: 14px; text-align: right;">$${t.gst.toFixed(2)}</td>
                  </tr>
                  <tr style="border-top: 2px solid #1a1a2e;">
                    <td style="padding: 16px 0 0; color: #1a1a2e; font-size: 16px; font-weight: 600;">Grand Total (incl. GST)</td>
                    <td style="padding: 16px 0 0; color: #047857; font-size: 24px; text-align: right; font-weight: 700;">$${t.grandTotal.toFixed(2)}</td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    `;
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Your Selections are Confirmed</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f5f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
      <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
          <td align="center" style="padding: 40px 20px;">
            <table role="presentation" style="width: 100%; max-width: 640px; border-collapse: collapse;">
              
              <!-- Header -->
              <tr>
                <td align="center" style="padding: 30px 40px; background: #ffffff; border-radius: 16px 16px 0 0; border-bottom: 1px solid #e5e7eb;">
                  <img src="https://glendaleestates.lovable.app/images/bmd-logo.png" alt="Glendale Estates" style="height: 45px; margin-bottom: 20px;">
                  <h1 style="margin: 0; color: #000000; font-size: 24px; font-weight: 600;">Your Selections Are Confirmed!</h1>
                  <p style="margin: 10px 0 0; color: #000000; font-size: 15px;">Thank you for completing your home selections, ${escapeHtml(data.firstName)}!</p>
                </td>
              </tr>
              
              <!-- Success Badge -->
              <tr>
                <td style="background: #ffffff; padding: 0;">
                  <table role="presentation" style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td align="center" style="padding: 30px 40px 20px;">
                        <div style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 50%; width: 64px; height: 64px; line-height: 64px; text-align: center;">
                          <span style="color: white; font-size: 28px;">✓</span>
                        </div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              
              <!-- Unit Info Card -->
              <tr>
                <td style="background: #ffffff; padding: 0 40px 30px;">
                  <table role="presentation" style="width: 100%; border-collapse: collapse; background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); border-radius: 12px;">
                    <tr>
                      <td style="padding: 24px;">
                        <table role="presentation" style="width: 100%; border-collapse: collapse;">
                          <tr>
                            <td style="width: 33%;">
                              <p style="margin: 0 0 4px; color: #374151; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Unit Number</p>
                              <p style="margin: 0; color: #1a1a2e; font-size: 20px; font-weight: 700;">${escapeHtml(data.unitNumber)}</p>
                            </td>
                            <td style="width: 33%;">
                              <p style="margin: 0 0 4px; color: #374151; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Unit Type</p>
                              <p style="margin: 0; color: #1a1a2e; font-size: 20px; font-weight: 700;">${escapeHtml(data.unitType || 'N/A')}</p>
                            </td>
                            <td style="width: 33%;">
                              <p style="margin: 0 0 4px; color: #374151; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Has Stairs</p>
                              <p style="margin: 0; color: #1a1a2e; font-size: 20px; font-weight: 700;">${data.hasStairs ? 'Yes' : 'No'}</p>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              
              <!-- Standard Selections -->
              ${standardSelectionsHtml}
              
              <!-- Window Coverings with Pricing -->
              ${windowCoveringsHtml}
              
              <!-- Premium Area Upgrades -->
              ${areaUpgradesHtml}
              
              <!-- Custom Grout Color -->
              ${groutHtml}
              
              <!-- Heated Floors -->
              ${heatedFloorsHtml}
              
              <!-- Upgrade Interests -->
              ${upgradeInterestsHtml}
              
              <!-- Sales Comments -->
              ${salesCommentsHtml}
              
              <!-- Estimated Total -->
              ${estimatedTotalHtml}
              
              <!-- Reference Number -->
              <tr>
                <td style="background: #ffffff; padding: 0 40px 30px;">
                  <table role="presentation" style="width: 100%; border-collapse: collapse; background: #fffbeb; border-radius: 8px; border: 1px solid #f59e0b; border-left: 4px solid #f59e0b;">
                    <tr>
                      <td style="padding: 16px 20px;">
                        <p style="margin: 0 0 4px; color: #000000; font-size: 12px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Your Reference Number</p>
                        <p style="margin: 0; color: #000000; font-size: 16px; font-family: monospace; font-weight: 600;">${escapeHtml(selectionId || 'Pending')}</p>
                        <p style="margin: 8px 0 0; color: #374151; font-size: 13px;">Please save this for your records</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              
              <!-- What's Next -->
              <tr>
                <td style="background: #ffffff; padding: 0 40px 30px;">
                  <h2 style="margin: 0 0 16px; color: #1a1a2e; font-size: 18px; font-weight: 600;">What Happens Next?</h2>
                  <table role="presentation" style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td style="padding: 12px 0; vertical-align: top;">
                        <table role="presentation" style="border-collapse: collapse;">
                          <tr>
                            <td style="width: 32px; vertical-align: top;">
                              <div style="background: #e0f2fe; border-radius: 50%; width: 28px; height: 28px; line-height: 28px; text-align: center; color: #0369a1; font-weight: 600; font-size: 13px;">1</div>
                            </td>
                            <td style="padding-left: 12px;">
                              <p style="margin: 0; color: #1a1a2e; font-size: 14px; font-weight: 500;">Review by our team</p>
                              <p style="margin: 4px 0 0; color: #374151; font-size: 13px;">We'll verify your selections and prepare any upgrade quotes</p>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 12px 0; vertical-align: top;">
                        <table role="presentation" style="border-collapse: collapse;">
                          <tr>
                            <td style="width: 32px; vertical-align: top;">
                              <div style="background: #e0f2fe; border-radius: 50%; width: 28px; height: 28px; line-height: 28px; text-align: center; color: #0369a1; font-weight: 600; font-size: 13px;">2</div>
                            </td>
                            <td style="padding-left: 12px;">
                              <p style="margin: 0; color: #1a1a2e; font-size: 14px; font-weight: 500;">We'll be in touch</p>
                              <p style="margin: 4px 0 0; color: #374151; font-size: 13px;">If any clarification is needed or to discuss upgrade options</p>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 12px 0; vertical-align: top;">
                        <table role="presentation" style="border-collapse: collapse;">
                          <tr>
                            <td style="width: 32px; vertical-align: top;">
                              <div style="background: #e0f2fe; border-radius: 50%; width: 28px; height: 28px; line-height: 28px; text-align: center; color: #0369a1; font-weight: 600; font-size: 13px;">3</div>
                            </td>
                            <td style="padding-left: 12px;">
                              <p style="margin: 0; color: #1a1a2e; font-size: 14px; font-weight: 500;">Payment of Upgrades</p>
                              <p style="margin: 4px 0 0; color: #374151; font-size: 13px;">A BMD associate will be in touch to collect payment for your upgrades prior to materials being ordered, which may be 3-5 months prior to your possession date.</p>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 12px 0; vertical-align: top;">
                        <table role="presentation" style="border-collapse: collapse;">
                          <tr>
                            <td style="width: 32px; vertical-align: top;">
                              <div style="background: #e0f2fe; border-radius: 50%; width: 28px; height: 28px; line-height: 28px; text-align: center; color: #0369a1; font-weight: 600; font-size: 13px;">4</div>
                            </td>
                            <td style="padding-left: 12px;">
                              <p style="margin: 0; color: #1a1a2e; font-size: 14px; font-weight: 500;">Installation Coordination</p>
                              <p style="margin: 4px 0 0; color: #374151; font-size: 13px;">Materials will be ordered and scheduled for your possession date</p>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              
              <!-- Contact Card -->
              <tr>
                <td style="background: #ffffff; padding: 0 40px 30px;">
                  <table role="presentation" style="width: 100%; border-collapse: collapse; background: #f8f9fa; border-radius: 12px;">
                    <tr>
                      <td style="padding: 24px; text-align: center;">
                        <p style="margin: 0 0 8px; color: #1a1a2e; font-size: 15px; font-weight: 500;">Questions about your selections?</p>
                        <p style="margin: 0; color: #374151; font-size: 14px;">Contact us at <a href="mailto:office@bmdmaterials.com" style="color: #e94560; text-decoration: none; font-weight: 500;">office@bmdmaterials.com</a></p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="background: #f9fafb; padding: 30px 40px; border-radius: 0 0 16px 16px; text-align: center; border-top: 1px solid #e5e7eb;">
                  <p style="margin: 0 0 8px; color: #000000; font-size: 14px; font-weight: 500;">BMD Materials</p>
                  <p style="margin: 0 0 16px; color: #1a1a2e; font-size: 13px;">Glendale Estates Selection Portal</p>
                  <p style="margin: 0; color: #4b5563; font-size: 12px;">Submitted on ${submissionDate}</p>
                </td>
              </tr>
              
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}
// =====================================================================
// Preview / Test helpers — render buyer/admin emails with sample data
// so we can render in a browser or send a one-off test email to verify
// legibility in Gmail/Outlook before any real submissions go out.
// =====================================================================

function buildPreviewSampleData(overrides: Record<string, unknown>): SelectionData {
  const base: SelectionData = {
    unitNumber: '00',
    unitType: 'Type C (Preview)',
    firstName: 'Sample',
    lastName: 'Buyer',
    phoneNumber: '555-0100',
    email: 'preview@example.com',
    estimatedPossessionDate: new Date().toISOString(),
    hasStairs: true,
    lvpColour: 'Cortland',
    lvpComments: '',
    spcTileColour: 'Frost White',
    spcTileComments: '',
    backsplashOrientation: 'Stacked',
    stairCarpetColour: 'Standard',
    stairLvpUpgradeSelected: false,
    stairPremiumCarpetSelected: true,
    stairUpgradeType: 'standard',
    premiumCarpetBedroom: true,
    premiumUnderpadBedroom: true,
    premiumUnderpadStairs: true,
    bedroomFlooringChoice: 'lvp',
    bedroomCarpetColour: null,
    bedroomLvpColour: 'Cortland',
    bedroomLvpSameAsMain: true,
    additionalWindowsQty: 2,
    patioDoorsQty: 1,
    automatedWindowsQty: 2,
    windowComments: '',
    salesComments: 'Preview submission — used to verify email legibility.',
    upgradeInterests: { 'heated-tile-floor': true, 'custom-shower': true },
    windowTotal: 4960.5,
    hardwoodUpgradeSelected: false,
    bathroomTileSelected: true,
    heatedFloorBathrooms: 2,
    customTiledShower: true,
    areaUpgrades: [],
    upgradeFloorSelection: null,
    backsplashGroutEnabled: true,
    backsplashGroutColor: 'Charcoal',
    backsplashGroutComments: '',
    upgradeComments: '',
    upgradeInterestsNotes: '',
    documentUploads: [],
  };
  return { ...base, ...(overrides as Partial<SelectionData>) };
}

// Sample pricing config that mirrors the real DB-backed pricing object
// the production flow loads. Used only by preview/test endpoints so we
// can exercise computeUpgradeTotalsServer() — the SAME function that
// drives real emails — and guarantee the preview math matches production.
function buildPreviewServerPricing() {
  return {
    materials: {
      lvp: 4.5,
      lvt: 5.0,
      tile: 17.0,
      carpet: 3.5,
      hardwood: 9.0,
      tiled_shower: 5250.0,
      nonstandard_lvp: 5.0,
      nonstandard_lvt: 5.5,
      nonstandard_tile: 18.0,
    },
    config: {
      additional_window_price: 673.5,
      patio_door_price: 2347.8,
      automated_motor_price: 645.0,
      heated_floor_per_bathroom: 1850.0,
      stair_lvp_upgrade_price: 2160.0,
      stair_premium_lvp_upgrade_price: 3145.0,
      premium_carpet_stairs_price: 640.0,
      grout_color_change_price: 300.0,
    },
    unitAreas: {
      C: {
        mainLiving: 600,
        secondBedroom: 120,
        masterBedroom: 180,
        masterBedroomLvp: 180,
        guestBathroom: 55,
        masterEnsuite: 80,
        laundry: 25,
        backsplash: 35,
      },
    },
    markupPercentage: 0.6,
    gstRate: 0.05,
  };
}

function buildPreviewTotals(data: SelectionData): ServerTotalsResult {
  const pricing = buildPreviewServerPricing();
  return computeUpgradeTotalsServer({
    unitTypeCode: 'C',
    upgradeFloorSelection: null,
    areaUpgrades: [
      { areaId: 'secondBedroom', materialType: 'lvp', productName: 'Cortland' },
      { areaId: 'guestBathroom', materialType: 'tile', productName: 'Frost White', heatedFloor: false },
      { areaId: 'masterEnsuite', materialType: 'tile', productName: 'Frost White', heatedFloor: false },
    ],
    backsplashGroutEnabled: !!data.backsplashGroutEnabled,
    backsplashGroutColor: data.backsplashGroutColor || null,
    stairLvpUpgradeSelected: !!data.stairLvpUpgradeSelected,
    stairPremiumCarpetSelected: !!data.stairPremiumCarpetSelected,
    stairUpgradeType: data.stairUpgradeType || 'standard',
    additionalWindowsQty: data.additionalWindowsQty || 0,
    patioDoorsQty: data.patioDoorsQty || 0,
    automatedWindowsQty: data.automatedWindowsQty || 0,
    bathroomTileSelected: !!data.bathroomTileSelected,
    heatedFloorBathrooms: data.heatedFloorBathrooms || 0,
    customTiledShower: !!data.customTiledShower,
  }, pricing);
}

function buildPreviewBuyerPricing(totals: ServerTotalsResult): BuyerEmailPricing {
  // Adapter so generateBuyerConfirmationEmail (which still consumes the
  // legacy BuyerEmailPricing shape) renders entirely from `totals`.
  return {
    additionalWindowPrice: totals.context.additionalWindowPrice,
    patioDoorPrice: totals.context.patioDoorPrice,
    automatedMotorPrice: totals.context.automatedMotorPrice,
    heatedFloorPrice: totals.context.heatedFloorPerBathroom,
    stairLvpPrice: 2160,
    stairCarpetUpgradePrice: 640,
    groutColorPrice: totals.context.groutColorPrice,
    gstRate: totals.gstRate,
    areaUpgradeCosts: {
      subtotal: totals.pieces.flooringUpgrades.reduce((s, f) => s + f.amount, 0),
      lineItems: totals.pieces.flooringUpgrades.map(f => ({
        areaName: f.areaName,
        materialName: f.materialName,
        productName: f.productName,
        productColor: f.productColor,
        amount: f.amount,
        heatedFloorAmount: f.heatedFloorAmount,
      })),
    },
    premiumCarpetBedroomSubtotal: 0,
    underpadBedroomSubtotal: 0,
    underpadStairsSubtotal: 0,
    bathroomTileSubtotal: totals.pieces.bathroomTile,
    bathroomGuestSqft: totals.context.bathroomGuestSqft,
    bathroomEnsuiteSqft: totals.context.bathroomEnsuiteSqft,
    tileCostPerSqft: totals.context.tileCostPerSqft,
    section4HeatedFloorSubtotal: totals.pieces.section4HeatedFloor,
    heatedFloorBathroomCount: data => 0, // unused fallback; real value below
    customTiledShowerSubtotal: totals.pieces.customShower,
    showerBaseCost: totals.context.showerBaseCost,
    markupPercentage: totals.markupPercentage,
    totals,
  } as unknown as BuyerEmailPricing;
}

function renderPreviewBuyerHtml(data: SelectionData): string {
  const totals = buildPreviewTotals(data);
  const pricing = buildPreviewBuyerPricing(totals) as BuyerEmailPricing & Record<string, unknown>;
  // Restore the scalar count field expected by the legacy template
  (pricing as Record<string, unknown>).heatedFloorBathroomCount = data.heatedFloorBathrooms || 0;
  return generateBuyerConfirmationEmail(data, 'PREVIEW-0000', pricing);
}

function renderPreviewAdminHtml(data: SelectionData): string {
  // Render the admin preview directly from totals.lineItems — the same
  // source the production admin email uses — so the preview reflects
  // exactly what staff will receive.
  const totals = buildPreviewTotals(data);
  const rows = totals.lineItems.map(item =>
    `<tr><td style="padding:10px 8px; color:#000000; border-bottom:1px solid #e5e7eb;">${escapeHtml(item.label)}${item.detail ? ` <span style="color:#4b5563;">— ${escapeHtml(item.detail)}</span>` : ''}</td><td style="padding:10px 8px; color:#000000; text-align:right; font-weight:600; border-bottom:1px solid #e5e7eb;">$${item.amount.toFixed(2)}</td></tr>`
  ).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Admin Email Preview</title></head>
<body style="margin:0; padding:24px; background:#f9fafb; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif; color:#000000;">
  <div style="max-width:700px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:12px; padding:32px;">
    <h1 style="margin:0 0 8px; color:#000000; font-size:22px;">New Selection Submission (Preview)</h1>
    <p style="margin:0 0 20px; color:#374151; font-size:13px;">Unit ${escapeHtml(data.unitNumber)} — ${escapeHtml(data.firstName)} ${escapeHtml(data.lastName)}</p>
    <h2 style="color:#000000; font-size:16px; margin:0 0 12px;">Complete Upgrade Summary</h2>
    <table style="width:100%; border-collapse:collapse; color:#000000;">
      ${rows}
      <tr><td style="padding:12px 8px; color:#000000; border-top:2px solid #d1d5db;">Subtotal (pre-GST)</td><td style="padding:12px 8px; color:#000000; text-align:right; border-top:2px solid #d1d5db;">$${totals.grandSubtotal.toFixed(2)}</td></tr>
      <tr><td style="padding:8px; color:#000000;">GST (${(totals.gstRate * 100).toFixed(0)}%)</td><td style="padding:8px; color:#000000; text-align:right;">$${totals.gst.toFixed(2)}</td></tr>
      <tr><td style="padding:14px 8px; color:#000000; font-size:18px; font-weight:700; border-top:2px solid #1a1a2e;">GRAND TOTAL (incl. GST)</td><td style="padding:14px 8px; color:#047857; font-size:22px; font-weight:700; text-align:right; border-top:2px solid #1a1a2e;">$${totals.grandTotal.toFixed(2)}</td></tr>
    </table>
  </div>
</body></html>`;
}
