// Resend confirmation email — uses the SHARED upgradeTotalsServer +
// EMAIL_THEME so the buyer's email pricing matches the on-screen summary,
// the buyer PDF, the admin email, and the CSV attachment exactly.
import { getCorsHeaders } from "../_shared/cors.ts";
import {
  computeUpgradeTotalsServer,
  normalizeUnitTypeCode,
  ServerAreaUpgrade,
  ServerPricing,
} from "../_shared/upgradeTotalsServer.ts";
import { EMAIL_THEME, styles, wrapEmailShell } from "../_shared/emailTheme.ts";

function escapeHtml(text: string | undefined | null): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function sendEmail(opts: { from: string; to: string[]; subject: string; html: string }) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) throw new Error("RESEND_API_KEY not configured");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || "Failed to send email");
  return j;
}

async function supabaseSelect(table: string, id: string) {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const r = await fetch(`${url}/rest/v1/${table}?id=eq.${id}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  });
  if (!r.ok) return { data: null, error: await r.text() };
  const j = await r.json();
  return { data: Array.isArray(j) && j.length ? j[0] : null, error: null };
}

const AREA_NAMES: Record<string, string> = {
  mainLiving: 'Main Living Area', secondBedroom: 'Second Bedroom',
  masterBedroom: 'Master Bedroom', secondBedroomCarpet: 'Second Bedroom Carpet',
  guestBathroom: 'Guest Bathroom', masterEnsuite: 'Master Ensuite',
  laundry: 'Laundry Room', backsplash: 'Kitchen Backsplash', allLvp: 'Entire Unit LVP',
};
const MATERIAL_NAMES: Record<string, string> = {
  lvp: 'Premium LVP', hardwood: 'Hardwood', lvt: 'Premium LVT',
  carpet: 'Premium Carpet', tile: 'Porcelain Tile',
  nonstandard_lvp: 'Non Standard LVP Color', nonstandard_lvt: 'Non Standard LVT Color',
  nonstandard_tile: 'Non Standard Tile Color',
};

async function fetchDynamicPricing(): Promise<ServerPricing> {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const [mRes, cRes, uRes] = await Promise.all([
    fetch(`${url}/rest/v1/upgrade_materials?is_active=eq.true`, { headers }),
    fetch(`${url}/rest/v1/pricing_config`, { headers }),
    fetch(`${url}/rest/v1/unit_area_data`, { headers }),
  ]);
  const materials: Record<string, number> = {};
  const config: Record<string, number> = {};
  const unitAreas: Record<string, any> = {};
  let markupPercentage = 0.6, gstRate = 0.05;
  if (mRes.ok) for (const m of await mRes.json()) materials[m.material_key] = Number(m.cost_per_unit);
  if (cRes.ok) for (const c of await cRes.json()) {
    config[c.config_key] = Number(c.config_value);
    if (c.config_key === 'markup_percentage') markupPercentage = Number(c.config_value) / 100;
    if (c.config_key === 'gst_rate') gstRate = Number(c.config_value) / 100;
  }
  if (uRes.ok) for (const u of await uRes.json()) unitAreas[u.unit_type_code] = {
    allLvp: Number(u.all_lvp), mainLiving: Number(u.main_living),
    secondBedroom: Number(u.second_bedroom),
    masterBedroomLvp: Number(u.master_bedroom_lvp || 0),
    masterBedroom: Number(u.master_bedroom),
    secondBedroomCarpet: Number(u.second_bedroom_carpet),
    guestBathroom: Number(u.guest_bathroom), masterEnsuite: Number(u.master_ensuite),
    laundry: Number(u.laundry), backsplash: Number(u.backsplash),
  };
  return { materials, config, unitAreas, markupPercentage, gstRate };
}

function buildBuyerHtml(sub: Record<string, any>, totals: ReturnType<typeof computeUpgradeTotalsServer>): string {
  const firstName = sub.first_name as string;
  const unitNumber = sub.unit_number as string;
  const unitType = sub.unit_type as string | null;
  const submissionDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  // Standard selections
  const std: { label: string; value: string }[] = [];
  if (sub.lvp_colour) std.push({ label: 'Main Floor LVP', value: sub.lvp_colour });
  if (sub.spc_tile_colour) std.push({ label: 'Bathroom/Laundry Tile', value: sub.spc_tile_colour });
  if (sub.backsplash_orientation) std.push({ label: 'Kitchen Backsplash Orientation', value: sub.backsplash_orientation });
  if (sub.bedroom_flooring_choice) {
    let v = sub.bedroom_flooring_choice === 'lvp' ? 'Luxury Vinyl Plank' :
            sub.bedroom_flooring_choice === 'carpet' ? 'Carpet' : sub.bedroom_flooring_choice;
    if (sub.bedroom_flooring_choice === 'carpet' && sub.bedroom_carpet_colour) v += ` - ${sub.bedroom_carpet_colour}`;
    else if (sub.bedroom_flooring_choice === 'lvp' && !sub.bedroom_lvp_same_as_main && sub.bedroom_lvp_colour) v += ` - ${sub.bedroom_lvp_colour}`;
    else if (sub.bedroom_flooring_choice === 'lvp' && sub.bedroom_lvp_same_as_main) v += ' (Same as Main Floor)';
    std.push({ label: 'Bedroom Flooring', value: v });
  }
  if (sub.has_stairs && sub.stair_carpet_colour) std.push({ label: 'Stair Carpet', value: sub.stair_carpet_colour });

  const stdHtml = std.length ? `
    <h2 style="${styles.h2}">Your Standard Selections</h2>
    <table style="${styles.table}">
      ${std.map(i => `<tr><td style="${styles.tdLabel}">${escapeHtml(i.label)}</td><td style="${styles.tdValue}">${escapeHtml(i.value)}</td></tr>`).join('')}
    </table>` : '';

  // Complete Upgrade Summary from shared totals
  let summaryHtml = '';
  if (totals.grandSubtotal > 0) {
    const rows = totals.lineItems.map(item => {
      const detail = item.detail ? `<div style="color:${EMAIL_THEME.colors.textMuted}; font-size:12px; margin-top:2px;">${escapeHtml(item.detail)}</div>` : '';
      return `<tr><td style="${styles.td}">${escapeHtml(item.label)}${detail}</td><td style="${styles.tdRight}">$${item.amount.toFixed(2)}</td></tr>`;
    }).join('');
    summaryHtml = `
      <h2 style="${styles.h2}">Complete Upgrade Summary</h2>
      <table style="${styles.table}">
        ${rows}
        <tr><td style="${styles.subtotalLabel}">Subtotal (pre-GST)</td><td style="${styles.subtotalValue}">$${totals.grandSubtotal.toFixed(2)}</td></tr>
        <tr><td style="${styles.td}">GST (${(totals.gstRate * 100).toFixed(0)}%)</td><td style="${styles.tdRight}">$${totals.gst.toFixed(2)}</td></tr>
        <tr><td style="${styles.grandTotalLabel}">Grand Total (incl. GST)</td><td style="${styles.grandTotalValue}">$${totals.grandTotal.toFixed(2)}</td></tr>
      </table>`;
  }

  // Selection details for area upgrades (no internal pricing math, just selections)
  const areaUpgrades = (sub.area_upgrades as any[]) || [];
  let areaHtml = '';
  if (areaUpgrades.length) {
    const rows = areaUpgrades.map(u => `
      <tr>
        <td style="${styles.td}">${escapeHtml(AREA_NAMES[u.areaId] || u.areaId)}</td>
        <td style="${styles.td}">${escapeHtml(MATERIAL_NAMES[u.materialType] || u.materialType)}</td>
        <td style="${styles.td}">${escapeHtml(u.productName) || 'Standard'}${u.productColor ? `<div style="color:${EMAIL_THEME.colors.textMuted}; font-size:12px;">Color: ${escapeHtml(u.productColor)}</div>` : ''}</td>
        <td style="${styles.td}">${u.heatedFloor ? 'Heated' : '—'}</td>
      </tr>`).join('');
    areaHtml = `
      <h2 style="${styles.h2}">Premium Area Upgrades</h2>
      ${sub.upgrade_floor_selection ? `<p style="${styles.text}"><strong>Floor Selection:</strong> Floor ${escapeHtml(sub.upgrade_floor_selection)}</p>` : ''}
      <table style="${styles.table}">
        <tr><th style="${styles.th}">Area</th><th style="${styles.th}">Material</th><th style="${styles.th}">Product</th><th style="${styles.th}">Heated</th></tr>
        ${rows}
      </table>`;
  }

  const interests = Object.entries((sub.upgrade_interests as Record<string, boolean>) || {})
    .filter(([_, v]) => v)
    .map(([k]) => k.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()));
  const interestsHtml = interests.length ? `
    <h2 style="${styles.h2}">Additional Interests</h2>
    <p style="${styles.text}">${interests.map(i => escapeHtml(i)).join(', ')}</p>
    <p style="${styles.textMuted}">Our team will reach out to discuss these options with you.</p>` : '';

  const body = `
    <p style="${styles.text}">Hello <strong>${escapeHtml(firstName)}</strong>, your selections for <strong>Unit ${escapeHtml(unitNumber)}</strong>${unitType ? ` (${escapeHtml(unitType)})` : ''} have been updated. Please review the corrected details and pricing below.</p>
    <p style="${styles.textMuted}">Updated on ${submissionDate}${sub.id ? ` · Reference: ${escapeHtml(String(sub.id).slice(0, 8))}` : ''}</p>
    ${stdHtml}
    ${areaHtml}
    ${summaryHtml}
    ${interestsHtml}
    <p style="${styles.textMuted}">Questions? Contact us at <a href="mailto:office@bmdmaterials.com" style="color:${EMAIL_THEME.colors.accent};">office@bmdmaterials.com</a>.</p>
  `;

  return wrapEmailShell({
    title: `Updated Selection Confirmation - Unit ${unitNumber}`,
    preheader: `Updated selections and pricing for Unit ${unitNumber}`,
    headingText: 'Updated Selection Confirmation',
    subheadingText: `Unit ${unitNumber}${unitType ? ` · ${unitType}` : ''}`,
    bodyHtml: body,
  });
}

function buildAdminHtml(sub: Record<string, any>, totals: ReturnType<typeof computeUpgradeTotalsServer>, editedBy: string): string {
  const rows = totals.lineItems.map(item => {
    const detail = item.detail ? `<div style="color:${EMAIL_THEME.colors.textMuted}; font-size:12px;">${escapeHtml(item.detail)}</div>` : '';
    return `<tr><td style="${styles.td}">${escapeHtml(item.label)}${detail}</td><td style="${styles.tdRight}">$${item.amount.toFixed(2)}</td></tr>`;
  }).join('');
  const summary = totals.grandSubtotal > 0 ? `
    <h2 style="${styles.h2}">Complete Upgrade Summary</h2>
    <table style="${styles.table}">
      ${rows}
      <tr><td style="${styles.subtotalLabel}">Subtotal (pre-GST)</td><td style="${styles.subtotalValue}">$${totals.grandSubtotal.toFixed(2)}</td></tr>
      <tr><td style="${styles.td}">GST (${(totals.gstRate * 100).toFixed(0)}%)</td><td style="${styles.tdRight}">$${totals.gst.toFixed(2)}</td></tr>
      <tr><td style="${styles.grandTotalLabel}">Grand Total (incl. GST)</td><td style="${styles.grandTotalValue}">$${totals.grandTotal.toFixed(2)}</td></tr>
    </table>` : '';

  const body = `
    <p style="${styles.text}">A confirmation email has been resent to the buyer with the corrected pricing summary below.</p>
    <table style="${styles.table}">
      <tr><td style="${styles.tdLabel}">Unit</td><td style="${styles.tdValue}">${escapeHtml(sub.unit_number)}</td></tr>
      <tr><td style="${styles.tdLabel}">Buyer</td><td style="${styles.tdValue}">${escapeHtml(sub.first_name)} ${escapeHtml(sub.last_name)}</td></tr>
      <tr><td style="${styles.tdLabel}">Email</td><td style="${styles.tdValue}">${escapeHtml(sub.email)}</td></tr>
      <tr><td style="${styles.tdLabel}">Sent By</td><td style="${styles.tdValue}">${escapeHtml(editedBy)}</td></tr>
      <tr><td style="${styles.tdLabel}">Date</td><td style="${styles.tdValue}">${new Date().toLocaleString()}</td></tr>
    </table>
    ${summary}
  `;
  return wrapEmailShell({
    title: `Resent Confirmation - Unit ${sub.unit_number}`,
    headingText: 'Confirmation Email Resent',
    subheadingText: `Unit ${sub.unit_number} · ${sub.first_name} ${sub.last_name}`,
    bodyHtml: body,
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const { submissionId, sendToBuyer = true, editedBy = 'Admin', preview = false, previewType = 'buyer' } = await req.json();
    if (!submissionId) {
      return new Response(JSON.stringify({ error: "Submission ID is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...cors } });
    }

    const { data: sub, error } = await supabaseSelect("buyer_selections", submissionId);
    if (error || !sub) {
      return new Response(JSON.stringify({ error: "Submission not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...cors } });
    }

    // === SHARED PRICING — same source of truth as send-selections-email ===
    const pricing = await fetchDynamicPricing();
    const totals = computeUpgradeTotalsServer({
      unitTypeCode: sub.unit_type ? normalizeUnitTypeCode(sub.unit_type) : null,
      upgradeFloorSelection: sub.upgrade_floor_selection,
      areaUpgrades: (sub.area_upgrades as ServerAreaUpgrade[]) || [],
      backsplashGroutEnabled: sub.backsplash_grout_enabled,
      backsplashGroutColor: sub.backsplash_grout_color,
      stairLvpUpgradeSelected: sub.stair_lvp_upgrade_selected,
      stairPremiumCarpetSelected: sub.premium_underpad_stairs,
      stairUpgradeType: sub.stair_upgrade_type,
      additionalWindowsQty: sub.additional_windows_qty,
      patioDoorsQty: sub.patio_doors_qty,
      automatedWindowsQty: sub.automated_windows_qty,
      bathroomTileSelected: sub.bathroom_tile_selected,
      bathroomTileEnsuiteSelected: sub.bathroom_tile_ensuite_selected,
      bathroomTileGuestSelected: sub.bathroom_tile_guest_selected,
      heatedFloorBathrooms: sub.heated_floor_bathrooms,
      customTiledShower: sub.custom_tiled_shower,
      customPricing: sub.custom_pricing,
    }, pricing);

    if (preview) {
      const html = previewType === 'admin'
        ? buildAdminHtml(sub, totals, editedBy)
        : buildBuyerHtml(sub, totals);
      return new Response(JSON.stringify({ html, grandTotal: totals.grandTotal }),
        { status: 200, headers: { "Content-Type": "application/json", ...cors } });
    }

    const results: { buyer?: boolean; admin?: boolean; errors: string[] } = { errors: [] };

    if (sendToBuyer) {
      try {
        await sendEmail({
          from: "BMD Materials <selections@bmdmaterials.com>",
          to: [sub.email as string],
          subject: `Updated Selection Confirmation - Unit ${sub.unit_number} | BMD Materials`,
          html: buildBuyerHtml(sub, totals),
        });
        results.buyer = true;
      } catch (e) {
        results.errors.push(`Buyer email failed: ${e instanceof Error ? e.message : String(e)}`);
        results.buyer = false;
      }
    }

    try {
      await sendEmail({
        from: "BMD Materials <selections@bmdmaterials.com>",
        to: ["dan@bmdmaterials.com", "noni@bmdmaterials.com", "brian@bmdmaterials.com", "office@bmdmaterials.com"],
        subject: `[Resent] Confirmation Email - Unit ${sub.unit_number} - ${sub.first_name}`,
        html: buildAdminHtml(sub, totals, editedBy),
      });
      results.admin = true;
    } catch (e) {
      results.errors.push(`Admin notification failed: ${e instanceof Error ? e.message : String(e)}`);
      results.admin = false;
    }

    return new Response(JSON.stringify({
      success: results.buyer !== false || results.admin !== false,
      message: results.buyer ? `Confirmation email sent to ${sub.email}` : 'Email sending completed with errors',
      results,
      grandTotal: totals.grandTotal,
    }), { status: 200, headers: { "Content-Type": "application/json", ...cors } });

  } catch (error) {
    console.error("resend-confirmation-email error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...cors } });
  }
});
