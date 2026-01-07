const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

// Send email using Resend REST API
async function sendEmail(options: {
  from: string;
  to: string[];
  subject: string;
  html: string;
}): Promise<{ id?: string; error?: string }> {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  
  if (!resendApiKey) {
    throw new Error("RESEND_API_KEY not configured");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: options.from,
      to: options.to,
      subject: options.subject,
      html: options.html,
    }),
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
}

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
          lvp_colour: data.lvpColour,
          spc_tile_colour: data.spcTileColour,
          backsplash_orientation: data.backsplashOrientation,
          bedroom_flooring_choice: data.bedroomFlooringChoice,
          additional_windows_qty: data.additionalWindowsQty,
          patio_doors_qty: data.patioDoorsQty,
          window_total: data.windowTotal,
          hardwood_upgrade_selected: data.hardwoodUpgradeSelected,
          bathroom_tile_selected: data.bathroomTileSelected,
          heated_floor_bathrooms: data.heatedFloorBathrooms,
          status: 'submitted',
          created_at: savedSelection?.created_at,
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

    // Use escaped values in HTML to prevent XSS
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          h1 { color: #1a1a2e; border-bottom: 2px solid #e94560; padding-bottom: 10px; }
          h2 { color: #16213e; margin-top: 25px; }
          .section { background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0; }
          .label { font-weight: bold; color: #666; }
          .value { color: #1a1a2e; }
          .highlight { background: #e94560; color: white; padding: 10px 15px; border-radius: 5px; }
          table { width: 100%; border-collapse: collapse; }
          td { padding: 8px 0; border-bottom: 1px solid #eee; }
          .comments { background: #fff3cd; padding: 10px; border-radius: 5px; margin-top: 10px; }
          .db-id { background: #d4edda; padding: 10px; border-radius: 5px; margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🏠 New Selection Submission</h1>
          
          ${savedSelection ? `<div class="db-id"><strong>Database ID:</strong> ${escapeHtml(String(savedSelection.id))}</div>` : ''}
          
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

    const emailResponse = await sendEmail({
      from: "BMD Materials Portal <selections@bmdmaterials.com>",
      to: ["dan@bmdmaterials.com", "office@bmdmaterials.com"],
      subject: `New Selection Submission - Unit ${escapeHtml(data.unitNumber) || 'Unknown'}${data.unitType ? ` (${escapeHtml(data.unitType)})` : ''} - ${escapeHtml(data.firstName)} ${escapeHtml(data.lastName)}`,
      html: htmlContent,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ 
      ...emailResponse, 
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