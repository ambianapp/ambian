import { useState, useEffect } from "react";
import { ArrowLeft, Play, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { getSignedAudioUrl } from "@/lib/storage";
import type { Track } from "@/data/musicData";
import type { Tables } from "@/integrations/supabase/types";

type DbPlaylist = Tables<"playlists">;

interface SelectedPlaylist {
  id: string;
  name: string;
  cover: string | null;
  description: string | null;
}

interface ContinueListeningViewProps {
  onBack: () => void;
  onPlaylistSelect: (playlist: SelectedPlaylist) => void;
  onTrackSelect: (track: Track, playlistTracks?: Track[]) => void;
}

const ContinueListeningView = ({
  onBack,
  onPlaylistSelect,
  onTrackSelect,
}: ContinueListeningViewProps) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [playlists, setPlaylists] = useState<DbPlaylist[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadRecentlyPlayed();
  }, [user?.id]);

  const loadRecentlyPlayed = async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    
    // Get recently played playlist IDs
    const { data: historyData } = await supabase
      .from("play_history")
      .select("playlist_id, played_at")
      .eq("user_id", user.id)
      .order("played_at", { ascending: false })
      .limit(20);

    if (historyData && historyData.length > 0) {
      // Get unique playlist IDs (most recent first)
      const uniquePlaylistIds = [...new Set(historyData.map(h => h.playlist_id))];
      
      // Fetch playlist details
      const { data: playlistData } = await supabase
        .from("playlists")
        .select("*")
        .in("id", uniquePlaylistIds);

      if (playlistData) {
        // Sort by original order
        const sortedPlaylists = uniquePlaylistIds
          .map(id => playlistData.find(p => p.id === id))
          .filter((p): p is DbPlaylist => p !== undefined);
        setPlaylists(sortedPlaylists);
      }
    }
    
    setIsLoading(false);
  };

  const handlePlaylistClick = async (playlist: DbPlaylist) => {
    if (user) {
      await supabase.from("play_history").insert({
        user_id: user.id,
        playlist_id: playlist.id,
      });
    }
    onPlaylistSelect({
      id: playlist.id,
      name: playlist.name,
      cover: playlist.cover_url,
      description: playlist.description,
    });
  };

  const handlePlayPlaylist = async (playlistId: string) => {
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
            cover: t.cover_url || "/placeholder.svg",
            genre: t.genre || "",
          }));

        if (user) {
          await supabase.from("play_history").insert({
            user_id: user.id,
            playlist_id: playlistId,
          });
        }

        onTrackSelect({
          id: track.id,
          title: track.title,
          artist: track.artist,
          album: track.album || "",
          duration: track.duration || "",
          cover: track.cover_url || "/placeholder.svg",
          genre: track.genre || "",
          audioUrl: signedAudioUrl,
        }, playlistTracks);
      }
    }
  };

  return (
    <div className="flex-1 overflow-y-auto pb-40 md:pb-32">
      <div className="p-4 sm:p-6 space-y-4">
        {/* Header with Back Button */}
        <div className="flex items-center gap-3 mr-12 md:mr-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <History className="w-5 h-5 text-primary" />
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">{t("home.continue")}</h1>
        </div>

        {/* Playlists List */}
        {isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-3 bg-secondary/50 rounded-lg animate-pulse">
                <div className="w-12 h-12 bg-secondary rounded-lg" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-secondary rounded w-1/3" />
                  <div className="h-3 bg-secondary rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {playlists.map((playlist) => (
              <div
                key={playlist.id}
                className="flex items-center gap-4 p-3 rounded-lg hover:bg-secondary/50 transition-colors cursor-pointer group"
                onClick={() => handlePlaylistClick(playlist)}
              >
                <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-secondary shrink-0">
                  <img
                    src={playlist.cover_url || "/placeholder.svg"}
                    alt={playlist.name}
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePlayPlaylist(playlist.id);
                    }}
                    className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Play className="w-5 h-5 text-white fill-white" />
                  </button>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">{playlist.name}</p>
                  {playlist.description && (
                    <p className="text-sm text-muted-foreground truncate">{playlist.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && playlists.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              {t("home.noRecentPlaylists")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ContinueListeningView;
