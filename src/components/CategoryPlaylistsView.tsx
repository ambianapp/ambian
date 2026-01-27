import { useState, useEffect } from "react";
import { ArrowLeft, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import PlaylistCard from "./PlaylistCard";
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

interface CategoryPlaylistsViewProps {
  category: "mood" | "genre";
  onBack: () => void;
  onPlaylistSelect: (playlist: SelectedPlaylist) => void;
  onTrackSelect: (track: Track, playlistTracks?: Track[]) => void;
  currentTrack: Track | null;
  isPlaying: boolean;
}

const CategoryPlaylistsView = ({
  category,
  onBack,
  onPlaylistSelect,
  onTrackSelect,
  currentTrack,
  isPlaying,
}: CategoryPlaylistsViewProps) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [playlists, setPlaylists] = useState<DbPlaylist[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadPlaylists();
  }, [category]);

  const loadPlaylists = async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from("playlists")
      .select("*")
      .eq("is_system", true)
      .eq("category", category)
      .order("name", { ascending: true });

    setPlaylists(data || []);
    setIsLoading(false);
  };

  const handlePlaylistClick = async (playlist: SelectedPlaylist) => {
    if (user) {
      await supabase.from("play_history").insert({
        user_id: user.id,
        playlist_id: playlist.id,
      });
    }
    onPlaylistSelect(playlist);
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

  const handlePlaylistUpdate = async (id: string, data: { name: string; description: string; cover: string }) => {
    // Admin-only functionality - kept for compatibility
  };

  const title = category === "mood" ? t("home.byMood") : t("home.byGenre");

  return (
    <div className="flex-1 overflow-y-auto pb-40 md:pb-32">
      <div className="p-4 sm:p-6 space-y-4">
        {/* Header with Back Button */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">{title}</h1>
        </div>

        {/* Playlists Grid */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-square bg-secondary/50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            {playlists.map((playlist) => (
              <PlaylistCard
                key={playlist.id}
                playlist={{
                  id: playlist.id,
                  name: playlist.name,
                  description: playlist.description || "",
                  cover: playlist.cover_url || "/placeholder.svg",
                  trackCount: 0,
                  tracks: [],
                }}
                onClick={() => handlePlaylistClick({
                  id: playlist.id,
                  name: playlist.name,
                  cover: playlist.cover_url,
                  description: playlist.description,
                })}
                onPlay={() => handlePlayPlaylist(playlist.id)}
                onUpdate={handlePlaylistUpdate}
                compact
              />
            ))}
          </div>
        )}

        {!isLoading && playlists.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              {t("industry.noPlaylists")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CategoryPlaylistsView;
