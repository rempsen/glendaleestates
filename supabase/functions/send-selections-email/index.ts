import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

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

// Zod validation schema for input validation
const SelectionSchema = z.object({
  unitNumber: z.string().min(1, "Unit number is required").max(50).trim(),
  unitType: z.string().max(100).trim().optional().nullable(),
  firstName: z.string().min(1, "First name is required").max(100).trim(),
  lastName: z.string().min(1, "Last name is required").max(100).trim(),
  phoneNumber: z.string().max(30).trim().optional().nullable(),
  email: z.string().email("Invalid email address").max(255).trim(),
  estimatedPossessionDate: z.string().max(50).optional().nullable(),
  hasStairs: z.boolean(),
  lvpColour: z.string().max(100).trim().optional().nullable(),
  lvpComments: z.string().max(2000).trim().optional().nullable(),
  spcTileColour: z.string().max(100).trim().optional().nullable(),
  spcTileComments: z.string().max(2000).trim().optional().nullable(),
  backsplashOrientation: z.string().max(100).trim().optional().nullable(),
  stairCarpetColour: z.string().max(100).trim().optional().nullable(),
  bedroomFlooringChoice: z.string().max(100).trim().optional().nullable(),
  bedroomCarpetColour: z.string().max(100).trim().optional().nullable(),
  bedroomLvpColour: z.string().max(100).trim().optional().nullable(),
  bedroomLvpSameAsMain: z.boolean(),
  additionalWindowsQty: z.number().int().min(0).max(100),
  patioDoorsQty: z.number().int().min(0).max(50),
  windowComments: z.string().max(2000).trim().optional().nullable(),
  salesComments: z.string().max(5000).trim().optional().nullable(),
  upgradeInterests: z.record(z.boolean()).default({}),
  windowTotal: z.number().min(0).max(1000000),
});

type ValidatedSelection = z.infer<typeof SelectionSchema>;

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawData = await req.json();
    
    // Validate input data using Zod
    const parseResult = SelectionSchema.safeParse(rawData);
    
    if (!parseResult.success) {
      console.error("Validation error:", parseResult.error.errors);
      return new Response(
        JSON.stringify({ 
          error: "Invalid submission data. Please check your inputs and try again.",
          details: parseResult.error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        }),
        { 
          status: 400, 
          headers: { "Content-Type": "application/json", ...corsHeaders } 
        }
      );
    }
    
    const data: ValidatedSelection = parseResult.data;
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: savedSelection, error: dbError } = await supabase
      .from("buyer_selections")
      .insert({
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
        status: "submitted",
      })
      .select()
      .single();

    if (dbError) {
      console.error("Database error:", dbError);
    } else {
      console.log("Saved selection to database:", savedSelection?.id);
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
          
          ${savedSelection ? `<div class="db-id"><strong>Database ID:</strong> ${escapeHtml(savedSelection.id)}</div>` : ''}
          
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

    const emailResponse = await resend.emails.send({
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
};

serve(handler);
