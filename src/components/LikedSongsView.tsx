import { useState, useEffect } from "react";
import { ArrowLeft, Play, Pause, Shuffle, Clock, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Track } from "@/data/musicData";
import TrackRow from "./TrackRow";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getSignedAudioUrl, prefetchSignedUrls } from "@/lib/storage";
import type { Tables } from "@/integrations/supabase/types";

type DbTrack = Tables<"tracks">;

interface LikedSongsViewProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  onTrackSelect: (track: Track, playlistTracks?: Track[]) => void;
  onBack: () => void;
}

const LikedSongsView = ({
  currentTrack,
  isPlaying,
  onTrackSelect,
  onBack,
}: LikedSongsViewProps) => {
  const [tracks, setTracks] = useState<DbTrack[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    loadLikedSongs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]); // Only reload when user ID changes

  const loadLikedSongs = async () => {
    if (!user) return;
    
    setIsLoading(true);

    const { data, error } = await supabase
      .from("liked_songs")
      .select("track_id, created_at, tracks(*)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading liked songs:", error);
    } else if (data) {
      const trackList = data
        .map((item: any) => item.tracks)
        .filter(Boolean);
      setTracks(trackList);
      
      // Prefetch all cover image signed URLs in one batch call
      const coverUrls = trackList.map((t: DbTrack) => t.cover_url);
      prefetchSignedUrls(coverUrls);
    }

    setIsLoading(false);
  };

  const convertToTrack = (dbTrack: DbTrack, signedAudioUrl: string | undefined): Track => ({
    id: dbTrack.id,
    title: dbTrack.title,
    artist: dbTrack.artist,
    album: dbTrack.album || "",
    duration: dbTrack.duration || "",
    cover: dbTrack.cover_url || "/placeholder.svg",
    genre: dbTrack.genre || "",
    audioUrl: signedAudioUrl,
  });

  const handleTrackSelect = async (track: DbTrack) => {
    const signedAudioUrl = await getSignedAudioUrl(track.audio_url);

    // Convert all tracks for playlist context
    const allTracksPromises = tracks.map(async (t) => {
      const url = t.id === track.id ? signedAudioUrl : undefined;
      return convertToTrack(t, url);
    });
    const playlistTracks = await Promise.all(allTracksPromises);

    onTrackSelect(convertToTrack(track, signedAudioUrl), playlistTracks);
  };

  const handlePlayAll = async () => {
    if (tracks.length > 0) {
      handleTrackSelect(tracks[0]);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto pb-40 md:pb-32">
      {/* Header with gradient background */}
      <div className="relative h-64 md:h-80 bg-gradient-to-b from-primary/40 to-background">
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
          <div className="w-32 h-32 md:w-48 md:h-48 flex-shrink-0 rounded-lg shadow-2xl overflow-hidden bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
            <Heart className="w-16 h-16 md:w-24 md:h-24 text-primary-foreground fill-current" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Playlist</p>
            <h1 className="text-2xl md:text-4xl font-bold text-foreground">Liked Songs</h1>
            <p className="text-sm text-muted-foreground mt-2">Your favorite tracks</p>
            <p className="text-sm text-muted-foreground mt-1">{tracks.length} songs</p>
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
          <div className="py-8 text-center text-muted-foreground">Loading your liked songs...</div>
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
            <Heart className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
            <p>No liked songs yet.</p>
            <p className="text-sm mt-1">Like songs by clicking the heart icon in the player.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default LikedSongsView;