// send-selections-email's three renderers (Phase 2 Task 11, spec §6.11): the office email, its CSV attachment and
// the buyer confirmation. Pure (no Deno globals) so the edge-string tests can render them. Every price comes from
// the quote lines the function just inserted (or generated, when pricing was unavailable) through
// _shared/linesEmailHtml.ts: seven columns, Standard / Premium upgrades / Not included in total, totals from
// sumQuoteLines only, `Pending` never $0.00. The buyer copy never carries internal notes or sales comments.
import { type EmailLines, escapeHtml, linesCsvRows, renderLinesEmailHtml } from "../_shared/linesEmailHtml.ts";
import { buyerSelectionsInsertRow, type AreaUpgrade, type SelectionData } from "../_shared/submissionRow.ts";
import { savedSubmissionLinesCore } from "../_shared/savedSubmissionLines.ts";
import type { QuotePricing } from "../_shared/quoteLines.ts";
import { MY_QUOTE_LINK_TEXT, MY_QUOTE_URL } from "../_shared/buyerContact.ts";

export { escapeHtml, type EmailLines };

// Material type display names (laundry row only; priced lines carry their own labels).
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

// Buyer-facing wording. MIRRORS src/lib/outputLabels.ts (cannot import from src/); change in both places together.
// Base spec: Luxury Vinyl Plank throughout; Dante 2.0 tile in washrooms only (pending Dan's confirmation).
const LAUNDRY_STANDARD_LABEL = 'Ceratec Dante 2.0 LVT (standard)';
const LAUNDRY_PLANK_PRODUCT = 'XL Flooring LVP';
const PLANK_NAMES: Record<string, string> = { cortland: 'Cortland', opal: 'Opal', wolfriver: 'Wolf River' };
const plankBathChoiceName = (v: string | null | undefined): string | null =>
  PLANK_NAMES[String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '')] ?? null;
const LAUNDRY_ROW_LABEL = 'Laundry Room';
const BATHROOM_TILE_LABEL = 'Bathroom Tile';
const PRIMARY_BEDROOM_FLOORING_LABEL = 'Primary Bedroom Flooring';
const PRIMARY_BEDROOM_CARPET_COLOUR_LABEL = 'Primary Bedroom Carpet Colour';
const STAIR_CARPET_LABEL = 'Stair Flooring – Carpet'; // en dash
const STAIR_STANDARD_VALUE = 'Standard Carpet (Included)';

// Laundry value: the upgraded material when an area_upgrades row for laundry exists; else the standard plank when the
// shared bathroom/laundry choice is a plank; else the standard tile label.
function laundryValue(areaUpgrades: AreaUpgrade[] | undefined, spcTileColour?: string | null): string {
  const up = (areaUpgrades || []).find(u => u.areaId === 'laundry');
  const plank = plankBathChoiceName(spcTileColour);
  const standard = plank ? `${LAUNDRY_PLANK_PRODUCT} — ${plank} (standard)` : LAUNDRY_STANDARD_LABEL;
  if (!up) return standard;
  const text = [MATERIAL_NAMES[up.materialType] || up.materialType, up.productName, up.productColor]
    .filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' — ');
  return text || standard;
}

// Stair flooring row for the office email and CSV (selection text only; the price is on the stair line).
function stairFlooringRow(data: SelectionData): { label: string; value: string } {
  if (data.stairLvpUpgradeSelected || data.stairUpgradeType === 'lvp' || data.stairUpgradeType === 'premium_lvp') {
    return { label: 'Stair Flooring', value: `${data.stairUpgradeType === 'premium_lvp' ? 'Premium ' : ''}LVP Upgrade with Custom Nosings` };
  }
  if (data.stairPremiumCarpetSelected) {
    return { label: STAIR_CARPET_LABEL, value: `Premium Carpet Upgrade${data.stairCarpetColour ? ` (${data.stairCarpetColour})` : ''}` };
  }
  if (data.premiumUnderpadStairs) {
    return { label: STAIR_CARPET_LABEL, value: data.stairCarpetColour || STAIR_STANDARD_VALUE };
  }
  return { label: STAIR_CARPET_LABEL, value: data.stairCarpetColour ? `${STAIR_STANDARD_VALUE} — ${data.stairCarpetColour}` : STAIR_STANDARD_VALUE };
}

