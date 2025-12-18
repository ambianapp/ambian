import { useState, useEffect } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import PlaylistCard from "./PlaylistCard";
import TrackRow from "./TrackRow";
import { Track } from "@/data/musicData";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type DbPlaylist = Tables<"playlists">;
type DbTrack = Tables<"tracks">;

interface SelectedPlaylist {
  id: string;
  name: string;
  cover: string | null;
  description: string | null;
}

interface HomeViewProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  onTrackSelect: (track: Track) => void;
  onPlaylistSelect: (playlist: SelectedPlaylist) => void;
}

const HomeView = ({ currentTrack, isPlaying, onTrackSelect, onPlaylistSelect }: HomeViewProps) => {
  const [moodPlaylists, setMoodPlaylists] = useState<DbPlaylist[]>([]);
  const [genrePlaylists, setGenrePlaylists] = useState<DbPlaylist[]>([]);
  const [recentTracks, setRecentTracks] = useState<DbTrack[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAllMoods, setShowAllMoods] = useState(false);
  const [showAllGenres, setShowAllGenres] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    
    // Load mood playlists
    const { data: moodData } = await supabase
      .from("playlists")
      .select("*")
      .eq("is_system", true)
      .eq("category", "mood")
      .order("created_at", { ascending: false });

    setMoodPlaylists(moodData || []);

    // Load genre playlists
    const { data: genreData } = await supabase
      .from("playlists")
      .select("*")
      .eq("is_system", true)
      .eq("category", "genre")
      .order("created_at", { ascending: false });

    setGenrePlaylists(genreData || []);

    // Load recent tracks
    const { data: trackData } = await supabase
      .from("tracks")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10);

    setRecentTracks(trackData || []);
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

  const renderPlaylistSection = (
    title: string,
    playlists: DbPlaylist[],
    showAll: boolean,
    onToggle: () => void
  ) => {
    const displayedPlaylists = showAll ? playlists : playlists.slice(0, 4);

    return (
      <section className="animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-foreground">{title}</h2>
          {playlists.length > 4 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggle}
              className="text-muted-foreground hover:text-foreground"
            >
              {showAll ? "Show less" : `More ${title.toLowerCase()}`}
              <ChevronRight className={`w-4 h-4 ml-1 transition-transform ${showAll ? "rotate-90" : ""}`} />
            </Button>
          )}
        </div>
        {playlists.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {displayedPlaylists.map((playlist) => (
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
                onClick={() => onPlaylistSelect({
                  id: playlist.id,
                  name: playlist.name,
                  cover: playlist.cover_url,
                  description: playlist.description,
                })}
                onUpdate={handlePlaylistUpdate}
              />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">No playlists yet. Create one in the admin panel.</p>
        )}
      </section>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto pb-40 md:pb-32">
      <div className="p-6 md:p-8 space-y-8">
        {/* Header */}
        <div className="animate-fade-in">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground">{getGreeting()}</h1>
          <p className="text-muted-foreground mt-2">Ready to set the perfect ambiance?</p>
        </div>

        {/* Playlists by Mood */}
        {renderPlaylistSection(
          "Playlists by Mood",
          moodPlaylists,
          showAllMoods,
          () => setShowAllMoods(!showAllMoods)
        )}

        {/* Playlists by Genre */}
        {renderPlaylistSection(
          "Playlists by Genre",
          genrePlaylists,
          showAllGenres,
          () => setShowAllGenres(!showAllGenres)
        )}

        {/* Recently Added Tracks */}
        <section className="animate-fade-in">
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