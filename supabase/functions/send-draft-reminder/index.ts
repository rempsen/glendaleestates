import { getCorsHeaders, corsHeaders } from "../_shared/cors.ts";
import { safeEqual } from "../_shared/internalAuth.ts";

// Internal-call guard (below) mirrors qbo-sync-submission: the scheduler sends `x-internal-secret`
// = SUPABASE_SERVICE_ROLE_KEY (allowed by the shared CORS headers). verify_jwt stays false because
// the scheduler is not known to send a user JWT.

// HTML escape function to prevent XSS
function escapeHtml(text: string | undefined | null): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

interface DraftReminder {
  email: string;
  firstName?: string;
  unitNumber: string;
  lastStep: number;
  totalSteps: number;
  lastUpdated: string;
  resumeUrl: string;
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

// Generate magic link token (simple base64 encoding for now)
function generateMagicToken(email: string, unitNumber: string): string {
  const payload = JSON.stringify({ 
    email, 
    unitNumber, 
    timestamp: Date.now(),
    action: 'resume-draft'
  });
  return btoa(payload);
}

// Generate the reminder email HTML
function generateReminderEmailHtml(data: DraftReminder): string {
  const progressPercent = Math.round((data.lastStep / data.totalSteps) * 100);
  const daysAgo = Math.floor((Date.now() - new Date(data.lastUpdated).getTime()) / (1000 * 60 * 60 * 24));
  const timeAgo = daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`;
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Continue Your Home Selections</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #1a1a2e;
          margin: 0;
          padding: 0;
          background-color: #f5f5f7;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          padding: 40px 20px;
        }
        .card {
          background: white;
          border-radius: 16px;
          padding: 40px;
          box-shadow: 0 4px 24px rgba(0,0,0,0.08);
        }
        .logo {
          text-align: center;
          margin-bottom: 30px;
        }
        .logo img {
          height: 50px;
        }
        h1 {
          color: #1a1a2e;
          font-size: 24px;
          font-weight: 600;
          margin: 0 0 10px 0;
          text-align: center;
        }
        .subtitle {
          color: #666;
          font-size: 16px;
          text-align: center;
          margin-bottom: 30px;
        }
        .progress-section {
          background: linear-gradient(135deg, #16213e 0%, #1a1a2e 100%);
          border-radius: 12px;
          padding: 24px;
          margin: 24px 0;
          color: white;
        }
        .progress-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }
        .progress-label {
          font-size: 14px;
          opacity: 0.9;
        }
        .progress-percent {
          font-size: 24px;
          font-weight: 700;
        }
        .progress-bar {
          background: rgba(255,255,255,0.2);
          border-radius: 8px;
          height: 8px;
          overflow: hidden;
        }
        .progress-fill {
          background: linear-gradient(90deg, #e94560 0%, #ff6b6b 100%);
          height: 100%;
          border-radius: 8px;
          width: ${progressPercent}%;
        }
        .progress-text {
          font-size: 13px;
          opacity: 0.8;
          margin-top: 8px;
        }
        .unit-badge {
          display: inline-block;
          background: #e94560;
          color: white;
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 500;
          margin-top: 12px;
        }
        .cta-button {
          display: block;
          background: linear-gradient(135deg, #e94560 0%, #d63850 100%);
          color: white;
          text-decoration: none;
          text-align: center;
          padding: 16px 32px;
          border-radius: 12px;
          font-size: 16px;
          font-weight: 600;
          margin: 30px 0;
          box-shadow: 0 4px 14px rgba(233, 69, 96, 0.4);
        }
        .cta-button:hover {
          background: linear-gradient(135deg, #d63850 0%, #c4304a 100%);
        }
        .info-box {
          background: #f8f9fa;
          border-radius: 8px;
          padding: 16px;
          margin: 20px 0;
        }
        .info-box p {
          margin: 0;
          font-size: 14px;
          color: #666;
        }
        .info-box strong {
          color: #1a1a2e;
        }
        .features {
          margin: 24px 0;
        }
        .feature {
          display: flex;
          align-items: flex-start;
          margin: 12px 0;
        }
        .feature-icon {
          width: 24px;
          height: 24px;
          background: #e8f5e9;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-right: 12px;
          flex-shrink: 0;
        }
        .feature-icon svg {
          width: 14px;
          height: 14px;
          color: #4caf50;
        }
        .feature-text {
          font-size: 14px;
          color: #444;
        }
        .footer {
          text-align: center;
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #eee;
        }
        .footer p {
          font-size: 12px;
          color: #999;
          margin: 4px 0;
        }
        .footer a {
          color: #e94560;
          text-decoration: none;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="card">
          <div class="logo">
            <img src="https://glendaleestates.lovable.app/images/bmd-logo.png" alt="Glendale Estates" />
          </div>
          
          <h1>Your home selections are waiting${data.firstName ? `, ${escapeHtml(data.firstName)}` : ''}!</h1>
          <p class="subtitle">You're almost done customizing your new home at Glendale Estates</p>
          
          <div class="progress-section">
            <div class="progress-header">
              <span class="progress-label">Your Progress</span>
              <span class="progress-percent">${progressPercent}%</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill"></div>
            </div>
            <p class="progress-text">Step ${data.lastStep} of ${data.totalSteps} completed</p>
            <span class="unit-badge">Unit ${escapeHtml(data.unitNumber)}</span>
          </div>
          
          <div class="info-box">
            <p>You last worked on your selections <strong>${timeAgo}</strong>. Your progress has been saved and is ready to continue!</p>
          </div>
          
          <a href="${data.resumeUrl}" class="cta-button">
            Continue My Selections →
          </a>
          
          <div class="features">
            <div class="feature">
              <div class="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
              <span class="feature-text">Your previous selections are saved</span>
            </div>
            <div class="feature">
              <div class="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
              <span class="feature-text">Pick up right where you left off</span>
            </div>
            <div class="feature">
              <div class="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
              <span class="feature-text">Takes just a few minutes to complete</span>
            </div>
          </div>
          
          <div class="footer">
            <p>Need help? Contact us at <a href="mailto:office@bmdmaterials.com">office@bmdmaterials.com</a></p>
            <p style="margin-top: 16px;">BMD Materials | Glendale Estates Selection Portal</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Main request handler
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const internalSecret = req.headers.get("x-internal-secret");
    if (!internalSecret || !safeEqual(internalSecret, supabaseServiceKey)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Parse request body for optional filters
    let targetEmail: string | null = null;
    let minDaysOld = 1; // Default: remind after 1 day
    let maxDaysOld = 14; // Default: don't remind drafts older than 2 weeks
    
    if (req.method === "POST") {
      try {
        const body = await req.json();
        targetEmail = body.email || null;
        minDaysOld = body.minDaysOld ?? 1;
        maxDaysOld = body.maxDaysOld ?? 14;
      } catch {
        // No body provided, use defaults
      }
    }

    // Calculate date range
    const minDate = new Date();
    minDate.setDate(minDate.getDate() - maxDaysOld);
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() - minDaysOld);

    // Query for abandoned drafts
    let query = `${supabaseUrl}/rest/v1/buyer_selection_drafts?select=*,user_id&updated_at=gte.${minDate.toISOString()}&updated_at=lte.${maxDate.toISOString()}&highest_step_reached=gt.0`;
    
    console.log('Fetching drafts from:', query);

    const draftsResponse = await fetch(query, {
      headers: {
        "apikey": supabaseServiceKey,
        "Authorization": `Bearer ${supabaseServiceKey}`,
      },
    });

    if (!draftsResponse.ok) {
      const errorText = await draftsResponse.text();
      console.error('Failed to fetch drafts:', errorText);
      throw new Error('Failed to fetch drafts');
    }

    const drafts = await draftsResponse.json();
    console.log(`Found ${drafts.length} abandoned drafts`);

    if (drafts.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No abandoned drafts found in date range',
        sent: 0 
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Get user emails for these drafts
    const userIds = [...new Set(drafts.map((d: { user_id: string }) => d.user_id))];
    
    // Fetch user data from auth.users via admin API
    const usersResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      headers: {
        "apikey": supabaseServiceKey,
        "Authorization": `Bearer ${supabaseServiceKey}`,
      },
    });

    if (!usersResponse.ok) {
      console.error('Failed to fetch users');
      throw new Error('Failed to fetch user data');
    }

    const usersData = await usersResponse.json();
    const usersMap = new Map(usersData.users?.map((u: { id: string; email: string }) => [u.id, u.email]) || []);

    // Check for existing submissions to avoid reminding people who already submitted
    const unitNumbers = drafts.map((d: { unit_number: string }) => d.unit_number);
    const submissionsResponse = await fetch(
      `${supabaseUrl}/rest/v1/buyer_selections?select=unit_number,email&unit_number=in.(${unitNumbers.map((u: string) => `"${u}"`).join(',')})`,
      {
        headers: {
          "apikey": supabaseServiceKey,
          "Authorization": `Bearer ${supabaseServiceKey}`,
        },
      }
    );

    const submissions = submissionsResponse.ok ? await submissionsResponse.json() : [];
    const submittedUnits = new Set(submissions.map((s: { unit_number: string }) => s.unit_number));

    // Send reminder emails
    const results: { email: string; success: boolean; error?: string }[] = [];
    const portalUrl = 'https://glendaleestates.lovable.app';

    for (const draft of drafts) {
      const email = usersMap.get(draft.user_id) as string | undefined;
      
      if (!email) {
        console.log(`No email found for user ${draft.user_id}`);
        continue;
      }

      // Skip if targeting specific email and this isn't it
      if (targetEmail && email !== targetEmail) {
        continue;
      }

      // Skip if already submitted for this unit
      if (submittedUnits.has(draft.unit_number)) {
        console.log(`Skipping ${email} - already submitted for unit ${draft.unit_number}`);
        continue;
      }

      // Extract first name from selections if available
      const firstName = (draft.selections as Record<string, unknown>)?.firstName as string | undefined;
      
      // Calculate total steps (default 10 for units with stairs)
      const hasStairs = (draft.selections as Record<string, unknown>)?.hasStairs ?? true;
      const totalSteps = hasStairs ? 11 : 10;

      const reminderData: DraftReminder = {
        email,
        firstName,
        unitNumber: draft.unit_number,
        lastStep: draft.highest_step_reached,
        totalSteps,
        lastUpdated: draft.updated_at,
        resumeUrl: `${portalUrl}/buyer-auth?redirect=wizard`,
      };

      try {
        const emailHtml = generateReminderEmailHtml(reminderData);
        
        await sendEmail({
          from: "BMD Materials <selections@bmdmaterials.com>",
          to: [email],
          subject: `Continue your home selections for Unit ${draft.unit_number} - Glendale Estates`,
          html: emailHtml,
        });

        console.log(`Reminder sent to ${email} for unit ${draft.unit_number}`);
        results.push({ email, success: true });
      } catch (error) {
        console.error(`Failed to send to ${email}:`, error);
        results.push({ email, success: false, error: String(error) });
      }
    }

    const successCount = results.filter(r => r.success).length;
    
    return new Response(JSON.stringify({ 
      success: true, 
      message: `Sent ${successCount} reminder emails`,
      sent: successCount,
      failed: results.length - successCount,
      details: results,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  } catch (error: unknown) {
    console.error("Error in send-draft-reminder function:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process draft reminders" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
