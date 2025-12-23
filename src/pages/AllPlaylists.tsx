import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Music, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import PlaylistDetailView from "@/components/PlaylistDetailView";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePlayer } from "@/contexts/PlayerContext";
import { getSignedAudioUrl } from "@/lib/storage";
import type { Tables } from "@/integrations/supabase/types";
import type { Track } from "@/data/musicData";

type DbPlaylist = Tables<"playlists">;

interface SelectedPlaylist {
  id: string;
  name: string;
  cover: string | null;
  description: string | null;
}

const AllPlaylists = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentTrack, isPlaying, handleTrackSelect } = usePlayer();
  
  const [allPlaylists, setAllPlaylists] = useState<DbPlaylist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPlaylist, setSelectedPlaylist] = useState<SelectedPlaylist | null>(null);

  useEffect(() => {
    loadPlaylists();
  }, []);

  // Handle playlist query param on load
  useEffect(() => {
    const playlistId = searchParams.get("playlist");
    if (playlistId && !selectedPlaylist && allPlaylists.length > 0) {
      const playlist = allPlaylists.find(p => p.id === playlistId);
      if (playlist) {
        setSelectedPlaylist({
          id: playlist.id,
          name: playlist.name,
          cover: playlist.cover_url,
          description: playlist.description,
        });
      }
    }
  }, [searchParams, allPlaylists, selectedPlaylist]);

  const loadPlaylists = async () => {
    setIsLoading(true);

    const { data } = await supabase
      .from("playlists")
      .select("*")
      .eq("is_system", true)
      .order("name", { ascending: true });

    setAllPlaylists(data || []);
    setIsLoading(false);
  };

  const handlePlaylistClick = async (playlist: DbPlaylist) => {
    if (user) {
      supabase.from("play_history").insert({
        user_id: user.id,
        playlist_id: playlist.id,
      });
    }
    setSelectedPlaylist({
      id: playlist.id,
      name: playlist.name,
      cover: playlist.cover_url,
      description: playlist.description,
    });
    setSearchParams({ playlist: playlist.id });
  };

  const handleBackFromPlaylist = () => {
    setSelectedPlaylist(null);
    setSearchParams({});
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

  // Show playlist detail view when a playlist is selected
  if (selectedPlaylist) {
    return (
      <div className="min-h-screen bg-background">
        <PlaylistDetailView
          playlistId={selectedPlaylist.id}
          playlistName={selectedPlaylist.name}
          playlistCover={selectedPlaylist.cover}
          playlistDescription={selectedPlaylist.description}
          currentTrack={currentTrack}
          isPlaying={isPlaying}
          onTrackSelect={handleTrackSelect}
          onBack={handleBackFromPlaylist}
          onPlayAll={() => {}}
        />
      </div>
    );
  }

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
                {allPlaylists.length} {t("library.playlists") || "playlists"}
              </p>
            </div>
          </div>
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
        ) : allPlaylists.length > 0 ? (
          <div className="flex flex-col gap-1">
            {allPlaylists.map((playlist) => (
              <div
                key={playlist.id}
                onClick={() => handlePlaylistClick(playlist)}
                className="flex items-center gap-4 p-3 rounded-lg hover:bg-secondary/50 cursor-pointer transition-colors group"
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
                  <h3 className="font-medium text-foreground truncate">{playlist.name}</h3>
                  {playlist.description && (
                    <p className="text-sm text-muted-foreground truncate">{playlist.description}</p>
                  )}
                </div>
              </div>
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