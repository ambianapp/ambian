import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";
import { Resend } from "https://esm.sh/resend@4.0.0";

const ALLOWED_ORIGINS = [
  "https://ambian.lovable.app",
  "https://preview--ambian.lovable.app",
  "https://ambianmusic.com",
  "https://www.ambianmusic.com",
  "http://localhost:5173",
  "http://localhost:8080",
];

const getCorsHeaders = (origin: string | null) => {
  const allowedOrigin =
    origin &&
    (ALLOWED_ORIGINS.includes(origin) ||
      origin.endsWith(".lovable.app") ||
      origin.endsWith(".lovableproject.com"))
      ? origin
      : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[DELETE-USER] ${step}${detailsStr}`);
};

// Brand colors matching the app
const brandColors = {
  background: "#0f0f23",
  cardBackground: "#1a1a2e",
  primary: "#8b5cf6",
  text: "#ffffff",
  textMuted: "#a1a1aa",
  border: "#27272a",
};

// Generate account deletion email HTML
const generateDeletionEmailHtml = (userEmail: string) => {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="background-color: ${brandColors.background}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 40px 20px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background-color: ${brandColors.cardBackground}; border-radius: 16px; border: 1px solid ${brandColors.border}; max-width: 520px;">
          <tr>
            <td style="padding: 40px;">
              <!-- Logo -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-bottom: 32px;">
                    <img src="https://hjecjqyonxvrrvprbvgr.supabase.co/storage/v1/object/public/playlist-covers/ambian-logo.png" alt="Ambian" width="140" style="display: block;">
                  </td>
                </tr>
              </table>
              
              <!-- Heading -->
              <h1 style="color: ${brandColors.text}; font-size: 24px; font-weight: 600; text-align: center; margin: 0 0 16px 0;">
                Account Deleted
              </h1>
              
              <!-- Description -->
              <p style="color: ${brandColors.textMuted}; font-size: 16px; line-height: 24px; text-align: center; margin: 0 0 24px 0;">
                Your Ambian account has been deleted. All your data, including playlists, preferences, and subscription information, has been permanently removed from our system.
              </p>
              
              <p style="color: ${brandColors.textMuted}; font-size: 16px; line-height: 24px; text-align: center; margin: 0 0 32px 0;">
                If you have any questions or believe this was done in error, please contact our support team.
              </p>
              
              <!-- Divider -->
              <hr style="border: none; border-top: 1px solid ${brandColors.border}; margin: 24px 0;">
              
              <!-- Footer note -->
              <p style="color: ${brandColors.textMuted}; font-size: 13px; text-align: center; margin: 0 0 8px 0;">
                We're sorry to see you go. Thank you for being part of Ambian.
              </p>
              
              <!-- Email sent to -->
              <p style="color: ${brandColors.textMuted}; font-size: 12px; text-align: center; margin: 16px 0 0 0;">
                This email was sent to ${userEmail}
              </p>
            </td>
          </tr>
        </table>
        
        <!-- Footer branding -->
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width: 520px;">
          <tr>
            <td align="center" style="padding-top: 24px;">
              <p style="color: ${brandColors.textMuted}; font-size: 12px; margin: 0 0 4px 0;">
                © ${new Date().getFullYear()} Ambian. Premium background music for businesses.
              </p>
              <a href="https://ambianmusic.com" style="color: ${brandColors.primary}; font-size: 12px; text-decoration: none;">
                ambianmusic.com
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
};

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    // Create client with user's token to verify admin status
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      logStep("Auth error", { error: userError?.message });
      throw new Error("Unauthorized");
    }

    // Check if requesting user is admin
    const { data: isAdmin } = await userClient.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });

    if (!isAdmin) {
      logStep("Non-admin attempted delete", { userId: user.id });
      throw new Error("Unauthorized - admin access required");
    }

    const { userId } = await req.json();
    if (!userId) {
      throw new Error("Missing userId parameter");
    }

    logStep("Admin deleting user", { adminId: user.id, targetUserId: userId });

    // Use service role client to get user email and delete user
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Get the user's email before deleting
    const { data: targetUser, error: getUserError } = await adminClient.auth.admin.getUserById(userId);
    
    if (getUserError) {
      logStep("Error getting user", { error: getUserError.message });
      throw new Error(`Failed to get user: ${getUserError.message}`);
    }

    const userEmail = targetUser?.user?.email;
    logStep("Found user email", { email: userEmail });

    // Delete from auth.users (this will cascade to profiles due to FK constraint)
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);

    if (deleteError) {
      logStep("Delete error", { error: deleteError.message });
      throw new Error(`Failed to delete user: ${deleteError.message}`);
    }

    logStep("User deleted successfully", { deletedUserId: userId });

    // Send notification email if we have the email and Resend API key
    if (userEmail && resendApiKey) {
      try {
        const resend = new Resend(resendApiKey);
        const html = generateDeletionEmailHtml(userEmail);

        const { error: emailError } = await resend.emails.send({
          from: "Ambian <noreply@ambianmusic.com>",
          to: [userEmail],
          subject: "Your Ambian Account Has Been Deleted",
          html,
        });

        if (emailError) {
          logStep("Email send error", { error: emailError });
          // Don't throw - user is already deleted, just log the error
        } else {
          logStep("Deletion notification email sent", { email: userEmail });
        }
      } catch (emailErr) {
        logStep("Email error", { error: emailErr instanceof Error ? emailErr.message : "Unknown" });
        // Don't throw - user is already deleted
      }
    } else {
      logStep("Skipping email", { hasEmail: !!userEmail, hasResendKey: !!resendApiKey });
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logStep("Error", { message });
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});