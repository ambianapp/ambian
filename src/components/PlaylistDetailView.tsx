import { useState, useEffect } from "react";
import { ArrowLeft, Play, Pause, Shuffle, Clock, MoreHorizontal, Heart, ListMusic, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Track } from "@/data/musicData";
import TrackRow from "./TrackRow";
import SignedImage from "@/components/SignedImage";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { getSignedAudioUrl } from "@/lib/storage";
import type { Tables } from "@/integrations/supabase/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  const { user } = useAuth();
  const { t } = useLanguage();

  useEffect(() => {
    loadPlaylistTracks();
  }, [playlistId]);

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
    } else {
      await supabase
        .from("liked_playlists")
        .insert({ user_id: user.id, playlist_id: playlistId });
      setIsLiked(true);
    }
  };

  const loadPlaylistTracks = async () => {
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
  };

  const convertToTrack = (dbTrack: DbTrack, signedAudioUrl: string | undefined): Track => ({
    id: dbTrack.id,
    title: dbTrack.title,
    artist: dbTrack.artist,
    album: dbTrack.album || "",
    duration: dbTrack.duration || "",
    cover: dbTrack.cover_url || playlistCover || "/placeholder.svg",
    genre: dbTrack.genre || "",
    audioUrl: signedAudioUrl,
  });

  const handleTrackSelect = async (track: DbTrack) => {
    // Get signed URL for audio since bucket is private
    const signedAudioUrl = await getSignedAudioUrl(track.audio_url);
    
    // Convert all tracks to Track format for playlist context
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

  const handleShufflePlay = async () => {
    if (tracks.length === 0) return;
    
    // Shuffle the tracks array
    const shuffledTracks = [...tracks].sort(() => Math.random() - 0.5);
    const firstTrack = shuffledTracks[0];
    
    // Get signed URL for the first track
    const signedAudioUrl = await getSignedAudioUrl(firstTrack.audio_url);
    
    // Convert all shuffled tracks to Track format
    const playlistTracks = shuffledTracks.map((t) => 
      convertToTrack(t, t.id === firstTrack.id ? signedAudioUrl : undefined)
    );
    
    toast.success(t("common.shuffle") || "Shuffle enabled");
    onTrackSelect(convertToTrack(firstTrack, signedAudioUrl), playlistTracks);
  };

  const handleAddToQueue = () => {
    toast.info("Add to queue coming soon");
  };

  const handleDeletePlaylist = async () => {
    if (!playlistId || isSystemPlaylist) return;
    
    try {
      const { error } = await supabase
        .from('playlists')
        .delete()
        .eq('id', playlistId)
        .eq('user_id', user?.id);
      
      if (error) throw error;
      
      toast.success("Playlist deleted");
      onBack();
    } catch (error) {
      console.error('Error deleting playlist:', error);
      toast.error("Failed to delete playlist");
    }
  };

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
        <Button 
          variant="ghost" 
          size="icon" 
          className="text-muted-foreground hover:text-foreground"
          onClick={handleShufflePlay}
          disabled={tracks.length === 0}
        >
          <Shuffle className="w-5 h-5" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
              <MoreHorizontal className="w-5 h-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuItem onClick={handleAddToQueue}>
              <ListMusic className="w-4 h-4 mr-2" />
              Add to queue
            </DropdownMenuItem>
            {isUserPlaylist && (
              <DropdownMenuItem onClick={handleDeletePlaylist} className="text-destructive focus:text-destructive">
                <Trash2 className="w-4 h-4 mr-2" />
                Delete playlist
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
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
                  cover: track.cover_url || playlistCover || "/placeholder.svg",
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
