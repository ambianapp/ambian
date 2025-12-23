import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const ALL_USERS_AUDIENCE_ID = Deno.env.get("RESEND_ALL_USERS_AUDIENCE_ID");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function addContactToAudience(audienceId: string, email: string, firstName?: string) {
  const response = await fetch(`https://api.resend.com/audiences/${audienceId}/contacts`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: email,
      first_name: firstName || undefined,
      unsubscribed: false,
    }),
  });

  const data = await response.json();
  return { ok: response.ok, data };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!RESEND_API_KEY || !ALL_USERS_AUDIENCE_ID) {
      console.error("Missing required environment variables");
      return new Response(
        JSON.stringify({ error: "Missing configuration" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("Missing Supabase configuration");
      return new Response(
        JSON.stringify({ error: "Missing Supabase configuration" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create admin client to bypass RLS
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch all users from profiles table
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("email, full_name")
      .not("email", "is", null);

    if (error) {
      console.error("Error fetching profiles:", error);
      return new Response(
        JSON.stringify({ error: "Failed to fetch profiles" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${profiles?.length || 0} users to sync`);

    const results = {
      total: profiles?.length || 0,
      success: 0,
      failed: 0,
      errors: [] as string[],
    };

    // Add each user to the audience
    for (const profile of profiles || []) {
      if (!profile.email) continue;

      try {
        const result = await addContactToAudience(
          ALL_USERS_AUDIENCE_ID,
          profile.email,
          profile.full_name || undefined
        );

        if (result.ok) {
          results.success++;
          console.log(`Added: ${profile.email}`);
        } else {
          // Check if it's a duplicate error (already exists)
          if (result.data?.message?.includes("already exists")) {
            results.success++;
            console.log(`Already exists: ${profile.email}`);
          } else {
            results.failed++;
            results.errors.push(`${profile.email}: ${result.data?.message || "Unknown error"}`);
            console.error(`Failed to add ${profile.email}:`, result.data);
          }
        }
      } catch (err) {
        results.failed++;
        results.errors.push(`${profile.email}: ${err}`);
        console.error(`Error adding ${profile.email}:`, err);
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log("Sync complete:", results);

    return new Response(
      JSON.stringify({ success: true, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error syncing users:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
