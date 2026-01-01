import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SelectionEmailRequest {
  unitNumber: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email: string;
  estimatedPossessionDate: string;
  hasStairs: boolean;
  lvpColour: string;
  lvpComments: string;
  spcTileColour: string;
  spcTileComments: string;
  backsplashOrientation: string;
  stairCarpetColour: string;
  bedroomFlooringChoice: string;
  bedroomCarpetColour: string;
  bedroomLvpColour: string;
  additionalWindowsQty: number;
  patioDoorsQty: number;
  upgradeInterests: Record<string, boolean>;
  windowTotal: number;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const data: SelectionEmailRequest = await req.json();
    
    const upgradesList = Object.entries(data.upgradeInterests)
      .filter(([_, v]) => v)
      .map(([key]) => key.replace('-', ' '))
      .join(', ') || 'None';

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
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🏠 New Selection Submission</h1>
          
          <div class="section">
            <h2>Buyer Information</h2>
            <table>
              <tr><td class="label">Unit Number:</td><td class="value">${data.unitNumber || 'Not provided'}</td></tr>
              <tr><td class="label">Name:</td><td class="value">${data.firstName} ${data.lastName}</td></tr>
              <tr><td class="label">Phone:</td><td class="value">${data.phoneNumber || 'Not provided'}</td></tr>
              <tr><td class="label">Email:</td><td class="value">${data.email || 'Not provided'}</td></tr>
              <tr><td class="label">Est. Possession:</td><td class="value">${data.estimatedPossessionDate ? new Date(data.estimatedPossessionDate).toLocaleDateString() : 'Not provided'}</td></tr>
              <tr><td class="label">Has Stairs:</td><td class="value">${data.hasStairs ? 'Yes' : 'No'}</td></tr>
            </table>
          </div>

          <div class="section">
            <h2>Flooring Selections</h2>
            <table>
              <tr><td class="label">Main Floor LVP:</td><td class="value">${data.lvpColour || 'Not selected'}</td></tr>
              <tr><td class="label">Bathroom/Laundry SPC:</td><td class="value">${data.spcTileColour || 'Not selected'}</td></tr>
              ${data.hasStairs ? `<tr><td class="label">Stairs Carpet:</td><td class="value">${data.stairCarpetColour || 'Not selected'}</td></tr>` : ''}
              <tr><td class="label">Bedroom Flooring:</td><td class="value">${data.bedroomFlooringChoice === 'lvp' ? 'Luxury Vinyl Plank' : data.bedroomFlooringChoice || 'Not selected'}</td></tr>
              ${data.bedroomFlooringChoice === 'carpet' && data.bedroomCarpetColour ? `<tr><td class="label">Bedroom Carpet Colour:</td><td class="value">${data.bedroomCarpetColour}</td></tr>` : ''}
              ${data.bedroomFlooringChoice === 'lvp' && data.bedroomLvpColour ? `<tr><td class="label">Bedroom LVP Colour:</td><td class="value">${data.bedroomLvpColour}</td></tr>` : ''}
            </table>
            ${data.lvpComments ? `<div class="comments"><strong>LVP Comments:</strong> ${data.lvpComments}</div>` : ''}
          </div>

          <div class="section">
            <h2>Bathroom Tile</h2>
            <table>
              <tr><td class="label">Tile Selection:</td><td class="value">${data.spcTileColour || 'Not selected'}</td></tr>
            </table>
            ${data.spcTileComments ? `<div class="comments"><strong>Tile Comments:</strong> ${data.spcTileComments}</div>` : ''}
          </div>

          <div class="section">
            <h2>Kitchen Backsplash</h2>
            <table>
              <tr><td class="label">Orientation:</td><td class="value">${data.backsplashOrientation || 'Not selected'}</td></tr>
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
          </div>
          ` : ''}

          <div class="section">
            <h2>Upgrade Interests</h2>
            <p class="value">${upgradesList}</p>
          </div>

          <p style="margin-top: 30px; color: #666; font-size: 12px;">
            This email was automatically generated by the BMD Materials Selection Portal.
          </p>
        </div>
      </body>
      </html>
    `;

    const emailResponse = await resend.emails.send({
      from: "BMD Materials <onboarding@resend.dev>",
      to: ["dan@bmdmaterials.com", "office@bmdmaterials.com"],
      subject: `New Selection Submission - ${data.unitNumber || 'Unknown Unit'} - ${data.firstName} ${data.lastName}`,
      html: htmlContent,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify(emailResponse), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-selections-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