const csvCell = (cell: string) => {
  // Escape quotes and wrap in quotes if contains comma, quote, or newline
  const escaped = String(cell).replace(/"/g, '""');
  return escaped.includes(',') || escaped.includes('"') || escaped.includes('\n') ? `"${escaped}"` : escaped;
};

/** Office CSV: the selection fields (Field, Value), then one row per quote line and the totals. */
export function generateCSV(data: SelectionData, savedId: string | undefined, q: EmailLines): string {
  const rows: string[][] = [];
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
  rows.push([BATHROOM_TILE_LABEL, data.spcTileColour || 'Not selected']);
  rows.push([LAUNDRY_ROW_LABEL, laundryValue(data.areaUpgrades, data.spcTileColour)]);
  rows.push(['SPC Tile Comments', data.spcTileComments || '']);
  rows.push([STAIR_CARPET_LABEL, data.hasStairs ? stairFlooringRow(data).value : 'N/A']);
  rows.push([PRIMARY_BEDROOM_FLOORING_LABEL, data.bedroomFlooringChoice || 'Not selected']);
  rows.push([PRIMARY_BEDROOM_CARPET_COLOUR_LABEL, data.bedroomCarpetColour || 'N/A']);
  rows.push(['Primary Bedroom LVP Colour', data.bedroomLvpColour || 'N/A']);
  rows.push(['Primary Bedroom LVP Same as Main', data.bedroomLvpSameAsMain ? 'Yes' : 'No']);

  // Backsplash
  rows.push(['--- BACKSPLASH ---', '']);
  rows.push(['Backsplash Orientation', data.backsplashOrientation || 'Not selected']);
  rows.push(['Custom Grout Color Change', data.backsplashGroutEnabled ? 'Yes' : 'No']);
  rows.push(['Grout Color', data.backsplashGroutColor || 'N/A']);
  rows.push(['Grout Comments', data.backsplashGroutComments || '']);

  // Window Coverings
  rows.push(['--- WINDOW COVERINGS ---', '']);
  rows.push(['Additional Windows Qty', String(data.additionalWindowsQty)]);
  rows.push(['Patio Doors Qty', String(data.patioDoorsQty)]);
  rows.push(['Automated Windows Qty', String(data.automatedWindowsQty || 0)]);
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
      rows.push([`Upgrade ${index + 1} - Client Note`, upgrade.clientComment || '']);
      rows.push([`Upgrade ${index + 1} - Internal Note`, upgrade.comments || '']);
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
  const interests = Object.entries(data.upgradeInterests || {}).filter(([_, v]) => v).map(([k]) => k);
  rows.push(['Interested In', interests.length > 0 ? interests.join(', ') : 'None']);

  // Comments
  rows.push(['--- COMMENTS ---', '']);
  rows.push(['Sales Comments', data.salesComments || '']);
  rows.push(['Upgrade Pricing Summary Comments', data.upgradeComments || '']);
  rows.push(['Upgrade Interests Notes', data.upgradeInterestsNotes || '']);

  // Quote lines (same lines, rows and totals as both emails and the PDF)
  rows.push(['--- QUOTE LINES ---', '']);
  rows.push(...linesCsvRows(q.lines, { gstRate: q.gstRate, pricesAvailable: q.pricesAvailable }));

  return rows.map(row => row.map(csvCell).join(',')).join('\n');
}

/** Office email: buyer + selection details, the staff lines block (every line, internal notes last), comments. */
export function buildAdminEmailHtml(data: SelectionData, savedId: string | undefined, q: EmailLines): string {
  const linesBlock = renderLinesEmailHtml(q.lines, { buyerView: false, gstRate: q.gstRate, pricesAvailable: q.pricesAvailable, linesSource: q.linesSource });
  const upgradesList = Object.entries(data.upgradeInterests || {})
    .filter(([_, v]) => v)
    .map(([key]) => escapeHtml(key.replace('-', ' ')))
    .join(', ') || 'None';

  return `
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
          
          ${savedId ? `<div class="db-id"><strong>Database ID:</strong> ${escapeHtml(savedId)}</div>` : ''}
          
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
              <tr><td class="label">${BATHROOM_TILE_LABEL}:</td><td class="value">${escapeHtml(data.spcTileColour) || 'Not selected'}</td></tr>
              <tr><td class="label">${LAUNDRY_ROW_LABEL}:</td><td class="value">${escapeHtml(laundryValue(data.areaUpgrades, data.spcTileColour))}</td></tr>
              ${data.hasStairs ? `<tr><td class="label">${STAIR_CARPET_LABEL}:</td><td class="value">${escapeHtml(stairFlooringRow(data).value)}</td></tr>` : ''}
              <tr><td class="label">${PRIMARY_BEDROOM_FLOORING_LABEL}:</td><td class="value">${data.bedroomFlooringChoice === 'lvp' ? 'Luxury Vinyl Plank' : escapeHtml(data.bedroomFlooringChoice) || 'Not selected'}</td></tr>
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

          <div class="section">
            <h2>Quote Lines</h2>
            ${data.upgradeFloorSelection ? `<p class="value"><strong>Floor Selection (G/H units):</strong> Floor ${escapeHtml(data.upgradeFloorSelection)}</p>` : ''}
            ${linesBlock.html}
            ${data.windowComments ? `<div class="comments"><strong>Window Notes:</strong> ${escapeHtml(data.windowComments)}</div>` : ''}
            ${data.backsplashGroutComments ? `<div class="comments"><strong>Grout Comments:</strong> ${escapeHtml(data.backsplashGroutComments)}</div>` : ''}
          </div>

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
}

/** Buyer confirmation: unit card, the buyer lines block (client-visible lines and client notes only), next steps. */
export function generateBuyerConfirmationEmail(data: SelectionData, selectionId: string | undefined, q: EmailLines): string {
  const linesBlock = renderLinesEmailHtml(q.lines, { buyerView: true, gstRate: q.gstRate, pricesAvailable: q.pricesAvailable });
  const submissionDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

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
              
              <!-- Your quote: Standard selections / Premium upgrades / Not included in total / Totals (quote lines) -->
              <tr>
                <td style="background: #ffffff; padding: 0 40px 30px;">
                  ${linesBlock.html}
                  <p style="margin: 20px 0 0; text-align: center;"><a href="${MY_QUOTE_URL}" style="display: inline-block; background: #2d463c; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">${MY_QUOTE_LINK_TEXT}</a></p>
                  <p style="margin: 8px 0 0; text-align: center; color: #4b5563; font-size: 12px;">Sign in with this email address to accept each line, ask a question or request a change.</p>
                </td>
              </tr>
              
              <!-- Upgrade Interests -->
              ${upgradeInterestsHtml}
              
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

export function buildPreviewSampleData(overrides: Record<string, unknown>): SelectionData {
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
    areaUpgrades: [
      { areaId: 'secondBedroom', materialType: 'lvp', productName: 'Cortland', productColor: '', comments: '' },
      { areaId: 'guestBathroom', materialType: 'tile', productName: 'Frost White', productColor: '', comments: '', heatedFloor: false },
      { areaId: 'masterEnsuite', materialType: 'tile', productName: 'Frost White', productColor: '', comments: '', heatedFloor: false },
    ],
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

// Sample pricing that mirrors the DB-backed pricing the production flow loads (loadServerPricing shape).
// Preview/test endpoints only; the lines come from the same generator the submit path uses.
export const PREVIEW_PRICING: QuotePricing = {
  materials: {
    lvp: 4.5, lvt: 5.0, tile: 17.0, carpet: 3.5, hardwood: 9.0, tiled_shower: 5250.0,
    nonstandard_lvp: 5.0, nonstandard_lvt: 5.5, nonstandard_tile: 18.0, premium_carpet_underpad: 6.0,
  },
  config: {
    additional_window_price: 673.5, patio_door_price: 2347.8, automated_motor_price: 645.0,
    heated_floor_per_bathroom: 1850.0, stair_lvp_upgrade_price: 2160.0, stair_premium_lvp_upgrade_price: 3145.0,
    premium_carpet_stairs_price: 640.0, grout_color_change_price: 300.0,
  },
  unitAreas: {
    C: { mainLiving: 600, secondBedroom: 120, masterBedroom: 180, masterBedroomLvp: 180, guestBathroom: 55, masterEnsuite: 80, laundry: 25, backsplash: 35 },
  },
  markupPercentage: 0.6,
  gstRate: 0.05,
};

/** Lines for preview sample data: the generator over the row the submit path would insert. */
export function previewEmailLines(data: SelectionData): EmailLines {
  const { lines } = savedSubmissionLinesCore([], buyerSelectionsInsertRow(data), PREVIEW_PRICING);
  return { lines, gstRate: PREVIEW_PRICING.gstRate, pricesAvailable: true };
}

export function renderPreviewBuyerHtml(data: SelectionData): string {
  return generateBuyerConfirmationEmail(data, 'PREVIEW-0000', previewEmailLines(data));
}

export function renderPreviewAdminHtml(data: SelectionData): string {
  return buildAdminEmailHtml(data, 'PREVIEW-0000', previewEmailLines(data));
}
