import { useState, useEffect } from "react";
import { ArrowLeft, Play, Pause, Shuffle, Clock, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Track } from "@/data/musicData";
import TrackRow from "./TrackRow";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type DbTrack = Tables<"tracks">;

interface PlaylistDetailViewProps {
  playlistId: string;
  playlistName: string;
  playlistCover: string | null;
  playlistDescription: string | null;
  currentTrack: Track | null;
  isPlaying: boolean;
  onTrackSelect: (track: Track) => void;
  onBack: () => void;
  onPlayAll: () => void;
}

const PlaylistDetailView = ({
  playlistId,
  playlistName,
  playlistCover,
  playlistDescription,
  currentTrack,
  isPlaying,
  onTrackSelect,
  onBack,
  onPlayAll,
}: PlaylistDetailViewProps) => {
  const [tracks, setTracks] = useState<DbTrack[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadPlaylistTracks();
  }, [playlistId]);

  const loadPlaylistTracks = async () => {
    setIsLoading(true);
    
    const { data, error } = await supabase
      .from("playlist_tracks")
      .select("track_id, position, tracks(*)")
      .eq("playlist_id", playlistId)
      .order("position", { ascending: true });

    if (error) {
      console.error("Error loading playlist tracks:", error);
    } else if (data) {
      const trackList = data
        .map((item: any) => item.tracks)
        .filter(Boolean);
      setTracks(trackList);
    }

    setIsLoading(false);
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

  const handlePlayAll = () => {
    if (tracks.length > 0) {
      handleTrackSelect(tracks[0]);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto pb-32">
      {/* Header with gradient background */}
      <div 
        className="relative h-64 md:h-80 bg-gradient-to-b from-primary/30 to-background"
        style={{
          backgroundImage: playlistCover ? `linear-gradient(to bottom, rgba(0,0,0,0.3), var(--background)), url(${playlistCover})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background" />
        
        {/* Back Button */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-4 left-4 z-10 bg-background/20 backdrop-blur-sm"
          onClick={onBack}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>

        {/* Playlist Info */}
        <div className="absolute bottom-6 left-6 right-6 flex items-end gap-6">
          <div className="w-32 h-32 md:w-48 md:h-48 flex-shrink-0 rounded-lg shadow-2xl overflow-hidden bg-card">
            {playlistCover ? (
              <img
                src={playlistCover}
                alt={playlistName}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <span className="text-5xl">🎵</span>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Playlist</p>
            <h1 className="text-2xl md:text-4xl font-bold text-foreground truncate">{playlistName}</h1>
            {playlistDescription && (
              <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{playlistDescription}</p>
            )}
            <p className="text-sm text-muted-foreground mt-2">{tracks.length} songs</p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="px-6 py-4 flex items-center gap-4">
        <Button
          variant="player"
          size="lg"
          className="rounded-full h-14 w-14"
          onClick={handlePlayAll}
          disabled={tracks.length === 0}
        >
          <Play className="w-6 h-6 ml-1" />
        </Button>
        <Button variant="ghost" size="icon" className="text-muted-foreground">
          <Shuffle className="w-5 h-5" />
        </Button>
        <Button variant="ghost" size="icon" className="text-muted-foreground">
          <MoreHorizontal className="w-5 h-5" />
        </Button>
      </div>

      {/* Track List */}
      <div className="px-6">
        {/* Header */}
        <div className="hidden md:grid grid-cols-[auto_1fr_1fr_auto] gap-4 px-4 py-2 text-xs text-muted-foreground uppercase tracking-wider border-b border-border mb-2">
          <span className="w-8">#</span>
          <span>Title</span>
          <span>Album</span>
          <span className="w-12 flex justify-end">
            <Clock className="w-4 h-4" />
          </span>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Loading tracks...</div>
        ) : tracks.length > 0 ? (
          <div className="bg-card/30 rounded-xl overflow-hidden">
            {tracks.map((track, index) => (
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
          <div className="py-8 text-center text-muted-foreground">
            No tracks in this playlist yet.
          </div>
        )}
      </div>
    </div>
  );
};

export default PlaylistDetailView;
