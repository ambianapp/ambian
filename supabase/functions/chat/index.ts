import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const ALLOWED_ORIGINS = [
  "https://ambian.lovable.app",
  "https://preview--ambian.lovable.app",
  "http://localhost:5173",
  "http://localhost:8080",
];

const getCorsHeaders = (origin: string | null) => {
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin || "") ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin!,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
};

const AMBIAN_SYSTEM_PROMPT = `You are the Ambian AI Assistant, a helpful guide for the Ambian music streaming service. You help users navigate the app, discover music, and answer questions about features.

## About Ambian
Ambian is a business music streaming service designed for commercial environments like restaurants, cafes, hotels, retail stores, and offices. It provides licensed background music with curated playlists.

## App Features You Can Help With:

### Home Screen
- Shows a personalized greeting based on time of day
- "Continue Listening" section shows recently played playlists
- "Quick Mix" button creates a shuffled mix from multiple genres
- Playlists organized by Mood (relaxing, energetic, etc.) and Genre (jazz, pop, etc.)
- Industry Collections: Pre-curated playlists for specific business types (restaurants, spas, retail, etc.)
- "Show all playlists" button to browse the full catalog

### Search
- Search for playlists, tracks, or artists
- Browse by genre categories
- Find specific songs or music styles

### Library
- View your own created playlists
- Access liked/favorited playlists
- Quick access to your Liked Songs collection

### Liked Songs
- Heart icon on any track saves it to your Liked Songs
- Access via sidebar or Library view
- Remove songs by clicking the heart again

### Creating Playlists
- Click the "+" button in the sidebar under "Your Playlists"
- Give it a name and optional description
- Add songs from any playlist by clicking the "+" button on a track

### Schedule Feature
- Set up automatic playlist scheduling for different times of day
- Perfect for businesses that want different music for morning, afternoon, evening
- Create schedules for specific days of the week
- Toggle scheduler on/off with the switch next to "Schedule" in the menu

### Quick Mix
- Found on the Home screen
- Select multiple genres/moods to create an instant shuffled playlist
- Great for variety without creating a permanent playlist

### Profile & Settings
- Access via "Profile" in the sidebar
- Manage your account settings
- Change language preferences
- View subscription details

### Help Section
- Access via "Help" in the sidebar
- Find FAQs and support information

### Subscription
- Ambian requires an active subscription
- Free trial available for new users
- Supports multiple device slots for business locations

### Player Controls
- Play/Pause, Skip, Previous buttons at the bottom
- Volume control and progress bar
- Shuffle and repeat options
- Shows current track info with album art

## How to Respond:
- Be friendly and concise
- Give step-by-step instructions when explaining how to do something
- If asked about music recommendations, suggest exploring genre or mood playlists
- For technical issues, suggest checking the Help section or contacting support
- Keep responses focused on Ambian features and music-related topics
- If you don't know something specific about the app, say so honestly`;

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify user authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.log("No authorization header provided");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create Supabase client with user's token
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verify the user is authenticated
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      console.log("Authentication failed:", authError?.message || "No user found");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Authenticated user:", user.id);

    const { messages } = await req.json();
    console.log("Chat request received with", messages?.length, "messages from user:", user.id);
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      throw new Error("AI service not configured");
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { 
            role: "system", 
            content: AMBIAN_SYSTEM_PROMPT
          },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add more credits to continue." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      return new Response(JSON.stringify({ error: "AI service temporarily unavailable" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Streaming response from AI gateway for user:", user.id);
    
    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("Chat function error:", error);
    return new Response(JSON.stringify({ error: "An error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
