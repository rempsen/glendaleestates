// Resend confirmation email (Phase 2 Task 11): the buyer and admin copies print the submission's stored quote lines
// (generator fallback when none exist yet) — the same lines, rows and totals as the PDF, Word and the submit emails.
import { getCorsHeaders } from "../_shared/cors.ts";
import { authorizeStaffOrAdmin, makeGetUserFromJwt } from "../_shared/internalAuth.ts";
import { loadServerPricing, pricingUnavailableReason, restPricingFetcher } from "../_shared/loadServerPricing.ts";
import { loadSubmissionLinesRest } from "../_shared/savedSubmissionLines.ts";
import type { EmailLines } from "../_shared/linesEmailHtml.ts";
import { buildAdminHtml, buildBuyerHtml, linesGrandTotal } from "./emails.ts";

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

async function fetchDynamicPricing() {
  return await loadServerPricing(restPricingFetcher(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!));
}

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const gate = await authorizeStaffOrAdmin(
    req,
    { serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") },
    makeGetUserFromJwt(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!),
  );
  if (!gate.ok) {
    return new Response(JSON.stringify({ error: gate.status === 403 ? "staff or admin role required" : "unauthorized" }), {
      status: gate.status,
      headers: { "Content-Type": "application/json", ...cors },
    });
  }

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

    // === QUOTE LINES — the submission's stored lines; generator over the row when none exist yet ===
    const pricing = await fetchDynamicPricing();
    const { lines, linesSource } = await loadSubmissionLinesRest({
      supabaseUrl: Deno.env.get("SUPABASE_URL")!, serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      submissionId: String(sub.id), row: sub, pricing,
    });
    // Stored lines carry their own prices; generated ones need the live tables.
    const unavailable = linesSource === 'generated' ? pricingUnavailableReason(pricing) : null;
    if (unavailable) console.warn(`[resend] pricing unavailable (${unavailable}); emails print no prices for ${sub.id}`);
    const q: EmailLines = { lines, gstRate: pricing.gstRate, pricesAvailable: !unavailable, linesSource };
    const grandTotal = linesGrandTotal(q);

    if (preview) {
      const html = previewType === 'admin'
        ? buildAdminHtml(sub, q, editedBy)
        : buildBuyerHtml(sub, q);
      return new Response(JSON.stringify({ html, grandTotal }),
        { status: 200, headers: { "Content-Type": "application/json", ...cors } });
    }

    const results: { buyer?: boolean; admin?: boolean; errors: string[] } = { errors: [] };

    if (sendToBuyer) {
      try {
        await sendEmail({
          from: "BMD Materials <selections@bmdmaterials.com>",
          to: [sub.email as string],
          subject: `Updated Selection Confirmation - Unit ${sub.unit_number} | BMD Materials`,
          html: buildBuyerHtml(sub, q),
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
        html: buildAdminHtml(sub, q, editedBy),
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
      grandTotal,
    }), { status: 200, headers: { "Content-Type": "application/json", ...cors } });

  } catch (error) {
    console.error("resend-confirmation-email error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...cors } });
  }
});
