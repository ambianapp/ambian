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
        description: "Click the button below to reset your password. This link expires in 1 hour.",
        footerNote: "If you didn't request a password reset, you can safely ignore this email.",
        buttonText: "Reset Password",
      };
    case "signup":
      return {
        subject: "Welcome to Ambian - Confirm Your Email",
        heading: "Welcome to Ambian!",
        description: "Thanks for signing up. Click the button below to verify your email address.",
        footerNote: "If you didn't create an Ambian account, you can safely ignore this email.",
        buttonText: "Verify Email",
      };
    case "magiclink":
      return {
        subject: "Your Ambian Login Link",
        heading: "Sign In to Ambian",
        description: "Click the button below to sign in to your account. This link expires in 1 hour.",
        footerNote: "If you didn't request this login link, you can safely ignore this email.",
        buttonText: "Sign In",
      };
    case "invite":
      return {
        subject: "You're Invited to Ambian",
        heading: "You've Been Invited!",
        description: "You've been invited to join Ambian. Click the button below to set up your account.",
        footerNote: "If you weren't expecting this invitation, you can safely ignore this email.",
        buttonText: "Accept Invitation",
      };
    case "email_change":
      return {
        subject: "Confirm Your New Email - Ambian",
        heading: "Confirm Email Change",
        description: "Click the button below to confirm your new email address.",
        footerNote: "If you didn't request this change, please contact support immediately.",
        buttonText: "Confirm Email",
      };
    default:
      return {
        subject: "Ambian",
        heading: "Hello!",
        description: "Click the button below to continue.",
        footerNote: "",
        buttonText: "Continue",
      };
  }
};

// Generate branded HTML email with link button
const generateEmailHtml = (
  content: ReturnType<typeof getEmailContent>,
  resetLink: string,
  userEmail: string
) => {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    @media only screen and (max-width: 480px) {
      .email-container {
        width: 100% !important;
        max-width: 100% !important;
      }
      .email-content {
        padding: 24px 16px !important;
      }
    }
  </style>
</head>
<body style="background-color: ${brandColors.background}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 20px 12px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 100%;">
    <tr>
      <td align="center">
        <table role="presentation" class="email-container" cellpadding="0" cellspacing="0" style="background-color: ${brandColors.cardBackground}; border-radius: 16px; border: 1px solid ${brandColors.border}; width: 100%; max-width: 480px;">
          <tr>
            <td class="email-content" style="padding: 32px 24px;">
              <!-- Logo -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-bottom: 24px;">
                    <img src="https://ambianmusic.com/ambian-logo.png" alt="Ambian" width="120" style="display: block; max-width: 120px; height: auto;">
                  </td>
                </tr>
              </table>
              
              <!-- Heading -->
              <h1 style="color: ${brandColors.text}; font-size: 22px; font-weight: 600; text-align: center; margin: 0 0 12px 0;">
                ${content.heading}
              </h1>
              
              <!-- Description -->
              <p style="color: ${brandColors.textMuted}; font-size: 15px; line-height: 22px; text-align: center; margin: 0 0 24px 0;">
                ${content.description}
              </p>
              
              <!-- CTA Button -->
              <div style="text-align: center; margin: 0 0 24px 0;">
                <a href="${resetLink}" style="display: inline-block; background-color: ${brandColors.primary}; color: ${brandColors.text}; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 28px; border-radius: 8px;">
                  ${content.buttonText}
                </a>
              </div>
              
              <p style="color: ${brandColors.textMuted}; font-size: 12px; text-align: center; margin: 0 0 16px 0;">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="color: ${brandColors.primary}; font-size: 11px; text-align: center; word-break: break-all; overflow-wrap: break-word; margin: 0 0 20px 0; max-width: 100%;">
                <a href="${resetLink}" style="color: ${brandColors.primary}; text-decoration: underline; word-break: break-all;">${resetLink}</a>
              </p>
              
              <!-- Divider -->
              <hr style="border: none; border-top: 1px solid ${brandColors.border}; margin: 20px 0;">
              
              <!-- Footer note -->
              <p style="color: ${brandColors.textMuted}; font-size: 12px; text-align: center; margin: 0 0 8px 0;">
                ${content.footerNote}
              </p>
              
              <!-- Email sent to -->
              <p style="color: ${brandColors.textMuted}; font-size: 11px; text-align: center; margin: 12px 0 0 0;">
                This email was sent to <a href="mailto:${userEmail}" style="color: ${brandColors.primary}; text-decoration: none;">${userEmail}</a>
              </p>
            </td>
          </tr>
        </table>
        
        <!-- Footer branding -->
        <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; max-width: 480px;">
          <tr>
            <td align="center" style="padding-top: 20px;">
              <p style="color: ${brandColors.textMuted}; font-size: 11px; margin: 0 0 4px 0;">
                © ${new Date().getFullYear()} Ambian. Premium background music for businesses.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`
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
      options: {
        redirectTo: `${Deno.env.get("SITE_URL") || "https://ambianmusic.com"}/reset-password`,
      }
    });

    if (generateError) {
      console.error("Generate link error:", generateError);
      throw generateError;
    }

    // Get the action link from Supabase
    const actionLink = data?.properties?.action_link || '';
    console.log("Action link generated for:", email);
    
    if (!actionLink) {
      throw new Error("Failed to generate reset link");
    }

    const content = getEmailContent(type);
    const html = generateEmailHtml(content, actionLink, email);

    // Send the email via Resend using verified domain
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: "Ambian <noreply@ambianmusic.com>",
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
      message: "Reset link sent"
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