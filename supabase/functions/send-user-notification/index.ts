import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  type: "user_created" | "password_reset" | "client_signup";
  userEmail: string;
  performedByEmail?: string;
  tempPassword?: string;
}

async function sendEmail(options: {
  to: string[];
  subject: string;
  html: string;
}): Promise<{ success: boolean; error?: string }> {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  
  if (!resendApiKey) {
    console.error("RESEND_API_KEY not configured");
    return { success: false, error: "Email service not configured" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Glendale Estates <selections@bmdmaterials.com>",
        to: options.to,
        subject: options.subject,
        html: options.html,
      }),
    });

    const result = await response.json();
    
    if (!response.ok) {
      console.error("Email send error:", result);
      return { success: false, error: result.message || "Failed to send email" };
    }
    
    console.log("Email sent successfully:", result.id);
    return { success: true };
  } catch (error) {
    console.error("Email send exception:", error);
    return { success: false, error: String(error) };
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function generateUserCreatedEmail(userEmail: string, performedByEmail: string, tempPassword?: string): string {
  const passwordSection = tempPassword 
    ? `<p style="background: #f5f5f5; padding: 15px; border-radius: 8px; font-family: monospace; font-size: 16px;">
        <strong>Temporary Password:</strong> ${escapeHtml(tempPassword)}
       </p>
       <p style="color: #e74c3c; font-weight: bold;">Please change this password upon first login!</p>`
    : '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">Welcome to Glendale Estates</h1>
        <p style="color: #bdc3c7; margin: 10px 0 0 0;">Your account has been created</p>
      </div>
      
      <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 12px 12px;">
        <p>Hello,</p>
        <p>An account has been created for you at the Glendale Estates Selection Portal.</p>
        
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0;"><strong>Email:</strong> ${escapeHtml(userEmail)}</p>
          <p style="margin: 10px 0 0 0;"><strong>Created by:</strong> ${escapeHtml(performedByEmail)}</p>
        </div>
        
        ${passwordSection}
        
        <p>You can now log in to access your account and make your selections.</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="https://glendaleestates.lovable.app" style="background: #3498db; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: bold;">Login to Portal</a>
        </div>
        
        <p style="color: #7f8c8d; font-size: 14px; border-top: 1px solid #e0e0e0; padding-top: 20px; margin-top: 30px;">
          If you did not expect this email, please contact the Glendale Estates team.
        </p>
      </div>
    </body>
    </html>
  `;
}

function generatePasswordResetEmail(userEmail: string, performedByEmail: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">Password Reset Notification</h1>
        <p style="color: #fadbd8; margin: 10px 0 0 0;">Glendale Estates Selection Portal</p>
      </div>
      
      <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 12px 12px;">
        <p>Hello,</p>
        <p>Your password has been reset by an administrator.</p>
        
        <div style="background: #fdf2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #e74c3c;">
          <p style="margin: 0;"><strong>Account:</strong> ${escapeHtml(userEmail)}</p>
          <p style="margin: 10px 0 0 0;"><strong>Reset by:</strong> ${escapeHtml(performedByEmail)}</p>
          <p style="margin: 10px 0 0 0;"><strong>Time:</strong> ${new Date().toLocaleString()}</p>
        </div>
        
        <p>If you did not request this password reset, please contact the Glendale Estates team immediately.</p>
        
        <p style="color: #7f8c8d; font-size: 14px; border-top: 1px solid #e0e0e0; padding-top: 20px; margin-top: 30px;">
          This is an automated security notification from the Glendale Estates Selection Portal.
        </p>
      </div>
    </body>
    </html>
  `;
}

function generateClientSignupEmail(userEmail: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #27ae60 0%, #2ecc71 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">New Client Registration</h1>
        <p style="color: #d5f5e3; margin: 10px 0 0 0;">Glendale Estates Selection Portal</p>
      </div>
      
      <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 12px 12px;">
        <p>A new client has registered on the selection portal.</p>
        
        <div style="background: #eafaf1; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #27ae60;">
          <p style="margin: 0;"><strong>Email:</strong> ${escapeHtml(userEmail)}</p>
          <p style="margin: 10px 0 0 0;"><strong>Registration Time:</strong> ${new Date().toLocaleString()}</p>
        </div>
        
        <p>You can view this user's account in the admin portal.</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="https://glendaleestates.lovable.app/admin/users" style="background: #27ae60; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: bold;">View Users</a>
        </div>
      </div>
    </body>
    </html>
  `;
}

function generateAdminNotificationEmail(action: string, userEmail: string, performedByEmail?: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #9b59b6 0%, #8e44ad 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">Admin Activity Notification</h1>
        <p style="color: #e8daef; margin: 10px 0 0 0;">Glendale Estates Selection Portal</p>
      </div>
      
      <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 12px 12px;">
        <p>An administrative action has been performed on the selection portal.</p>
        
        <div style="background: #f5eef8; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #9b59b6;">
          <p style="margin: 0;"><strong>Action:</strong> ${escapeHtml(action)}</p>
          <p style="margin: 10px 0 0 0;"><strong>Target User:</strong> ${escapeHtml(userEmail)}</p>
          ${performedByEmail ? `<p style="margin: 10px 0 0 0;"><strong>Performed By:</strong> ${escapeHtml(performedByEmail)}</p>` : ''}
          <p style="margin: 10px 0 0 0;"><strong>Time:</strong> ${new Date().toLocaleString()}</p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="https://glendaleestates.lovable.app/admin/users" style="background: #9b59b6; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: bold;">View Activity Log</a>
        </div>
      </div>
    </body>
    </html>
  `;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { type, userEmail, performedByEmail, tempPassword }: NotificationRequest = await req.json();

    console.log(`Processing notification: type=${type}, user=${userEmail}`);

    // Admin notification recipients
    const adminEmails = ["dan@bmdmaterials.com", "office@bmdmaterials.com"];
    
    let results: { success: boolean; error?: string }[] = [];

    switch (type) {
      case "user_created": {
        // Send welcome email to the new user
        const welcomeEmail = generateUserCreatedEmail(userEmail, performedByEmail || "System", tempPassword);
        const userResult = await sendEmail({
          to: [userEmail],
          subject: "Welcome to Glendale Estates Selection Portal",
          html: welcomeEmail,
        });
        results.push(userResult);

        // Notify admins
        const adminNotification = generateAdminNotificationEmail("New User Created", userEmail, performedByEmail);
        const adminResult = await sendEmail({
          to: adminEmails,
          subject: `[Admin] New User Created: ${userEmail}`,
          html: adminNotification,
        });
        results.push(adminResult);
        break;
      }

      case "password_reset": {
        // Notify the user their password was reset
        const resetEmail = generatePasswordResetEmail(userEmail, performedByEmail || "System");
        const userResult = await sendEmail({
          to: [userEmail],
          subject: "Your Password Has Been Reset - Glendale Estates",
          html: resetEmail,
        });
        results.push(userResult);

        // Notify admins
        const adminNotification = generateAdminNotificationEmail("Password Reset", userEmail, performedByEmail);
        const adminResult = await sendEmail({
          to: adminEmails,
          subject: `[Admin] Password Reset: ${userEmail}`,
          html: adminNotification,
        });
        results.push(adminResult);
        break;
      }

      case "client_signup": {
        // Notify admins of new client registration
        const signupEmail = generateClientSignupEmail(userEmail);
        const adminResult = await sendEmail({
          to: adminEmails,
          subject: `[New Registration] ${userEmail} signed up`,
          html: signupEmail,
        });
        results.push(adminResult);
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: "Invalid notification type" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const allSuccessful = results.every(r => r.success);
    const errors = results.filter(r => !r.success).map(r => r.error);

    return new Response(
      JSON.stringify({ 
        success: allSuccessful, 
        message: allSuccessful ? "Notifications sent" : "Some notifications failed",
        errors: errors.length > 0 ? errors : undefined
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Notification error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
