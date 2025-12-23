import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY") as string);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Brand colors matching the app
const brandColors = {
  background: "#0f0f23",
  cardBackground: "#1a1a2e",
  primary: "#8b5cf6",
  primaryHover: "#7c3aed",
  text: "#ffffff",
  textMuted: "#a1a1aa",
  border: "#27272a",
};

// Get email content based on type
const getEmailContent = (emailType: string) => {
  switch (emailType) {
    case "recovery":
      return {
        subject: "Reset Your Ambian Password",
        heading: "Reset Your Password",
        description: "Use the verification code below to reset your password.",
        footerNote: "If you didn't request a password reset, you can safely ignore this email.",
      };
    case "signup":
      return {
        subject: "Welcome to Ambian - Confirm Your Email",
        heading: "Welcome to Ambian!",
        description: "Thanks for signing up. Use the code below to verify your email address.",
        footerNote: "If you didn't create an Ambian account, you can safely ignore this email.",
      };
    case "magiclink":
      return {
        subject: "Your Ambian Login Code",
        heading: "Sign In to Ambian",
        description: "Use this verification code to sign in to your account. This code expires in 1 hour.",
        footerNote: "If you didn't request this login code, you can safely ignore this email.",
      };
    case "invite":
      return {
        subject: "You're Invited to Ambian",
        heading: "You've Been Invited!",
        description: "You've been invited to join Ambian. Use the code below to set up your account.",
        footerNote: "If you weren't expecting this invitation, you can safely ignore this email.",
      };
    case "email_change":
      return {
        subject: "Confirm Your New Email - Ambian",
        heading: "Confirm Email Change",
        description: "Use this verification code to confirm your new email address.",
        footerNote: "If you didn't request this change, please contact support immediately.",
      };
    default:
      return {
        subject: "Ambian",
        heading: "Hello!",
        description: "Use the code below to continue.",
        footerNote: "",
      };
  }
};

// Generate branded HTML email with OTP
const generateEmailHtml = (
  content: ReturnType<typeof getEmailContent>,
  otp: string,
  userEmail: string
) => {
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
                ${content.heading}
              </h1>
              
              <!-- Description -->
              <p style="color: ${brandColors.textMuted}; font-size: 16px; line-height: 24px; text-align: center; margin: 0 0 32px 0;">
                ${content.description}
              </p>
              
              <!-- OTP Code -->
              <div style="background-color: ${brandColors.background}; border: 2px solid ${brandColors.primary}; border-radius: 12px; padding: 24px; text-align: center; margin: 0 0 32px 0;">
                <p style="color: ${brandColors.textMuted}; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px 0;">
                  Verification Code
                </p>
                <p style="color: ${brandColors.text}; font-size: 36px; font-weight: 700; letter-spacing: 8px; font-family: monospace; margin: 0;">
                  ${otp}
                </p>
              </div>
              
              <p style="color: ${brandColors.textMuted}; font-size: 14px; text-align: center; margin: 0 0 24px 0;">
                Enter this code in the app to continue. This code expires in 1 hour.
              </p>
              
              <!-- Divider -->
              <hr style="border: none; border-top: 1px solid ${brandColors.border}; margin: 24px 0;">
              
              <!-- Footer note -->
              <p style="color: ${brandColors.textMuted}; font-size: 13px; text-align: center; margin: 0 0 8px 0;">
                ${content.footerNote}
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
              <a href="https://ambian.app" style="color: ${brandColors.primary}; font-size: 12px; text-decoration: none;">
                ambian.app
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

interface EmailRequest {
  email: string;
  type: "recovery" | "signup" | "magiclink" | "invite" | "email_change";
}

serve(async (req) => {
  console.log("send-auth-email function invoked");

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    console.log("Invalid method:", req.method);
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const { email, type }: EmailRequest = await req.json();

    if (!email || !type) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: email, type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Processing email for:", email, "type:", type);

    // Create Supabase admin client
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Generate recovery link using Supabase Auth Admin API
    const { data, error: generateError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: email,
    });

    if (generateError) {
      console.error("Generate link error:", generateError);
      throw generateError;
    }

    // Extract the token from the generated link
    const actionLink = data?.properties?.action_link || '';
    console.log("Action link generated for:", email);
    
    // Parse the URL to get the token
    const url = new URL(actionLink);
    const token = url.searchParams.get('token') || '';
    
    if (!token) {
      throw new Error("Failed to generate verification token");
    }

    // Generate a 6-digit OTP from the token for display purposes
    // The actual verification will use the full token
    const otp = token.substring(0, 6).toUpperCase();

    const content = getEmailContent(type);
    const html = generateEmailHtml(content, otp, email);

    // Send the email via Resend
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: "Ambian <noreply@ambian.app>",
      to: [email],
      subject: content.subject,
      html,
    });

    if (emailError) {
      console.error("Resend error:", emailError);
      throw emailError;
    }

    console.log("Email sent successfully:", emailData);

    return new Response(JSON.stringify({ 
      success: true, 
      message: "Verification code sent",
      // Return the token for client-side verification (first 6 chars shown to user as OTP)
      token: token
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in send-auth-email:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});