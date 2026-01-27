import { useState, useEffect } from "react";
import { ArrowLeft, Play, Shuffle } from "lucide-react";
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

  const handlePlayAllShuffled = async () => {
    if (playlists.length === 0) return;

    const playlistIds = playlists.map(p => p.id);

    const { data: allTracksData } = await supabase
      .from("playlist_tracks")
      .select("tracks(*), playlist_id")
      .in("playlist_id", playlistIds)
      .limit(10000);

    if (!allTracksData || allTracksData.length === 0) return;

    const allTracks: Track[] = allTracksData
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

    // Remove duplicates
    const uniqueTracks = allTracks.filter((track, index, self) =>
      index === self.findIndex(t => t.id === track.id)
    );

    if (uniqueTracks.length === 0) return;

    // Shuffle
    const shuffledTracks = [...uniqueTracks].sort(() => Math.random() - 0.5);

    const firstTrack = shuffledTracks[0];
    const { data: trackData } = await supabase
      .from("tracks")
      .select("audio_url")
      .eq("id", firstTrack.id)
      .single();

    const signedAudioUrl = trackData?.audio_url
      ? await getSignedAudioUrl(trackData.audio_url)
      : undefined;

    // Record play history for all playlists
    if (user) {
      for (const playlistId of playlistIds) {
        await supabase.from("play_history").insert({
          user_id: user.id,
          playlist_id: playlistId,
        });
      }
    }

    onTrackSelect({
      ...firstTrack,
      audioUrl: signedAudioUrl,
    }, shuffledTracks);
  };

  const title = category === "mood" ? t("home.byMood") : t("home.byGenre");

  return (
    <div className="flex-1 overflow-y-auto pb-40 md:pb-32">
      <div className="p-4 sm:p-6 space-y-4">
        {/* Header with Back Button */}
        <div className="flex items-center justify-between gap-3">
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
          {playlists.length > 0 && !isLoading && (
            <Button
              onClick={handlePlayAllShuffled}
              size="sm"
              className="gap-2 shrink-0"
            >
              <Shuffle className="w-4 h-4" />
              <span className="hidden sm:inline">{t("industry.playAllShuffled")}</span>
            </Button>
          )}
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
              {t("industry.noPlaylists")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CategoryPlaylistsView;
