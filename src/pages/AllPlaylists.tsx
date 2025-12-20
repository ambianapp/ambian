import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Music } from "lucide-react";
import { Button } from "@/components/ui/button";
import PlaylistCard from "@/components/PlaylistCard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePlayer } from "@/contexts/PlayerContext";
import { getSignedAudioUrl } from "@/lib/storage";
import type { Tables } from "@/integrations/supabase/types";
import type { Track } from "@/data/musicData";

type DbPlaylist = Tables<"playlists">;

const AllPlaylists = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { handleTrackSelect } = usePlayer();
  
  const [moodPlaylists, setMoodPlaylists] = useState<DbPlaylist[]>([]);
  const [genrePlaylists, setGenrePlaylists] = useState<DbPlaylist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"mood" | "genre">("mood");

  useEffect(() => {
    loadPlaylists();
  }, []);

  const loadPlaylists = async () => {
    setIsLoading(true);

    const [moodRes, genreRes] = await Promise.all([
      supabase
        .from("playlists")
        .select("*")
        .eq("is_system", true)
        .eq("category", "mood")
        .order("name", { ascending: true }),
      supabase
        .from("playlists")
        .select("*")
        .eq("is_system", true)
        .eq("category", "genre")
        .order("name", { ascending: true }),
    ]);

    setMoodPlaylists(moodRes.data || []);
    setGenrePlaylists(genreRes.data || []);
    setIsLoading(false);
  };

  const handlePlaylistClick = async (playlist: DbPlaylist) => {
    if (user) {
      await supabase.from("play_history").insert({
        user_id: user.id,
        playlist_id: playlist.id,
      });
    }
    navigate(`/?playlist=${playlist.id}`);
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

        handleTrackSelect(
          {
            id: track.id,
            title: track.title,
            artist: track.artist,
            album: track.album || "",
            duration: track.duration || "",
            cover: track.cover_url || "/placeholder.svg",
            genre: track.genre || "",
            audioUrl: signedAudioUrl,
          },
          playlistTracks
        );
      }
    }
  };

  const currentPlaylists = activeTab === "mood" ? moodPlaylists : genrePlaylists;

  return (
    <div className="min-h-screen bg-background pb-40 md:pb-32">
      {/* Header */}
      <div className="sticky top-0 z-40 glass border-b border-border">
        <div className="flex items-center gap-4 p-4 md:p-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/")}
            className="shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <Music className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-foreground">
                {t("home.allPlaylists") || "All Playlists"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {moodPlaylists.length + genrePlaylists.length} {t("library.playlists") || "playlists"}
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 px-4 pb-4 md:px-6">
          <Button
            variant={activeTab === "mood" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("mood")}
            className="rounded-full"
          >
            {t("home.byMood") || "By Mood"} ({moodPlaylists.length})
          </Button>
          <Button
            variant={activeTab === "genre" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("genre")}
            className="rounded-full"
          >
            {t("home.byGenre") || "By Genre"} ({genrePlaylists.length})
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 md:p-6">
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="aspect-square rounded-xl bg-secondary/50 animate-pulse"
              />
            ))}
          </div>
        ) : currentPlaylists.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {currentPlaylists.map((playlist) => (
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
                onClick={() => handlePlaylistClick(playlist)}
                onPlay={() => handlePlayPlaylist(playlist.id)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Music className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No playlists found</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AllPlaylists;
