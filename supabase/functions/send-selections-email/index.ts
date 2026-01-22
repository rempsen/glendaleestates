import { getCorsHeaders, corsHeaders } from "../_shared/cors.ts";

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

// Generate CSV content from selection data
function generateCSV(data: SelectionData, savedId: string | undefined): string {
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
  
  // Upgrade Interests
  rows.push(['--- UPGRADE INTERESTS ---', '']);
  const interests = Object.entries(data.upgradeInterests || {})
    .filter(([_, v]) => v)
    .map(([k]) => k);
  rows.push(['Interested In', interests.length > 0 ? interests.join(', ') : 'None']);
  
  // Comments
  rows.push(['--- COMMENTS ---', '']);
  rows.push(['Sales Comments', data.salesComments || '']);
  
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
    body.attachments = options.attachments.map(att => ({
      filename: att.filename,
      content: btoa(att.content), // Base64 encode the CSV content
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
  bedroomFlooringChoice?: string | null;
  bedroomCarpetColour?: string | null;
  bedroomLvpColour?: string | null;
  bedroomLvpSameAsMain: boolean;
  additionalWindowsQty: number;
  patioDoorsQty: number;
  windowComments?: string | null;
  salesComments?: string | null;
  upgradeInterests: Record<string, boolean>;
  windowTotal: number;
  hardwoodUpgradeSelected?: boolean;
  bathroomTileSelected?: boolean;
  heatedFloorBathrooms?: number;
  // New upgrade fields
  areaUpgrades?: AreaUpgrade[];
  upgradeFloorSelection?: string | null;
  backsplashGroutEnabled?: boolean;
  backsplashGroutColor?: string | null;
  backsplashGroutComments?: string | null;
  // PDF for HubSpot
  pdfBase64?: string | null;
}

// Area name mapping for display
const AREA_NAMES: Record<string, string> = {
  mainLiving: 'Main Living Area',
  secondBedroom: 'Second Bedroom',
  masterBedroom: 'Master Bedroom',
  secondBedroomCarpet: 'Second Bedroom Carpet',
  guestBathroom: 'Guest Bathroom',
  masterEnsuite: 'Master Ensuite',
  laundry: 'Laundry Room',
  backsplash: 'Kitchen Backsplash',
  allLvp: 'Entire Unit LVP',
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

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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
    
    // Parse area upgrades
    let areaUpgrades: AreaUpgrade[] = [];
    if (Array.isArray(rawData.areaUpgrades)) {
      areaUpgrades = rawData.areaUpgrades.map((u: unknown) => {
        const upgrade = u as Record<string, unknown>;
        return {
          areaId: String(upgrade.areaId || ''),
          materialType: String(upgrade.materialType || ''),
          productName: String(upgrade.productName || '').slice(0, 200),
          productColor: String(upgrade.productColor || '').slice(0, 100),
          comments: String(upgrade.comments || '').slice(0, 2000),
          heatedFloor: Boolean(upgrade.heatedFloor),
        };
      });
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
      bedroomFlooringChoice: rawData.bedroomFlooringChoice ? String(rawData.bedroomFlooringChoice).trim().slice(0, 100) : null,
      bedroomCarpetColour: rawData.bedroomCarpetColour ? String(rawData.bedroomCarpetColour).trim().slice(0, 100) : null,
      bedroomLvpColour: rawData.bedroomLvpColour ? String(rawData.bedroomLvpColour).trim().slice(0, 100) : null,
      bedroomLvpSameAsMain: Boolean(rawData.bedroomLvpSameAsMain),
      additionalWindowsQty: Math.max(0, Math.min(100, Number(rawData.additionalWindowsQty) || 0)),
      patioDoorsQty: Math.max(0, Math.min(50, Number(rawData.patioDoorsQty) || 0)),
      windowComments: rawData.windowComments ? String(rawData.windowComments).trim().slice(0, 2000) : null,
      salesComments: rawData.salesComments ? String(rawData.salesComments).trim().slice(0, 5000) : null,
      upgradeInterests: typeof rawData.upgradeInterests === 'object' ? rawData.upgradeInterests : {},
      windowTotal: Math.max(0, Math.min(1000000, Number(rawData.windowTotal) || 0)),
      hardwoodUpgradeSelected: Boolean(rawData.hardwoodUpgradeSelected),
      bathroomTileSelected: Boolean(rawData.bathroomTileSelected),
      heatedFloorBathrooms: Math.max(0, Math.min(10, Number(rawData.heatedFloorBathrooms) || 0)),
      // New upgrade fields
      areaUpgrades: areaUpgrades,
      upgradeFloorSelection: rawData.upgradeFloorSelection ? String(rawData.upgradeFloorSelection).trim().slice(0, 10) : null,
      backsplashGroutEnabled: Boolean(rawData.backsplashGroutEnabled),
      backsplashGroutColor: rawData.backsplashGroutColor ? String(rawData.backsplashGroutColor).trim().slice(0, 100) : null,
      backsplashGroutComments: rawData.backsplashGroutComments ? String(rawData.backsplashGroutComments).trim().slice(0, 2000) : null,
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
      heated_floor_bathrooms: data.heatedFloorBathrooms,
      // New upgrade fields
      area_upgrades: data.areaUpgrades,
      upgrade_floor_selection: data.upgradeFloorSelection,
      backsplash_grout_enabled: data.backsplashGroutEnabled,
      backsplash_grout_color: data.backsplashGroutColor,
      backsplash_grout_comments: data.backsplashGroutComments,
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
          backsplash_grout_enabled: data.backsplashGroutEnabled,
          backsplash_grout_color: data.backsplashGroutColor,
          backsplash_grout_comments: data.backsplashGroutComments,
          area_upgrades: data.areaUpgrades,
          upgrade_floor_selection: data.upgradeFloorSelection,
          upgrade_interests: data.upgradeInterests,
          sales_comments: data.salesComments,
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
    
    const upgradesList = Object.entries(data.upgradeInterests)
      .filter(([_, v]) => v)
      .map(([key]) => escapeHtml(key.replace('-', ' ')))
      .join(', ') || 'None';

    // Build area upgrades HTML section
    let areaUpgradesHtml = '';
    if (data.areaUpgrades && data.areaUpgrades.length > 0) {
      areaUpgradesHtml = `
        <div class="section highlight" style="background: #9b59b6;">
          <h2 style="color: white; margin-top: 0;">Area Upgrades Selected</h2>
          ${data.upgradeFloorSelection ? `<p style="color: white; margin-bottom: 15px;"><strong>Floor Selection (G/H units):</strong> Floor ${escapeHtml(data.upgradeFloorSelection)}</p>` : ''}
          <table style="color: white; width: 100%;">
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.3);">
              <th style="text-align: left; padding: 8px 0;">Area</th>
              <th style="text-align: left; padding: 8px 0;">Material</th>
              <th style="text-align: left; padding: 8px 0;">Product</th>
              <th style="text-align: left; padding: 8px 0;">Color</th>
              <th style="text-align: left; padding: 8px 0;">Heated</th>
            </tr>
            ${data.areaUpgrades.map(u => `
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.2);">
                <td style="padding: 8px 0;">${escapeHtml(AREA_NAMES[u.areaId] || u.areaId)}</td>
                <td style="padding: 8px 0;">${escapeHtml(MATERIAL_NAMES[u.materialType] || u.materialType)}</td>
                <td style="padding: 8px 0;">${escapeHtml(u.productName) || 'N/A'}</td>
                <td style="padding: 8px 0;">${escapeHtml(u.productColor) || 'N/A'}</td>
                <td style="padding: 8px 0;">${u.heatedFloor ? '<strong style="color: #ffd700;">Yes</strong>' : 'No'}</td>
              </tr>
              ${u.comments ? `<tr><td colspan="5" style="padding: 4px 0 12px; font-size: 12px; font-style: italic;">Comments: ${escapeHtml(u.comments)}</td></tr>` : ''}
            `).join('')}
          </table>
        </div>
      `;
    }

    // Build backsplash grout HTML section
    let groutHtml = '';
    if (data.backsplashGroutEnabled) {
      groutHtml = `
        <div class="section" style="background: #f39c12; color: white;">
          <h2 style="color: white; margin-top: 0;">Custom Backsplash Grout Color</h2>
          <table style="color: white;">
            <tr><td><strong>Grout Color:</strong></td><td>${escapeHtml(data.backsplashGroutColor) || 'Not specified'}</td></tr>
            <tr><td><strong>Cost:</strong></td><td>$300.00 + GST ($315.00 total)</td></tr>
          </table>
          ${data.backsplashGroutComments ? `<p style="margin-top: 10px; font-size: 14px;"><em>Comments: ${escapeHtml(data.backsplashGroutComments)}</em></p>` : ''}
        </div>
      `;
    }

    // Use escaped values in HTML to prevent XSS
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 700px; margin: 0 auto; padding: 20px; }
          h1 { color: #1a1a2e; border-bottom: 2px solid #e94560; padding-bottom: 10px; }
          h2 { color: #16213e; margin-top: 25px; }
          .section { background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0; }
          .label { font-weight: bold; color: #666; }
          .value { color: #1a1a2e; }
          .highlight { background: #e94560; color: white; padding: 10px 15px; border-radius: 5px; }
          table { width: 100%; border-collapse: collapse; }
          td { padding: 8px 0; border-bottom: 1px solid #eee; }
          th { text-align: left; padding: 8px 0; }
          .comments { background: #fff3cd; padding: 10px; border-radius: 5px; margin-top: 10px; }
          .db-id { background: #d4edda; padding: 10px; border-radius: 5px; margin-bottom: 20px; }
          .csv-note { background: #e3f2fd; padding: 10px; border-radius: 5px; margin-top: 20px; font-size: 13px; }
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

          ${data.additionalWindowsQty > 0 || data.patioDoorsQty > 0 ? `
          <div class="section highlight">
            <h2 style="color: white; margin-top: 0;">Window Covering Extensions</h2>
            <table style="color: white;">
              <tr><td>Additional Windows:</td><td>${data.additionalWindowsQty}</td></tr>
              <tr><td>Patio Doors:</td><td>${data.patioDoorsQty}</td></tr>
              <tr><td><strong>Total (incl. GST):</strong></td><td><strong>$${data.windowTotal.toFixed(2)}</strong></td></tr>
            </table>
            ${data.windowComments ? `<p style="margin-top: 10px; font-size: 14px;"><em>Notes: ${escapeHtml(data.windowComments)}</em></p>` : ''}
          </div>
          ` : ''}

          ${areaUpgradesHtml}

          <div class="section">
            <h2>Heated Floors & Other Options</h2>
            <table>
              <tr><td class="label">Heated Floor Bathrooms:</td><td class="value">${data.heatedFloorBathrooms || 0} bathroom(s)</td></tr>
              <tr><td class="label">Bathroom Tile Upgrade:</td><td class="value">${data.bathroomTileSelected ? 'Yes' : 'No'}</td></tr>
            </table>
          </div>

          <div class="section">
            <h2>Upgrade Interests</h2>
            <p class="value">${upgradesList}</p>
          </div>

          ${data.salesComments ? `
          <div class="section" style="background: #e8f4fd; border-left: 4px solid #2196F3;">
            <h2 style="color: #1565C0; margin-top: 0;">Sales Comments</h2>
            <p class="value">${escapeHtml(data.salesComments)}</p>
          </div>
          ` : ''}

          <p style="margin-top: 30px; color: #666; font-size: 12px;">
            This email was automatically generated by the BMD Materials Selection Portal.
          </p>
        </div>
      </body>
      </html>
    `;

    // Generate CSV content
    const csvContent = generateCSV(data, savedSelection?.id as string | undefined);
    const csvFilename = `selection_${data.unitNumber.replace(/[^a-zA-Z0-9]/g, '_')}_${data.lastName}_${new Date().toISOString().split('T')[0]}.csv`;

    // Send to BMD team (internal email with CSV)
    const adminEmailResponse = await sendEmailWithAttachment({
      from: "BMD Materials Portal <selections@bmdmaterials.com>",
      to: ["dan@bmdmaterials.com", "noni@bmdmaterials.com", "office@bmdmaterials.com"],
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

    // Send styled confirmation email to buyer
    const buyerConfirmationHtml = generateBuyerConfirmationEmail(data, savedSelection?.id as string | undefined);
    
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
      selectionId: savedSelection?.id 
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

// Generate a beautiful confirmation email for buyers with full details and costs
function generateBuyerConfirmationEmail(data: SelectionData, selectionId: string | undefined): string {
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
  
  // Stair Carpet (if applicable)
  if (data.hasStairs && data.stairCarpetColour) {
    standardSelections.push({ label: 'Stair Carpet', value: data.stairCarpetColour });
  }

  // Build standard selections HTML (no comments - those are internal)
  const standardSelectionsHtml = standardSelections.length > 0 ? `
    <tr>
      <td style="background: #ffffff; padding: 0 40px 30px;">
        <h2 style="margin: 0 0 16px; color: #1a1a2e; font-size: 18px; font-weight: 600;">🏠 Your Standard Selections</h2>
        <table role="presentation" style="width: 100%; border-collapse: collapse; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
          ${standardSelections.map(item => `
            <tr>
              <td style="padding: 14px 16px; border-bottom: 1px solid #f0f0f0; color: #666; font-size: 14px; width: 40%;">${escapeHtml(item.label)}</td>
              <td style="padding: 14px 16px; border-bottom: 1px solid #f0f0f0; color: #1a1a2e; font-size: 14px; font-weight: 500;">
                ${escapeHtml(item.value)}
              </td>
            </tr>
          `).join('')}
        </table>
        <p style="margin: 12px 0 0; color: #666; font-size: 13px; text-align: center;">✓ Standard selections included with your home</p>
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
          <h2 style="margin: 0 0 16px; color: #1a1a2e; font-size: 18px; font-weight: 600;">🪟 Window Covering Upgrades</h2>
          <table role="presentation" style="width: 100%; border-collapse: collapse; background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border-radius: 12px; overflow: hidden;">
            <tr style="background: #0369a1;">
              <th style="padding: 12px 16px; color: white; font-size: 13px; text-align: left; font-weight: 600;">Item</th>
              <th style="padding: 12px 16px; color: white; font-size: 13px; text-align: center; font-weight: 600;">Qty</th>
            </tr>
            ${windowItems.map(item => `
              <tr>
                <td style="padding: 12px 16px; border-bottom: 1px solid rgba(3,105,161,0.1); color: #0c4a6e; font-size: 14px;">${escapeHtml(item.item)}</td>
                <td style="padding: 12px 16px; border-bottom: 1px solid rgba(3,105,161,0.1); color: #0c4a6e; font-size: 14px; text-align: center; font-weight: 600;">${item.qty}</td>
              </tr>
            `).join('')}
            <tr style="background: #0369a1;">
              <td style="padding: 14px 16px; color: white; font-size: 15px; font-weight: 600;">Total (incl. GST)</td>
              <td style="padding: 14px 16px; color: #fbbf24; font-size: 18px; text-align: center; font-weight: 700;">$${data.windowTotal.toFixed(2)}</td>
            </tr>
          </table>
        </td>
      </tr>
    `;
  }

  // Premium Area Upgrades Section
  let areaUpgradesHtml = '';
  if (data.areaUpgrades && data.areaUpgrades.length > 0) {
    const upgradeRows = data.areaUpgrades.map(upgrade => {
      const areaName = AREA_NAMES[upgrade.areaId] || upgrade.areaId;
      const materialName = MATERIAL_NAMES[upgrade.materialType] || upgrade.materialType;
      
      return `
        <tr>
          <td style="padding: 14px 16px; border-bottom: 1px solid rgba(147,51,234,0.1);">
            <div style="color: #581c87; font-size: 14px; font-weight: 600;">${escapeHtml(areaName)}</div>
            <div style="color: #7e22ce; font-size: 12px; margin-top: 2px;">${escapeHtml(materialName)}</div>
          </td>
          <td style="padding: 14px 16px; border-bottom: 1px solid rgba(147,51,234,0.1);">
            <div style="color: #581c87; font-size: 14px;">${escapeHtml(upgrade.productName) || 'Standard'}</div>
            ${upgrade.productColor ? `<div style="color: #9333ea; font-size: 12px; margin-top: 2px;">Color: ${escapeHtml(upgrade.productColor)}</div>` : ''}
          </td>
          <td style="padding: 14px 16px; border-bottom: 1px solid rgba(147,51,234,0.1); text-align: center;">
            ${upgrade.heatedFloor ? '<span style="background: #fbbf24; color: #78350f; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">🔥 HEATED</span>' : '<span style="color: #a1a1aa; font-size: 12px;">—</span>'}
          </td>
        </tr>
      `;
    }).join('');

    areaUpgradesHtml = `
      <tr>
        <td style="background: #ffffff; padding: 0 40px 30px;">
          <h2 style="margin: 0 0 16px; color: #1a1a2e; font-size: 18px; font-weight: 600;">✨ Premium Area Upgrades</h2>
          ${data.upgradeFloorSelection ? `<p style="margin: 0 0 12px; color: #7e22ce; font-size: 14px; background: #faf5ff; padding: 10px 14px; border-radius: 6px;"><strong>Floor Selection:</strong> Floor ${escapeHtml(data.upgradeFloorSelection)}</p>` : ''}
          <table role="presentation" style="width: 100%; border-collapse: collapse; background: linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%); border-radius: 12px; overflow: hidden;">
            <tr style="background: linear-gradient(135deg, #9333ea 0%, #7e22ce 100%);">
              <th style="padding: 12px 16px; color: white; font-size: 13px; text-align: left; font-weight: 600;">Area</th>
              <th style="padding: 12px 16px; color: white; font-size: 13px; text-align: left; font-weight: 600;">Product</th>
              <th style="padding: 12px 16px; color: white; font-size: 13px; text-align: center; font-weight: 600;">Heated</th>
            </tr>
            ${upgradeRows}
          </table>
          <p style="margin: 12px 0 0; color: #7e22ce; font-size: 13px; text-align: center;">💰 Pricing will be confirmed by our team</p>
        </td>
      </tr>
    `;
  }

  // Backsplash Grout Color Change
  let groutHtml = '';
  if (data.backsplashGroutEnabled) {
    groutHtml = `
      <tr>
        <td style="background: #ffffff; padding: 0 40px 30px;">
          <h2 style="margin: 0 0 16px; color: #1a1a2e; font-size: 18px; font-weight: 600;">🎨 Custom Backsplash Grout</h2>
          <table role="presentation" style="width: 100%; border-collapse: collapse; background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-radius: 12px; overflow: hidden;">
            <tr>
              <td style="padding: 16px 20px;">
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="color: #92400e; font-size: 14px; padding: 8px 0;"><strong>Grout Color:</strong></td>
                    <td style="color: #78350f; font-size: 14px; font-weight: 600; padding: 8px 0;">${escapeHtml(data.backsplashGroutColor) || 'To be confirmed'}</td>
                  </tr>
                  <tr>
                    <td style="color: #92400e; font-size: 14px; padding: 8px 0;"><strong>Cost:</strong></td>
                    <td style="color: #78350f; font-size: 16px; font-weight: 700; padding: 8px 0;">$315.00 <span style="font-size: 12px; font-weight: 400;">(incl. GST)</span></td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    `;
  }

  // Heated Floors Section
  let heatedFloorsHtml = '';
  if (data.heatedFloorBathrooms && data.heatedFloorBathrooms > 0) {
    heatedFloorsHtml = `
      <tr>
        <td style="background: #ffffff; padding: 0 40px 30px;">
          <h2 style="margin: 0 0 16px; color: #1a1a2e; font-size: 18px; font-weight: 600;">🔥 Heated Tile Floors</h2>
          <table role="presentation" style="width: 100%; border-collapse: collapse; background: linear-gradient(135deg, #fef2f2 0%, #fecaca 100%); border-radius: 12px;">
            <tr>
              <td style="padding: 20px;">
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="color: #991b1b; font-size: 14px;"><strong>Bathrooms with Heated Floors:</strong></td>
                    <td style="color: #7f1d1d; font-size: 20px; font-weight: 700; text-align: right;">${data.heatedFloorBathrooms} bathroom${data.heatedFloorBathrooms > 1 ? 's' : ''}</td>
                  </tr>
                </table>
                <p style="margin: 12px 0 0; color: #b91c1c; font-size: 13px; text-align: center;">💰 Pricing will be confirmed by our team</p>
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
          <h2 style="margin: 0 0 16px; color: #1a1a2e; font-size: 18px; font-weight: 600;">💡 Additional Interests</h2>
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 16px 20px;">
            <p style="margin: 0; color: #166534; font-size: 14px;">You've expressed interest in learning more about:</p>
            <div style="margin-top: 12px; display: flex; flex-wrap: wrap; gap: 8px;">
              ${interests.map(interest => `<span style="display: inline-block; background: #dcfce7; color: #15803d; padding: 6px 12px; border-radius: 20px; font-size: 13px; font-weight: 500;">${escapeHtml(interest)}</span>`).join(' ')}
            </div>
            <p style="margin: 12px 0 0; color: #16a34a; font-size: 12px;">Our team will reach out to discuss these options with you.</p>
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
          <h2 style="margin: 0 0 16px; color: #1a1a2e; font-size: 18px; font-weight: 600;">💬 Your Comments</h2>
          <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 16px 20px;">
            <p style="margin: 0; color: #1e40af; font-size: 14px; line-height: 1.6;">${escapeHtml(data.salesComments)}</p>
          </div>
        </td>
      </tr>
    `;
  }

  // Estimated Total Section (if there are any priced items)
  let estimatedTotalHtml = '';
  const hasWindowCosts = data.windowTotal > 0;
  const hasGroutCost = data.backsplashGroutEnabled;
  
  if (hasWindowCosts || hasGroutCost) {
    const groutCost = hasGroutCost ? 315 : 0;
    const totalEstimate = data.windowTotal + groutCost;
    
    estimatedTotalHtml = `
      <tr>
        <td style="background: #ffffff; padding: 0 40px 30px;">
          <table role="presentation" style="width: 100%; border-collapse: collapse; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 12px; overflow: hidden;">
            <tr>
              <td style="padding: 24px;">
                <h2 style="margin: 0 0 16px; color: white; font-size: 18px; font-weight: 600; text-align: center;">📊 Estimated Costs Summary</h2>
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                  ${hasWindowCosts ? `
                    <tr>
                      <td style="padding: 10px 0; color: rgba(255,255,255,0.8); font-size: 14px;">Window Coverings</td>
                      <td style="padding: 10px 0; color: white; font-size: 14px; text-align: right; font-weight: 500;">$${data.windowTotal.toFixed(2)}</td>
                    </tr>
                  ` : ''}
                  ${hasGroutCost ? `
                    <tr>
                      <td style="padding: 10px 0; color: rgba(255,255,255,0.8); font-size: 14px;">Custom Backsplash Grout</td>
                      <td style="padding: 10px 0; color: white; font-size: 14px; text-align: right; font-weight: 500;">$315.00</td>
                    </tr>
                  ` : ''}
                  <tr style="border-top: 1px solid rgba(255,255,255,0.2);">
                    <td style="padding: 16px 0 0; color: white; font-size: 16px; font-weight: 600;">Confirmed Total (incl. GST)</td>
                    <td style="padding: 16px 0 0; color: #10b981; font-size: 24px; text-align: right; font-weight: 700;">$${totalEstimate.toFixed(2)}</td>
                  </tr>
                </table>
                ${(data.areaUpgrades && data.areaUpgrades.length > 0) || (data.heatedFloorBathrooms && data.heatedFloorBathrooms > 0) ? `
                  <p style="margin: 16px 0 0; color: rgba(255,255,255,0.7); font-size: 12px; text-align: center; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 16px;">
                    ⚠️ Premium area upgrades and heated floors will be quoted separately by our team
                  </p>
                ` : ''}
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
                <td align="center" style="padding: 30px 40px; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 16px 16px 0 0;">
                  <img src="https://glendaleestates.lovable.app/images/bmd-logo.png" alt="Glendale Estates" style="height: 45px; margin-bottom: 20px;">
                  <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">Your Selections Are Confirmed!</h1>
                  <p style="margin: 10px 0 0; color: rgba(255,255,255,0.8); font-size: 15px;">Thank you for completing your home selections, ${escapeHtml(data.firstName)}!</p>
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
                              <p style="margin: 0 0 4px; color: #666; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Unit Number</p>
                              <p style="margin: 0; color: #1a1a2e; font-size: 20px; font-weight: 700;">${escapeHtml(data.unitNumber)}</p>
                            </td>
                            <td style="width: 33%;">
                              <p style="margin: 0 0 4px; color: #666; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Unit Type</p>
                              <p style="margin: 0; color: #1a1a2e; font-size: 20px; font-weight: 700;">${escapeHtml(data.unitType || 'N/A')}</p>
                            </td>
                            <td style="width: 33%;">
                              <p style="margin: 0 0 4px; color: #666; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Has Stairs</p>
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
                  <table role="presentation" style="width: 100%; border-collapse: collapse; background: #fff8e6; border-radius: 8px; border-left: 4px solid #f59e0b;">
                    <tr>
                      <td style="padding: 16px 20px;">
                        <p style="margin: 0 0 4px; color: #92400e; font-size: 12px; text-transform: uppercase; font-weight: 600;">Your Reference Number</p>
                        <p style="margin: 0; color: #78350f; font-size: 16px; font-family: monospace; font-weight: 600;">${escapeHtml(selectionId || 'Pending')}</p>
                        <p style="margin: 8px 0 0; color: #a16207; font-size: 13px;">Please save this for your records</p>
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
                              <p style="margin: 4px 0 0; color: #666; font-size: 13px;">We'll verify your selections and prepare any upgrade quotes</p>
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
                              <p style="margin: 4px 0 0; color: #666; font-size: 13px;">If any clarification is needed or to discuss upgrade options</p>
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
                              <p style="margin: 0; color: #1a1a2e; font-size: 14px; font-weight: 500;">Installation coordination</p>
                              <p style="margin: 4px 0 0; color: #666; font-size: 13px;">Materials will be ordered and scheduled for your possession date</p>
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
                        <p style="margin: 0; color: #666; font-size: 14px;">Contact us at <a href="mailto:office@bmdmaterials.com" style="color: #e94560; text-decoration: none; font-weight: 500;">office@bmdmaterials.com</a></p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="background: #1a1a2e; padding: 30px 40px; border-radius: 0 0 16px 16px; text-align: center;">
                  <p style="margin: 0 0 8px; color: rgba(255,255,255,0.9); font-size: 14px; font-weight: 500;">BMD Materials</p>
                  <p style="margin: 0 0 16px; color: rgba(255,255,255,0.6); font-size: 13px;">Glendale Estates Selection Portal</p>
                  <p style="margin: 0; color: rgba(255,255,255,0.4); font-size: 12px;">Submitted on ${submissionDate}</p>
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