import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Music, Play, Pause, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import PlaylistDetailView from "@/components/PlaylistDetailView";
import QuickMixDialog from "@/components/QuickMixDialog";
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
  const { currentTrack, isPlaying, handleTrackSelect, currentPlaylistId } = usePlayer();
  
  const [allPlaylists, setAllPlaylists] = useState<DbPlaylist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPlaylist, setSelectedPlaylist] = useState<SelectedPlaylist | null>(null);
  const [loadingPlaylistId, setLoadingPlaylistId] = useState<string | null>(null);

  const category = searchParams.get("category"); // "mood" or "genre" or null

  useEffect(() => {
    loadPlaylists();
  }, [category]);

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

    let query = supabase
      .from("playlists")
      .select("*")
      .eq("is_system", true);

    // Filter by category if provided
    if (category === "mood" || category === "genre") {
      query = query.eq("category", category);
    }

    const { data } = await query.order("name", { ascending: true });

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
    // Set loading state immediately for instant feedback
    setLoadingPlaylistId(playlistId);
    
    try {
      // Fetch playlist cover first (same as usePlayPlaylist hook)
      const { data: playlistData } = await supabase
        .from("playlists")
        .select("cover_url")
        .eq("id", playlistId)
        .single();
      
      const playlistCover = playlistData?.cover_url || "/placeholder.svg";

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

          // Use playlist cover for all tracks (contextual branding)
          const playlistTracks: Track[] = (allTracksData || [])
            .map((item: any) => item.tracks)
            .filter(Boolean)
            .map((t: any) => ({
              id: t.id,
              title: t.title,
              artist: t.artist,
              album: t.album || "",
              duration: t.duration || "",
              cover: playlistCover,
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
              cover: playlistCover,
              genre: track.genre || "",
              audioUrl: signedAudioUrl,
            },
            playlistTracks,
            false, // isQuickMix
            playlistId
          );
        }
      }
    } finally {
      setLoadingPlaylistId(null);
    }
  };

  const handlePlayAllShuffled = async () => {
    if (allPlaylists.length === 0) return;

    const playlistIds = allPlaylists.map(p => p.id);

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

    // Fisher-Yates shuffle for proper random distribution
    const shuffledTracks = [...uniqueTracks];
    for (let i = shuffledTracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledTracks[i], shuffledTracks[j]] = [shuffledTracks[j], shuffledTracks[i]];
    }

    const firstTrack = shuffledTracks[0];
    const { data: trackData } = await supabase
      .from("tracks")
      .select("audio_url")
      .eq("id", firstTrack.id)
      .single();

    const signedAudioUrl = trackData?.audio_url
      ? await getSignedAudioUrl(trackData.audio_url)
      : undefined;

    // Record play history
    if (user) {
      for (const playlistId of playlistIds.slice(0, 5)) {
        await supabase.from("play_history").insert({
          user_id: user.id,
          playlist_id: playlistId,
        });
      }
    }

    handleTrackSelect({
      ...firstTrack,
      audioUrl: signedAudioUrl,
    }, shuffledTracks);
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
    <div className="flex-1 overflow-y-auto pb-40 md:pb-32">
      <div className="p-4 sm:p-6 space-y-4">
        {/* Header with Back Button */}
        <div className="flex items-start gap-3 mr-12 md:mr-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/")}
            className="shrink-0 mt-0.5"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">
            {category === "mood" 
              ? t("home.byMood") 
              : category === "genre" 
                ? t("home.byGenre") 
                : t("home.allPlaylists") || "All Playlists"}
          </h1>
        </div>

        {/* Quick Mix Button - under header, before playlists */}
        {allPlaylists.length > 0 && !isLoading && (
          <QuickMixDialog
            onTrackSelect={handleTrackSelect}
            category={category === "mood" || category === "genre" ? category : undefined}
            trigger={
              <Button variant="outline" className="w-full md:w-auto gap-2">
                <Shuffle className="w-4 h-4" />
                {t("quickMix.button")}
              </Button>
            }
          />
        )}

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
                  {(() => {
                    const isThisPlaylistPlaying = (currentPlaylistId === playlist.id && isPlaying) || loadingPlaylistId === playlist.id;
                    return (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePlayPlaylist(playlist.id);
                        }}
                        className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        {isThisPlaylistPlaying ? (
                          <Pause className="w-5 h-5 text-white fill-white" />
                        ) : (
                          <Play className="w-5 h-5 text-white fill-white" />
                        )}
                      </button>
                    );
                  })()}
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