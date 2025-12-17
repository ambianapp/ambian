import { useState, useEffect } from "react";
import { genres } from "@/data/musicData";
import GenreCard from "./GenreCard";
import PlaylistCard from "./PlaylistCard";
import TrackRow from "./TrackRow";
import { Track } from "@/data/musicData";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type DbPlaylist = Tables<"playlists">;
type DbTrack = Tables<"tracks">;

interface HomeViewProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  onTrackSelect: (track: Track) => void;
}

const HomeView = ({ currentTrack, isPlaying, onTrackSelect }: HomeViewProps) => {
  const [playlists, setPlaylists] = useState<DbPlaylist[]>([]);
  const [recentTracks, setRecentTracks] = useState<DbTrack[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    
    // Load system playlists (admin-created)
    const { data: playlistData, error: playlistError } = await supabase
      .from("playlists")
      .select("*")
      .eq("is_system", true)
      .order("created_at", { ascending: false });

    if (playlistError) {
      console.error("Error loading playlists:", playlistError);
    } else {
      setPlaylists(playlistData || []);
    }

    // Load recent tracks
    const { data: trackData, error: trackError } = await supabase
      .from("tracks")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10);

    if (trackError) {
      console.error("Error loading tracks:", trackError);
    } else {
      setRecentTracks(trackData || []);
    }

    setIsLoading(false);
  };

  const handlePlaylistUpdate = async (id: string, data: { name: string; description: string; cover: string }) => {
    const { error } = await supabase
      .from("playlists")
      .update({ name: data.name, description: data.description, cover_url: data.cover })
      .eq("id", id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Playlist updated" });
      loadData();
    }
  };

  const handleTrackSelect = (track: DbTrack) => {
    // Convert DB track to Track type for player
    onTrackSelect({
      id: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album || "",
      duration: track.duration || "",
      cover: track.cover_url || "/placeholder.svg",
      genre: track.genre || "",
      audioUrl: track.audio_url || undefined,
    });
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="flex-1 overflow-y-auto pb-32">
      <div className="p-6 md:p-8 space-y-8">
        {/* Header */}
        <div className="animate-fade-in">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground">{getGreeting()}</h1>
          <p className="text-muted-foreground mt-2">Ready to set the perfect ambiance?</p>
        </div>

        {/* Quick Picks - Show first 6 playlists */}
        {playlists.length > 0 && (
          <section className="animate-fade-in" style={{ animationDelay: "0.1s" }}>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {playlists.slice(0, 6).map((playlist) => (
                <button
                  key={playlist.id}
                  className="flex items-center gap-4 bg-card/80 hover:bg-card rounded-lg overflow-hidden transition-colors group"
                  onClick={() => recentTracks[0] && handleTrackSelect(recentTracks[0])}
                >
                  {playlist.cover_url ? (
                    <img
                      src={playlist.cover_url}
                      alt={playlist.name}
                      className="w-16 h-16 object-cover"
                    />
                  ) : (
                    <div className="w-16 h-16 bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                      <span className="text-2xl">🎵</span>
                    </div>
                  )}
                  <span className="font-semibold text-sm text-foreground truncate pr-4">
                    {playlist.name}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Browse by Genre */}
        <section className="animate-fade-in" style={{ animationDelay: "0.2s" }}>
          <h2 className="text-xl font-bold text-foreground mb-4">Browse by Genre</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {genres.map((genre) => (
              <GenreCard key={genre.id} genre={genre} onClick={() => {}} />
            ))}
          </div>
        </section>

        {/* Featured Playlists */}
        {playlists.length > 0 && (
          <section className="animate-fade-in" style={{ animationDelay: "0.3s" }}>
            <h2 className="text-xl font-bold text-foreground mb-4">Made for Business</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
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
                  onClick={() => recentTracks[0] && handleTrackSelect(recentTracks[0])}
                  onUpdate={handlePlaylistUpdate}
                />
              ))}
            </div>
          </section>
        )}

        {/* Recently Added Tracks */}
        <section className="animate-fade-in" style={{ animationDelay: "0.4s" }}>
          <h2 className="text-xl font-bold text-foreground mb-4">Recently Added</h2>
          {recentTracks.length > 0 ? (
            <div className="bg-card/30 rounded-xl overflow-hidden">
              {recentTracks.slice(0, 5).map((track, index) => (
                <TrackRow
                  key={track.id}
                  track={{
                    id: track.id,
                    title: track.title,
                    artist: track.artist,
                    album: track.album || "",
                    duration: track.duration || "",
                    cover: track.cover_url || "/placeholder.svg",
                    genre: track.genre || "",
                  }}
                  index={index + 1}
                  isPlaying={isPlaying}
                  isCurrentTrack={currentTrack?.id === track.id}
                  onPlay={() => handleTrackSelect(track)}
                />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No tracks yet. Add some in the admin panel.</p>
          )}
        </section>
      </div>
    </div>
  );
};

export default HomeView;
