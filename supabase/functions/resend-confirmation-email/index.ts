import { getCorsHeaders, corsHeaders } from "../_shared/cors.ts";

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
    body: JSON.stringify(options),
  });

  const result = await response.json();
  
  if (!response.ok) {
    throw new Error(result.message || "Failed to send email");
  }
  
  return result;
}

// Supabase REST API helper to fetch submission
async function supabaseSelect(table: string, id: string): Promise<{ data: Record<string, unknown> | null; error: string | null }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?id=eq.${id}`, {
    method: "GET",
    headers: {
      "apikey": supabaseServiceKey,
      "Authorization": `Bearer ${supabaseServiceKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    return { data: null, error: errorText };
  }

  const result = await response.json();
  return { data: Array.isArray(result) && result.length > 0 ? result[0] : null, error: null };
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

// Generate buyer confirmation email HTML
function generateBuyerConfirmationEmail(submission: Record<string, unknown>): string {
  const submissionDate = new Date().toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  
  const firstName = submission.first_name as string;
  const lastName = submission.last_name as string;
  const unitNumber = submission.unit_number as string;
  const unitType = submission.unit_type as string | null;
  const email = submission.email as string;
  const lvpColour = submission.lvp_colour as string | null;
  const spcTileColour = submission.spc_tile_colour as string | null;
  const backsplashOrientation = submission.backsplash_orientation as string | null;
  const bedroomFlooringChoice = submission.bedroom_flooring_choice as string | null;
  const bedroomCarpetColour = submission.bedroom_carpet_colour as string | null;
  const bedroomLvpColour = submission.bedroom_lvp_colour as string | null;
  const bedroomLvpSameAsMain = submission.bedroom_lvp_same_as_main as boolean;
  const hasStairs = submission.has_stairs as boolean;
  const stairCarpetColour = submission.stair_carpet_colour as string | null;
  const additionalWindowsQty = submission.additional_windows_qty as number || 0;
  const patioDoorsQty = submission.patio_doors_qty as number || 0;
  const windowTotal = submission.window_total as number || 0;
  const areaUpgrades = (submission.area_upgrades as AreaUpgrade[]) || [];
  const upgradeFloorSelection = submission.upgrade_floor_selection as string | null;
  const backsplashGroutEnabled = submission.backsplash_grout_enabled as boolean;
  const backsplashGroutColor = submission.backsplash_grout_color as string | null;
  const heatedFloorBathrooms = submission.heated_floor_bathrooms as number || 0;
  const upgradeInterests = (submission.upgrade_interests as Record<string, boolean>) || {};
  const selectionId = submission.id as string;
  
  // Build comprehensive selection details
  const standardSelections: { label: string; value: string }[] = [];
  
  // Main Floor LVP
  if (lvpColour) {
    standardSelections.push({ label: 'Main Floor LVP', value: lvpColour });
  }
  
  // Bathroom/Laundry Tile
  if (spcTileColour) {
    standardSelections.push({ label: 'Bathroom/Laundry Tile', value: spcTileColour });
  }
  
  // Kitchen Backsplash
  if (backsplashOrientation) {
    standardSelections.push({ label: 'Kitchen Backsplash Orientation', value: backsplashOrientation });
  }
  
  // Bedroom Flooring
  if (bedroomFlooringChoice) {
    let bedroomValue = bedroomFlooringChoice === 'lvp' ? 'Luxury Vinyl Plank' : 
                       bedroomFlooringChoice === 'carpet' ? 'Carpet' : bedroomFlooringChoice;
    if (bedroomFlooringChoice === 'carpet' && bedroomCarpetColour) {
      bedroomValue += ` - ${bedroomCarpetColour}`;
    } else if (bedroomFlooringChoice === 'lvp' && !bedroomLvpSameAsMain && bedroomLvpColour) {
      bedroomValue += ` - ${bedroomLvpColour}`;
    } else if (bedroomFlooringChoice === 'lvp' && bedroomLvpSameAsMain) {
      bedroomValue += ' (Same as Main Floor)';
    }
    standardSelections.push({ label: 'Bedroom Flooring', value: bedroomValue });
  }
  
  // Stair Carpet
  if (hasStairs && stairCarpetColour) {
    standardSelections.push({ label: 'Stair Carpet', value: stairCarpetColour });
  }

  // Build standard selections HTML
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

  // Window Coverings Section
  let windowCoveringsHtml = '';
  if (additionalWindowsQty > 0 || patioDoorsQty > 0) {
    const windowItems: { item: string; qty: number }[] = [];
    
    if (additionalWindowsQty > 0) {
      windowItems.push({ item: 'Additional Window Covering', qty: additionalWindowsQty });
    }
    if (patioDoorsQty > 0) {
      windowItems.push({ item: 'Patio Door Panel Track', qty: patioDoorsQty });
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
              <td style="padding: 14px 16px; color: #fbbf24; font-size: 18px; text-align: center; font-weight: 700;">$${windowTotal.toFixed(2)}</td>
            </tr>
          </table>
        </td>
      </tr>
    `;
  }

  // Premium Area Upgrades Section
  let areaUpgradesHtml = '';
  if (areaUpgrades && areaUpgrades.length > 0) {
    const upgradeRows = areaUpgrades.map(upgrade => {
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
          ${upgradeFloorSelection ? `<p style="margin: 0 0 12px; color: #7e22ce; font-size: 14px; background: #faf5ff; padding: 10px 14px; border-radius: 6px;"><strong>Floor Selection:</strong> Floor ${escapeHtml(upgradeFloorSelection)}</p>` : ''}
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
  if (backsplashGroutEnabled) {
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
                    <td style="color: #78350f; font-size: 14px; font-weight: 600; padding: 8px 0;">${escapeHtml(backsplashGroutColor) || 'To be confirmed'}</td>
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
  if (heatedFloorBathrooms > 0) {
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
                    <td style="color: #7f1d1d; font-size: 20px; font-weight: 700; text-align: right;">${heatedFloorBathrooms} bathroom${heatedFloorBathrooms > 1 ? 's' : ''}</td>
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
  const interests = Object.entries(upgradeInterests)
    .filter(([_, v]) => v)
    .map(([key]) => key.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()));
  
  if (interests.length > 0) {
    upgradeInterestsHtml = `
      <tr>
        <td style="background: #ffffff; padding: 0 40px 30px;">
          <h2 style="margin: 0 0 16px; color: #1a1a2e; font-size: 18px; font-weight: 600;">💡 Additional Interests</h2>
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 16px 20px;">
            <p style="margin: 0; color: #166534; font-size: 14px;">You've expressed interest in learning more about:</p>
            <div style="margin-top: 12px;">
              ${interests.map(interest => `<span style="display: inline-block; background: #dcfce7; color: #166534; padding: 6px 12px; border-radius: 6px; font-size: 13px; margin: 4px;">${escapeHtml(interest)}</span>`).join(' ')}
            </div>
            <p style="margin: 16px 0 0; color: #15803d; font-size: 13px;">Our team will reach out with more information about these options.</p>
          </div>
        </td>
      </tr>
    `;
  }

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Updated Selection Confirmation - BMD Materials</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; border-collapse: collapse;">
          
          <!-- Header with Logo -->
          <tr>
            <td style="background: linear-gradient(135deg, #1a1a2e 0%, #2d463c 100%); padding: 30px 40px; border-radius: 16px 16px 0 0;">
              <table role="presentation" style="width: 100%;">
                <tr>
                  <td>
                    <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">BMD Materials</h1>
                    <p style="margin: 8px 0 0; color: #b4ac8c; font-size: 14px;">Premium Home Finishing Selections</p>
                  </td>
                  <td style="text-align: right;">
                    <span style="background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); color: white; padding: 8px 16px; border-radius: 20px; font-size: 12px; font-weight: 600;">
                      ✨ UPDATED
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Welcome Message -->
          <tr>
            <td style="background: #ffffff; padding: 40px;">
              <h2 style="margin: 0 0 16px; color: #1a1a2e; font-size: 22px; font-weight: 600;">
                Updated Selection Confirmation
              </h2>
              <p style="margin: 0 0 20px; color: #666; font-size: 15px; line-height: 1.6;">
                Hello <strong>${escapeHtml(firstName)}</strong>, your selections for <strong>Unit ${escapeHtml(unitNumber)}</strong>${unitType ? ` (${escapeHtml(unitType)})` : ''} have been updated. Please review the details below.
              </p>
              
              <!-- Confirmation Box -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border-radius: 12px; margin-bottom: 20px;">
                <tr>
                  <td style="padding: 20px;">
                    <table role="presentation" style="width: 100%; border-collapse: collapse;">
                      <tr>
                        <td style="width: 50px; vertical-align: top;">
                          <span style="display: inline-block; width: 40px; height: 40px; background: #22c55e; border-radius: 50%; text-align: center; line-height: 40px; color: white; font-size: 20px;">✓</span>
                        </td>
                        <td>
                          <p style="margin: 0; color: #166534; font-size: 16px; font-weight: 600;">Your selections have been updated</p>
                          <p style="margin: 6px 0 0; color: #15803d; font-size: 14px;">Updated on ${submissionDate}</p>
                          <p style="margin: 4px 0 0; color: #22c55e; font-size: 12px;">Reference: ${escapeHtml(selectionId?.slice(0, 8) || 'N/A')}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${standardSelectionsHtml}
          ${windowCoveringsHtml}
          ${areaUpgradesHtml}
          ${groutHtml}
          ${heatedFloorsHtml}
          ${upgradeInterestsHtml}

          <!-- Footer -->
          <tr>
            <td style="background: linear-gradient(135deg, #1a1a2e 0%, #2d463c 100%); padding: 30px 40px; border-radius: 0 0 16px 16px;">
              <table role="presentation" style="width: 100%;">
                <tr>
                  <td>
                    <h3 style="margin: 0 0 8px; color: #ffffff; font-size: 16px; font-weight: 600;">Questions about your selections?</h3>
                    <p style="margin: 0 0 16px; color: #b4ac8c; font-size: 14px; line-height: 1.5;">
                      Our team is here to help! Contact us and we'll be happy to assist.
                    </p>
                    <table role="presentation" style="border-collapse: collapse;">
                      <tr>
                        <td style="padding-right: 16px;">
                          <a href="mailto:office@bmdmaterials.com" style="color: #b4ac8c; font-size: 13px; text-decoration: none;">📧 office@bmdmaterials.com</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top: 20px; border-top: 1px solid rgba(180, 172, 140, 0.2); margin-top: 20px;">
                    <p style="margin: 0; color: #666; font-size: 11px;">
                      © ${new Date().getFullYear()} BMD Materials. All rights reserved.<br>
                      This email was sent following an update to your selection by our team.
                    </p>
                  </td>
                </tr>
              </table>
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

// Generate admin notification email
function generateAdminNotificationEmail(submission: Record<string, unknown>, editedBy: string): string {
  const firstName = submission.first_name as string;
  const lastName = submission.last_name as string;
  const unitNumber = submission.unit_number as string;
  const email = submission.email as string;
  
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: sans-serif; padding: 20px; background: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 12px;">
    <h2 style="color: #2d463c;">Confirmation Email Resent</h2>
    <p>A confirmation email has been resent for the following submission:</p>
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Unit</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">${escapeHtml(unitNumber)}</td>
      </tr>
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Buyer</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(firstName)} ${escapeHtml(lastName)}</td>
      </tr>
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Email</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(email)}</td>
      </tr>
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Sent By</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(editedBy)}</td>
      </tr>
      <tr>
        <td style="padding: 8px; color: #666;">Date</td>
        <td style="padding: 8px;">${new Date().toLocaleString()}</td>
      </tr>
    </table>
    <p style="color: #666; font-size: 12px;">This is an automated notification from the BMD Materials Selection Portal.</p>
  </div>
</body>
</html>
  `;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const dynamicCors = getCorsHeaders(req);
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: dynamicCors });
  }

  try {
    const { submissionId, sendToBuyer = true, editedBy = 'Admin' } = await req.json();
    
    if (!submissionId) {
      return new Response(
        JSON.stringify({ error: "Submission ID is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...dynamicCors } }
      );
    }

    console.log(`Resending confirmation email for submission: ${submissionId}`);

    // Fetch the submission from the database
    const { data: submission, error: fetchError } = await supabaseSelect("buyer_selections", submissionId);
    
    if (fetchError || !submission) {
      console.error("Failed to fetch submission:", fetchError);
      return new Response(
        JSON.stringify({ error: "Submission not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...dynamicCors } }
      );
    }

    const buyerEmail = submission.email as string;
    const unitNumber = submission.unit_number as string;
    const firstName = submission.first_name as string;
    
    const results: { buyer?: boolean; admin?: boolean; errors: string[] } = { errors: [] };

    // Send confirmation email to buyer
    if (sendToBuyer) {
      try {
        const buyerHtml = generateBuyerConfirmationEmail(submission);
        await sendEmail({
          from: "BMD Materials <noreply@resend.dev>",
          to: [buyerEmail],
          subject: `Updated Selection Confirmation - Unit ${unitNumber} | BMD Materials`,
          html: buyerHtml,
        });
        console.log(`Buyer confirmation email sent to: ${buyerEmail}`);
        results.buyer = true;
      } catch (error) {
        console.error("Failed to send buyer email:", error);
        results.errors.push(`Buyer email failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        results.buyer = false;
      }
    }

    // Send notification to admin team
    try {
      const adminHtml = generateAdminNotificationEmail(submission, editedBy);
      await sendEmail({
        from: "BMD Materials <noreply@resend.dev>",
        to: ["dan@bmdmaterials.com", "noni@bmdmaterials.com", "office@bmdmaterials.com"],
        subject: `[Resent] Confirmation Email - Unit ${unitNumber} - ${firstName}`,
        html: adminHtml,
      });
      console.log("Admin notification sent");
      results.admin = true;
    } catch (error) {
      console.error("Failed to send admin notification:", error);
      results.errors.push(`Admin notification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      results.admin = false;
    }

    return new Response(
      JSON.stringify({ 
        success: results.buyer !== false || results.admin !== false,
        message: results.buyer ? `Confirmation email sent to ${buyerEmail}` : 'Email sending completed with errors',
        results,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...dynamicCors } }
    );

  } catch (error) {
    console.error("Error in resend-confirmation-email:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...dynamicCors } }
    );
  }
});
