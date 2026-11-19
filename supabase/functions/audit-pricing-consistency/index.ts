// =====================================================================
// Pricing-consistency auditor (admin / internal only): stored quote_lines ↔ freshly generated lines, per
// submission. See ./handler.ts. GET ?submissionId=<uuid> or POST { submissionId? }; no other parameters.
// (The Phase 1 engine mode and the `mode` parameter were removed in Phase 2 Task 18.)
// =====================================================================
import { getCorsHeaders } from "../_shared/cors.ts";
import { authorizeInternalOrAdmin, makeGetUserFromJwt } from "../_shared/internalAuth.ts";
import { loadServerPricing, restPricingFetcher } from "../_shared/loadServerPricing.ts";
import { auditStoredVsGenerated, UUID_RX } from "./handler.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = getCorsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body, null, 2), { status, headers: { "Content-Type": "application/json", ...cors } });
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const gate = await authorizeInternalOrAdmin(
    req,
    { serviceRoleKey: SERVICE_KEY },
    makeGetUserFromJwt(SUPABASE_URL, SERVICE_KEY),
  );
  if (!gate.ok) return json({ error: "unauthorized" }, 401);

  try {
    let submissionId: string | null = new URL(req.url).searchParams.get("submissionId");
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body && typeof body.submissionId === "string") submissionId = body.submissionId;
      } catch { /* empty body: audit every submission */ }
    }
    if (submissionId != null && !UUID_RX.test(submissionId)) return json({ error: "submissionId must be a uuid" }, 400);

    const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
    const report = await auditStoredVsGenerated(submissionId, {
      async listSubmissions(id) {
        const filter = id ? `id=eq.${id}` : "order=unit_number.asc";
        const r = await fetch(`${SUPABASE_URL}/rest/v1/buyer_selections?${filter}`, { headers });
        if (!r.ok) throw new Error(`failed to fetch submissions: ${await r.text()}`);
        return await r.json();
      },
      async storedLines(id) {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/quote_lines?submission_id=eq.${id}&select=section,status,amount`, { headers });
        if (!r.ok) throw new Error(`failed to fetch quote_lines: ${await r.text()}`);
        return await r.json();
      },
      loadPricing: () => loadServerPricing(restPricingFetcher(SUPABASE_URL, SERVICE_KEY)),
    });
    return json(report);
  } catch (error) {
    console.error("audit-pricing-consistency error:", error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
