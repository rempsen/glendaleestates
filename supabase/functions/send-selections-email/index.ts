import { corsHeaders } from "../_shared/cors.ts";
import { loadServerPricing, restPricingFetcher } from "../_shared/loadServerPricing.ts";
import {
  authorizeAdmin,
  authorizeSubmission,
  parseRecipients,
  SEED_NOTIFICATION_RECIPIENTS,
} from "../_shared/authorizeSubmission.ts";
import { makeGetUserFromJwt } from "../_shared/internalAuth.ts";
import {
  buyerSelectionsInsertRow,
  parseSelectionBody,
  type SelectionData,
} from "../_shared/submissionRow.ts";
import { writeWizardLines } from "../_shared/wizardSubmissionLines.ts";
import {
  buildAdminEmailHtml,
  buildPreviewSampleData,
  type EmailLines,
  escapeHtml,
  generateBuyerConfirmationEmail,
  generateCSV,
  renderPreviewAdminHtml,
  renderPreviewBuyerHtml,
} from "./emails.ts";

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

// Batch insert with the service role (bypasses RLS); one request, no rows returned.
async function supabaseInsertRows(table: string, rows: Record<string, unknown>[]): Promise<{ error: string | null }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      "apikey": supabaseServiceKey,
      "Authorization": `Bearer ${supabaseServiceKey}`,
      "Content-Type": "application/json",
      "Prefer": "return=minimal",
    },
    body: JSON.stringify(rows),
  });
  return response.ok ? { error: null } : { error: `${response.status} ${await response.text()}` };
}

