import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const MARKETING_AUDIENCE_ID = Deno.env.get("RESEND_AUDIENCE_ID");
const ALL_USERS_AUDIENCE_ID = Deno.env.get("RESEND_ALL_USERS_AUDIENCE_ID");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AddToAudienceRequest {
  email: string;
  firstName?: string;
  lastName?: string;
  audienceType: "all" | "marketing" | "both";
}

async function addContactToAudience(audienceId: string, email: string, firstName?: string, lastName?: string) {
  const response = await fetch(`https://api.resend.com/audiences/${audienceId}/contacts`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: email,
      first_name: firstName || undefined,
      last_name: lastName || undefined,
      unsubscribed: false,
    }),
  });

  const data = await response.json();
  
  if (!response.ok) {
    console.error(`Resend API error for audience ${audienceId}:`, data);
    throw new Error(data.message || "Failed to add contact");
  }
  
  return data;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "Resend API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { email, firstName, lastName, audienceType = "all" }: AddToAudienceRequest = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: { allUsers?: any; marketing?: any } = {};

    // Add to "All Users" audience for service communications
    if ((audienceType === "all" || audienceType === "both") && ALL_USERS_AUDIENCE_ID) {
      console.log(`Adding contact to All Users audience: ${email}`);
      try {
        results.allUsers = await addContactToAudience(ALL_USERS_AUDIENCE_ID, email, firstName, lastName);
        console.log("Added to All Users audience:", results.allUsers);
      } catch (error) {
        console.error("Failed to add to All Users audience:", error);
      }
    }

    // Add to Marketing audience only if opted in
    if ((audienceType === "marketing" || audienceType === "both") && MARKETING_AUDIENCE_ID) {
      console.log(`Adding contact to Marketing audience: ${email}`);
      try {
        results.marketing = await addContactToAudience(MARKETING_AUDIENCE_ID, email, firstName, lastName);
        console.log("Added to Marketing audience:", results.marketing);
      } catch (error) {
        console.error("Failed to add to Marketing audience:", error);
      }
    }

    return new Response(
      JSON.stringify({ success: true, data: results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error adding contact to audience:", error);
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
