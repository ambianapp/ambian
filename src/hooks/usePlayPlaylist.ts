import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getSignedAudioUrl } from "@/lib/storage";
import type { Track } from "@/data/musicData";

/**
 * Hook that provides a function to play a playlist by its ID.
 * Fetches the first track, loads all playlist tracks, records play history,
 * and calls the provided onTrackSelect callback.
 */
export function usePlayPlaylist(
  onTrackSelect: (track: Track, playlistTracks?: Track[]) => void
) {
  const { user } = useAuth();

  const playPlaylist = async (playlistId: string) => {
    // Fetch playlist cover first
    const { data: playlistData } = await supabase
      .from("playlists")
      .select("cover_url")
      .eq("id", playlistId)
      .single();
    
    const playlistCover = playlistData?.cover_url || "/placeholder.svg";

    // Fetch first track of playlist
    const { data } = await supabase
      .from("playlist_tracks")
      .select("track_id, tracks(*)")
      .eq("playlist_id", playlistId)
      .order("position", { ascending: true })
      .limit(1);

    if (data && data.length > 0) {
      const track = (data[0] as any).tracks;
      if (track) {
        const signedAudioUrl = await getSignedAudioUrl(track.audio_url);

        // Fetch all tracks for playlist context
        const { data: allTracksData } = await supabase
          .from("playlist_tracks")
          .select("tracks(*)")
          .eq("playlist_id", playlistId)
          .order("position", { ascending: true });

        const playlistTracks: Track[] = (allTracksData || [])
          .map((item: any) => item.tracks)
          .filter(Boolean)
          .map((t: any) => ({
            id: t.id,
            title: t.title,
            artist: t.artist,
            album: t.album || "",
            duration: t.duration || "",
            cover: t.cover_url || playlistCover,
            genre: t.genre || "",
          }));

        // Record play history
        if (user) {
          await supabase.from("play_history").insert({
            user_id: user.id,
            playlist_id: playlistId,
          });
        }

        onTrackSelect(
          {
            id: track.id,
            title: track.title,
            artist: track.artist,
            album: track.album || "",
            duration: track.duration || "",
            cover: track.cover_url || playlistCover,
            genre: track.genre || "",
            audioUrl: signedAudioUrl,
          },
          playlistTracks
        );
      }
    }
  };

  return { playPlaylist };
}
