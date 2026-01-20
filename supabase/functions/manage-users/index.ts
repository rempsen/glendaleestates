import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Log user activity
async function logActivity(
  supabaseAdmin: any,
  actionType: string,
  targetUserId: string | null,
  targetUserEmail: string,
  performedByUserId: string,
  performedByEmail: string,
  details?: Record<string, unknown>
) {
  try {
    const { error } = await supabaseAdmin
      .from("user_activity_logs")
      .insert({
        action_type: actionType,
        target_user_id: targetUserId,
        target_user_email: targetUserEmail,
        performed_by_user_id: performedByUserId,
        performed_by_email: performedByEmail,
        details: details || null,
      });

    if (error) {
      console.error("Failed to log activity:", error);
    } else {
      console.log(`Activity logged: ${actionType} for ${targetUserEmail}`);
    }
  } catch (err) {
    console.error("Error logging activity:", err);
  }
}

// Send notification email
async function sendNotification(
  type: string,
  userEmail: string,
  performedByEmail: string,
  tempPassword?: string
) {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const response = await fetch(`${supabaseUrl}/functions/v1/send-user-notification`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type,
        userEmail,
        performedByEmail,
        tempPassword,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Notification send failed:", error);
    } else {
      console.log(`Notification sent: ${type} for ${userEmail}`);
    }
  } catch (err) {
    console.error("Error sending notification:", err);
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Create admin client with service role key
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Verify the requesting user is an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: requestingUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !requestingUser) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if requesting user is admin
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", requestingUser.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(
        JSON.stringify({ error: "Unauthorized - Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, ...params } = await req.json();
    const performerEmail = requestingUser.email || "Unknown admin";

    switch (action) {
      case "list": {
        // Get all users from auth
        const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        
        if (listError) {
          throw listError;
        }

        // Get all roles
        const { data: roles } = await supabaseAdmin
          .from("user_roles")
          .select("user_id, role");

        // Get buyer info (first/last names) from buyer_selections
        const { data: buyerInfo } = await supabaseAdmin
          .from("buyer_selections")
          .select("email, first_name, last_name, unit_number");

        // Create a map of email to buyer info
        const buyerMap = new Map<string, { first_name: string; last_name: string; unit_number: string }>();
        if (buyerInfo) {
          for (const buyer of buyerInfo) {
            buyerMap.set(buyer.email.toLowerCase(), {
              first_name: buyer.first_name,
              last_name: buyer.last_name,
              unit_number: buyer.unit_number,
            });
          }
        }

        // Combine user data with roles and buyer info
        const usersWithRoles = users.map((user) => {
          const buyerData = buyerMap.get(user.email?.toLowerCase() || "");
          return {
            id: user.id,
            email: user.email,
            first_name: buyerData?.first_name || null,
            last_name: buyerData?.last_name || null,
            unit_number: buyerData?.unit_number || null,
            created_at: user.created_at,
            last_sign_in_at: user.last_sign_in_at,
            email_confirmed_at: user.email_confirmed_at,
            roles: roles?.filter((r) => r.user_id === user.id).map((r) => r.role) || [],
          };
        });

        return new Response(
          JSON.stringify({ users: usersWithRoles }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "create": {
        const { email, password } = params;
        
        if (!email || !password) {
          return new Response(
            JSON.stringify({ error: "Email and password are required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });

        if (createError) {
          throw createError;
        }

        // Log the activity
        await logActivity(
          supabaseAdmin,
          "user_created",
          newUser.user?.id || null,
          email,
          requestingUser.id,
          performerEmail,
          { created_by_admin: true }
        );

        // Send notification email (don't await, run in background)
        sendNotification("user_created", email, performerEmail, password);

        return new Response(
          JSON.stringify({ user: newUser.user, message: "User created successfully" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "updateRole": {
        const { userId, role, roleAction } = params;
        
        if (!userId || !role) {
          return new Response(
            JSON.stringify({ error: "User ID and role are required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get target user email
        const { data: { user: targetUser } } = await supabaseAdmin.auth.admin.getUserById(userId);
        const targetEmail = targetUser?.email || "Unknown";

        if (roleAction === "add") {
          const { error: insertError } = await supabaseAdmin
            .from("user_roles")
            .insert({ user_id: userId, role });

          if (insertError && !insertError.message.includes("duplicate")) {
            throw insertError;
          }

          await logActivity(
            supabaseAdmin,
            "role_added",
            userId,
            targetEmail,
            requestingUser.id,
            performerEmail,
            { role }
          );
        } else if (roleAction === "remove") {
          const { error: deleteError } = await supabaseAdmin
            .from("user_roles")
            .delete()
            .eq("user_id", userId)
            .eq("role", role);

          if (deleteError) {
            throw deleteError;
          }

          await logActivity(
            supabaseAdmin,
            "role_removed",
            userId,
            targetEmail,
            requestingUser.id,
            performerEmail,
            { role }
          );
        }

        return new Response(
          JSON.stringify({ message: "Role updated successfully" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "resetPassword": {
        const { userId, newPassword } = params;
        
        if (!userId || !newPassword) {
          return new Response(
            JSON.stringify({ error: "User ID and new password are required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get target user email
        const { data: { user: targetUser } } = await supabaseAdmin.auth.admin.getUserById(userId);
        const targetEmail = targetUser?.email || "Unknown";

        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
          userId,
          { password: newPassword }
        );

        if (updateError) {
          throw updateError;
        }

        // Log the activity
        await logActivity(
          supabaseAdmin,
          "password_reset",
          userId,
          targetEmail,
          requestingUser.id,
          performerEmail,
          { reset_by_admin: true }
        );

        // Send notification email
        sendNotification("password_reset", targetEmail, performerEmail);

        return new Response(
          JSON.stringify({ message: "Password reset successfully" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "delete": {
        const { userId } = params;
        
        if (!userId) {
          return new Response(
            JSON.stringify({ error: "User ID is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Prevent self-deletion
        if (userId === requestingUser.id) {
          return new Response(
            JSON.stringify({ error: "Cannot delete your own account" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get target user email before deletion
        const { data: { user: targetUser } } = await supabaseAdmin.auth.admin.getUserById(userId);
        const targetEmail = targetUser?.email || "Unknown";

        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

        if (deleteError) {
          throw deleteError;
        }

        // Log the activity
        await logActivity(
          supabaseAdmin,
          "user_deleted",
          userId,
          targetEmail,
          requestingUser.id,
          performerEmail
        );

        return new Response(
          JSON.stringify({ message: "User deleted successfully" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "getLogs": {
        const { limit = 100, offset = 0 } = params;
        
        const { data: logs, error: logsError, count } = await supabaseAdmin
          .from("user_activity_logs")
          .select("*", { count: "exact" })
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);

        if (logsError) {
          throw logsError;
        }

        return new Response(
          JSON.stringify({ logs: logs || [], total: count || 0 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: "Invalid action" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
