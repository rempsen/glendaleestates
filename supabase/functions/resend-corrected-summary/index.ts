// Resend a corrected selection summary email with the regenerated PDF (containing comments
// that were captured in the database but missing from the originally-sent PDF).
import { corsHeaders } from "../_shared/cors.ts";
import { authorizeStaffOrAdmin, makeGetUserFromJwt } from "../_shared/internalAuth.ts";

interface ResendRequestBody {
  submissionId: string;
  email: string;
  firstName: string;
  lastName: string;
  unitNumber: string;
  pdfBase64: string;
  pdfFileName?: string;
  capturedCommentLabels?: string[];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as ResendRequestBody;

    if (!body?.submissionId || !body?.email || !body?.pdfBase64) {
      return new Response(
        JSON.stringify({ error: "Missing required fields (submissionId, email, pdfBase64)." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Caller must be BMD staff or an admin (Phase 2 Task 16): 401 no / invalid JWT, 403 signed-in non-staff.
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const gate = await authorizeStaffOrAdmin(req, { serviceRoleKey: serviceKey }, makeGetUserFromJwt(supabaseUrl, serviceKey));
    if (!gate.ok) {
      return new Response(
        JSON.stringify({ error: gate.status === 403 ? "Forbidden — staff or admin role required" : "Unauthorized" }),
        { status: gate.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send email via Resend
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const labels = body.capturedCommentLabels?.length
      ? `<ul style="margin: 12px 0 0 0; padding-left: 20px;">${body.capturedCommentLabels
          .map((l) => `<li>${escapeHtml(l)}</li>`)
          .join("")}</ul>`
      : "";

    const html = `<!DOCTYPE html>
<html><body style="font-family: Helvetica, Arial, sans-serif; color: #2b2b2b; max-width: 640px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #2d463c;">Updated Selection Summary — Unit ${escapeHtml(body.unitNumber)}</h2>
  <p>Hello ${escapeHtml(body.firstName)},</p>
  <p>
    We recently improved how comments and notes are recorded in your Glendale Estates
    selection summary PDF. The original PDF you received was missing some of the comments
    you typed during your selections. We have re-generated your summary so it now includes
    all of them.
  </p>
  ${labels ? `<p>The updated PDF includes the following previously-missing notes:</p>${labels}` : ""}
  <p>
    No action is required from you — this is purely a corrected copy for your records.
    If anything looks incorrect, please reply to this email and our team will follow up.
  </p>
  <p style="margin-top: 32px;">— BMD Materials</p>
</body></html>`;

    const fileName =
      body.pdfFileName ||
      `Unit-${body.unitNumber}-Selection-Summary-Updated.pdf`;

    const sendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "BMD Materials <selections@bmdmaterials.com>",
        to: [body.email],
        bcc: ["selections@bmdmaterials.com"],
        subject: `Updated Selection Summary — Unit ${body.unitNumber}`,
        html,
        attachments: [
          {
            filename: fileName,
            content: body.pdfBase64,
          },
        ],
      }),
    });

    if (!sendResp.ok) {
      const errText = await sendResp.text();
      console.error("Resend send failed:", errText);
      return new Response(
        JSON.stringify({ error: "Failed to send email", details: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sendData = await sendResp.json();
    console.log("Corrected summary email sent for submission", body.submissionId, sendData?.id);

    return new Response(
      JSON.stringify({ success: true, emailId: sendData?.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("resend-corrected-summary error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
