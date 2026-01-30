import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type DbPlaylist = Tables<"playlists">;

interface HomeData {
  moodPlaylists: DbPlaylist[];
  genrePlaylists: DbPlaylist[];
  recentlyUpdated: DbPlaylist[];
  newPlaylists: DbPlaylist[];
  recentlyPlayed: DbPlaylist[];
  hasRecentlyPlayed: boolean;
}

async function fetchHomeData(userId?: string): Promise<HomeData> {
  // Run ALL queries in parallel for maximum speed
  const [moodResult, genreResult, updatedResult, newResult, historyResult] = await Promise.all([
    // Mood playlists
    supabase
      .from("playlists")
      .select("*")
      .eq("is_system", true)
      .eq("category", "mood")
      .order("display_order", { ascending: true }),
    
    // Genre playlists
    supabase
      .from("playlists")
      .select("*")
      .eq("is_system", true)
      .eq("category", "genre")
      .order("display_order", { ascending: true }),
    
    // Recently updated playlists
    supabase
      .from("playlists")
      .select("*")
      .eq("is_system", true)
      .order("updated_at", { ascending: false })
      .limit(4),
    
    // Newest playlists
    supabase
      .from("playlists")
      .select("*")
      .eq("is_system", true)
      .order("created_at", { ascending: false })
      .limit(4),
    
    // Play history (only if user is logged in)
    userId
      ? supabase
          .from("play_history")
          .select("playlist_id, played_at")
          .eq("user_id", userId)
          .order("played_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: null }),
  ]);

  // Process recently played playlists
  let recentlyPlayed: DbPlaylist[] = [];
  let hasRecentlyPlayed = false;

  if (historyResult.data && historyResult.data.length > 0) {
    // Get unique playlist IDs (most recent first)
    const uniquePlaylistIds = [...new Set(historyResult.data.map(h => h.playlist_id))] as string[];
    const limitedIds = uniquePlaylistIds.slice(0, 4);
    
    // Fetch playlist details
    const { data: playlistData } = await supabase
      .from("playlists")
      .select("*")
      .in("id", limitedIds);

    if (playlistData) {
      // Sort by original order
      recentlyPlayed = limitedIds
        .map(id => playlistData.find(p => p.id === id))
        .filter((p): p is DbPlaylist => p !== undefined);
      hasRecentlyPlayed = recentlyPlayed.length > 0;
    }
  }

  return {
    moodPlaylists: moodResult.data || [],
    genrePlaylists: genreResult.data || [],
    recentlyUpdated: updatedResult.data || [],
    newPlaylists: newResult.data || [],
    recentlyPlayed,
    hasRecentlyPlayed,
  };
}

export function useHomeData(userId?: string) {
  return useQuery({
    queryKey: ["home-playlists", userId],
    queryFn: () => fetchHomeData(userId),
    staleTime: 5 * 60 * 1000, // 5 minutes - show cached data instantly
    gcTime: 30 * 60 * 1000,   // 30 minutes - keep in cache longer
    refetchOnWindowFocus: false, // Don't refetch when tab gains focus
  });
}

export function useIndustryCollections() {
  return useQuery({
    queryKey: ["industry-collections"],
    queryFn: async () => {
      const { data } = await supabase
        .from("industry_collections")
        .select("*")
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
