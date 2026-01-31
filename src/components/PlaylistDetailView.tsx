import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Play, Pause, Clock, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Track } from "@/data/musicData";
import TrackRow from "./TrackRow";
import SignedImage from "@/components/SignedImage";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePlayer } from "@/contexts/PlayerContext";
import { cn } from "@/lib/utils";
import { getSignedAudioUrl } from "@/lib/storage";
import type { Tables } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";

type DbTrack = Tables<"tracks">;

interface PlaylistDetailViewProps {
  playlistId: string;
  playlistName: string;
  playlistCover: string | null;
  playlistDescription: string | null;
  currentTrack: Track | null;
  isPlaying: boolean;
  onTrackSelect: (track: Track, playlistTracks?: Track[]) => void;
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
  const [isLiked, setIsLiked] = useState(false);
  const [isSystemPlaylist, setIsSystemPlaylist] = useState(false);
  const [playlistOwnerId, setPlaylistOwnerId] = useState<string | null>(null);
  const [resolvedPlaylistCover, setResolvedPlaylistCover] = useState<string | null>(playlistCover);
  const { user, isAdmin } = useAuth();
  const { handleTrackSelect: playerHandleTrackSelect } = usePlayer();
  const { t } = useLanguage();

  const loadPlaylistTracks = useCallback(async () => {
    setIsLoading(true);
    
    // Check if this is a system playlist and get owner
    const { data: playlistData } = await supabase
      .from("playlists")
      .select("is_system, user_id")
      .eq("id", playlistId)
      .maybeSingle();
    
    const isSystem = playlistData?.is_system ?? false;
    setIsSystemPlaylist(isSystem);
    setPlaylistOwnerId(playlistData?.user_id ?? null);
    
    const { data, error } = await supabase
      .from("playlist_tracks")
      .select("track_id, position, tracks(*)")
      .eq("playlist_id", playlistId)
      .order("position", { ascending: true });

    if (error) {
      console.error("Error loading playlist tracks:", error);
    } else if (data) {
      let trackList = data
        .map((item: any) => item.tracks)
        .filter(Boolean);
      
      // Sort alphabetically by title for system playlists (genre/mood)
      if (isSystem) {
        trackList = trackList.sort((a: DbTrack, b: DbTrack) => 
          a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' })
        );
      }
      
      setTracks(trackList);
    }

    setIsLoading(false);
  }, [playlistId]);

  useEffect(() => {
    loadPlaylistTracks();
  }, [loadPlaylistTracks]);