// Resolve a user JWT to { email, isAdmin } (anon key resolves to null).
const getUserFromJwt = makeGetUserFromJwt(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// Internal notification recipients live in portal_settings (admin-editable). Read at request
// time with the service role; fall back to the seed list only if the row is missing/malformed.
async function loadInternalRecipients(): Promise<string[]> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/portal_settings?select=value&key=eq.internal_notification_recipients&limit=1`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    );
    if (res.ok) {
      const rows = await res.json();
      const parsed = Array.isArray(rows) && rows.length > 0 ? parseRecipients(rows[0]?.value) : null;
      if (parsed) return parsed;
      console.warn("portal_settings.internal_notification_recipients missing or malformed; using seed recipients");
    } else {
      console.warn(`portal_settings lookup failed (${res.status}); using seed recipients`);
    }
  } catch (err) {
    console.warn("portal_settings lookup error; using seed recipients:", err);
  }
  return [...SEED_NOTIFICATION_RECIPIENTS];
}

function jsonResponse(status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

// Fetch dynamic pricing from database (shared loader; markup/GST divided by 100)
async function fetchDynamicPricing(): ReturnType<typeof loadServerPricing> {
  return await loadServerPricing(restPricingFetcher(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!));
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
    const adminAuth = await authorizeAdmin(req.headers.get('Authorization'), getUserFromJwt);
    if (!adminAuth.ok) {
      return jsonResponse(adminAuth.status, { error: adminAuth.status === 401 ? 'unauthorized' : 'forbidden' });
    }
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

  // Set once the buyer_selections insert succeeds; lets the outer catch tell a
  // post-save failure (row exists, do not resubmit) from a pre-save one.
  let insertedSubmissionId: string | undefined;

  try {
    const rawData = await req.json().catch(() => null);
    if (!rawData || typeof rawData !== 'object') {
      // Auth first so an unauthenticated caller learns nothing about body validation.
      const early = await authorizeSubmission(req.headers.get('Authorization'), '', getUserFromJwt);
      if (!early.ok && early.status === 401) return jsonResponse(401, { error: 'unauthorized' });
      return jsonResponse(400, { error: 'Invalid submission data. Please check your inputs and try again.' });
    }

    // Buyer JWT required; the body email must match the JWT email unless the caller is an admin.
    const auth = await authorizeSubmission(
      req.headers.get('Authorization'),
      typeof rawData.email === 'string' ? rawData.email : '',
      getUserFromJwt,
    );
    if (!auth.ok) {
      return jsonResponse(auth.status, { error: auth.status === 401 ? 'unauthorized' : 'forbidden' });
    }

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
    
    // Body → validated `data` → insert row: the shared mapping the wizard also uses (_shared/submissionRow.ts).
    const data: SelectionData = parseSelectionBody(rawData);

    const { data: savedSelection, error: dbError } = await supabaseInsert("buyer_selections", buyerSelectionsInsertRow(data));

    if (dbError || !savedSelection?.id) {
      // Nothing is emailed unless the selection is safely stored.
      console.error("Database error (no emails sent):", dbError);
      return jsonResponse(500, { error: 'save_failed' });
    }

    insertedSubmissionId = String(savedSelection.id);
    console.log("Saved selection to database:", savedSelection.id);
    
    // Fetch dynamic pricing for accurate cost calculations
    const pricing = await fetchDynamicPricing();

    // === QUOTE LINES (Phase 2 Task 9) ===
    // Regenerated here from the SAVED row with the shared generator; client lines/amounts are never trusted. The
    // client `windows` list is validated (<= 50 rows, allowed kinds, location <= 80 chars) and names window lines
    // only. Written in one batch with source='wizard'. On any failure, or when pricing is unavailable, the
    // submission is already saved: log it (as for post_save_failed) and carry on to the emails.
    // writeWizardLines never throws; with pricing unavailable it skips the insert ("lines skipped: pricing
    // unavailable"), and the backfill can write the lines later.
    const linesResult = await writeWizardLines({
      savedRow: savedSelection,
      rawWindows: rawData.windows,
      rawSubtotal: rawData.subtotal,
      pricing,
      insertRows: (rows) => supabaseInsertRows("quote_lines", rows),
    });

    // === SINGLE SOURCE OF TRUTH (Phase 2 Task 11) ===
    // Both emails and the CSV print the lines just inserted (or generated, when pricing was unavailable — then no
    // money is printed and the buyer is told the itemised quote will follow). Totals: sumQuoteLines only.
    const emailLines: EmailLines = {
      lines: linesResult.lines,
      gstRate: pricing.gstRate,
      pricesAvailable: linesResult.pricesAvailable,
      linesSource: linesResult.status === 'written' ? 'db' : 'generated',
    };

    // Sync to HubSpot in background — after the lines step, so sync-hubspot reads the stored lines.
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
        automated_windows_qty: data.automatedWindowsQty || 0,
        premium_carpet_bedroom: data.premiumCarpetBedroom || false,
        premium_underpad_bedroom: data.premiumUnderpadBedroom || false,
        window_comments: data.windowComments,
        hardwood_upgrade_selected: data.hardwoodUpgradeSelected,
        bathroom_tile_selected: data.bathroomTileSelected,
        bathroom_tile_ensuite_selected: data.bathroomTileEnsuiteSelected ?? data.bathroomTileSelected,
        bathroom_tile_guest_selected: data.bathroomTileGuestSelected ?? data.bathroomTileSelected,
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
  

    const htmlContent = buildAdminEmailHtml(data, savedSelection?.id as string | undefined, emailLines);
    const csvContent = generateCSV(data, savedSelection?.id as string | undefined, emailLines);
    const csvFilename = `selection_${data.unitNumber.replace(/[^a-zA-Z0-9]/g, '_')}_${data.lastName}_${new Date().toISOString().split('T')[0]}.csv`;

    // Send to BMD team (internal email with CSV) — isolated so DB save survives email failures
    let adminEmailResponse: { id?: string; error?: string } = {};
    const internalRecipients = await loadInternalRecipients();
    try {
      adminEmailResponse = await sendEmailWithAttachment({
        from: "BMD Materials Portal <selections@bmdmaterials.com>",
        to: internalRecipients,
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

    // Buyer confirmation: client-visible lines and client notes only (never internal notes or sales comments).
    const buyerConfirmationHtml = generateBuyerConfirmationEmail(data, savedSelection?.id as string | undefined, emailLines);

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
    // After the insert the record exists: tell the client so it does not invite a duplicate resubmit.
    const body = insertedSubmissionId
      ? { error: 'post_save_failed', submission_id: insertedSubmissionId }
      : { error: 'internal_error' };
    return new Response(
      JSON.stringify(body),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