  // Realtime subscription for playlist tracks - songs appear/disappear live
  useEffect(() => {
    const channel = supabase
      .channel(`playlist-tracks-${playlistId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'playlist_tracks',
          filter: `playlist_id=eq.${playlistId}`,
        },
        (payload) => {
          console.log('Playlist track change detected:', payload.eventType);
          // Reload tracks when songs are added or removed
          loadPlaylistTracks();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [playlistId, loadPlaylistTracks]);

  useEffect(() => {
    checkIfLiked();
  }, [playlistId, user?.id]);

  useEffect(() => {
    let cancelled = false;

    async function resolveCover() {
      if (!playlistCover) {
        setResolvedPlaylistCover(null);
        return;
      }

      if (!playlistCover.includes("/storage/v1/object/public/audio/")) {
        setResolvedPlaylistCover(playlistCover);
        return;
      }

      const signed = await getSignedAudioUrl(playlistCover);
      if (cancelled) return;
      setResolvedPlaylistCover(signed || playlistCover);
    }

    resolveCover();

    return () => {
      cancelled = true;
    };
  }, [playlistCover]);

  const checkIfLiked = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from("liked_playlists")
      .select("id")
      .eq("user_id", user.id)
      .eq("playlist_id", playlistId)
      .maybeSingle();
    
    setIsLiked(!!data);
  };

  const toggleLike = async () => {
    if (!user) return;

    if (isLiked) {
      await supabase
        .from("liked_playlists")
        .delete()
        .eq("user_id", user.id)
        .eq("playlist_id", playlistId);
      setIsLiked(false);
      // Dispatch custom event so Sidebar can update immediately
      window.dispatchEvent(new CustomEvent("liked-playlists-changed"));
    } else {
      await supabase
        .from("liked_playlists")
        .insert({ user_id: user.id, playlist_id: playlistId });
      setIsLiked(true);
      // Dispatch custom event so Sidebar can update immediately
      window.dispatchEvent(new CustomEvent("liked-playlists-changed"));
    }
  };

  const convertToTrack = (dbTrack: DbTrack, signedAudioUrl: string | undefined): Track => ({
    id: dbTrack.id,
    title: dbTrack.title,
    artist: dbTrack.artist,
    album: dbTrack.album || "",
    duration: dbTrack.duration || "",
    cover: dbTrack.cover_url || resolvedPlaylistCover || "/placeholder.svg",
    genre: dbTrack.genre || "",
    audioUrl: signedAudioUrl,
  });

  const handleTrackSelectInternal = async (track: DbTrack) => {
    // Get signed URL for audio since bucket is private
    const signedAudioUrl = await getSignedAudioUrl(track.audio_url);
    
    // Convert all tracks to Track format for playlist context
    const allTracksPromises = tracks.map(async (t) => {
      const url = t.id === track.id ? signedAudioUrl : undefined;
      return convertToTrack(t, url);
    });
    const playlistTracks = await Promise.all(allTracksPromises);
    
    // Use the player context directly with playlistId
    playerHandleTrackSelect(convertToTrack(track, signedAudioUrl), playlistTracks, false, playlistId);
    
    // Also call the parent callback for any other handling
    onTrackSelect(convertToTrack(track, signedAudioUrl), playlistTracks);
  };

  const handlePlayAll = async () => {
    if (tracks.length > 0) {
      handleTrackSelectInternal(tracks[0]);
    }
  };

  const handleDeleteTrack = useCallback(async (track: DbTrack, position: number) => {
    // First, get the playlist name for logging
    const { data: playlistData } = await supabase
      .from("playlists")
      .select("name")
      .eq("id", playlistId)
      .maybeSingle();

    // Log to deleted_playlist_tracks before deleting
    await supabase
      .from("deleted_playlist_tracks")
      .insert({
        playlist_id: playlistId,
        track_id: track.id,
        original_position: position,
        deleted_by: user?.id,
        playlist_name: playlistData?.name || playlistName,
        track_title: track.title,
        track_artist: track.artist,
      });

    // Delete from playlist_tracks (not the track itself)
    const { error } = await supabase
      .from("playlist_tracks")
      .delete()
      .eq("playlist_id", playlistId)
      .eq("track_id", track.id);

    if (error) {
      toast.error("Failed to remove track from playlist");
      console.error("Error removing track:", error);
    } else {
      toast.success(`Removed "${track.title}" from playlist`);
      // Update local state
      setTracks((prev) => prev.filter((t) => t.id !== track.id));
    }
  }, [playlistId, playlistName, user?.id]);

  const isUserPlaylist = !isSystemPlaylist && playlistOwnerId === user?.id;

  return (
    <div className="flex-1 overflow-y-auto pb-40 md:pb-32">
      {/* Header with gradient background */}
      <div 
        className="relative h-64 md:h-80 bg-gradient-to-b from-primary/30 to-background"
        style={{
          backgroundImage: resolvedPlaylistCover
            ? `linear-gradient(to bottom, rgba(0,0,0,0.3), var(--background)), url(${resolvedPlaylistCover})`
            : undefined,
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
            {resolvedPlaylistCover ? (
              <SignedImage
                src={resolvedPlaylistCover}
                alt={`${playlistName} playlist cover`}
                className="w-full h-full object-cover"
                fallbackSrc="/placeholder.svg"
                loading="eager"
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
        <Button 
          variant="ghost" 
          size="icon" 
          className={cn("transition-colors", isLiked ? "text-primary" : "text-muted-foreground hover:text-foreground")}
          onClick={toggleLike}
        >
          <Heart className={cn("w-6 h-6", isLiked && "fill-current")} />
        </Button>
      </div>

      {/* Track List */}
      <div className="px-6">
        {/* Header */}
        <div className="hidden md:grid grid-cols-[auto_1fr_auto] gap-4 px-4 py-2 text-xs text-muted-foreground uppercase tracking-wider border-b border-border mb-2">
          <span className="w-8">#</span>
          <span>Title</span>
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
                  cover: track.cover_url || resolvedPlaylistCover || "/placeholder.svg",
                  genre: track.genre || "",
                }}
                index={index + 1}
                isPlaying={isPlaying}
                isCurrentTrack={currentTrack?.id === track.id}
                onPlay={() => handleTrackSelectInternal(track)}
                showDelete={isAdmin}
                onDelete={() => handleDeleteTrack(track, index + 1)}
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
