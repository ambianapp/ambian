import { useState, useEffect } from "react";
import { Play, Pause, MoreHorizontal, Heart, ListPlus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Track } from "@/data/musicData";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface TrackRowProps {
  track: Track;
  index: number;
  isPlaying: boolean;
  isCurrentTrack: boolean;
  onPlay: () => void;
}

interface UserPlaylist {
  id: string;
  name: string;
}

const TrackRow = ({ track, index, isPlaying, isCurrentTrack, onPlay }: TrackRowProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [userPlaylists, setUserPlaylists] = useState<UserPlaylist[]>([]);
  const [isLiked, setIsLiked] = useState(false);

  const isUuid = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

  useEffect(() => {
    const checkIfLiked = async () => {
      if (!user || !isUuid(track.id)) return;
      
      const { data } = await supabase
        .from("liked_songs")
        .select("id")
        .eq("user_id", user.id)
        .eq("track_id", track.id)
        .maybeSingle();
      
      setIsLiked(!!data);
    };
    
    checkIfLiked();
  }, [user, track.id]);

  const fetchUserPlaylists = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from("playlists")
      .select("id, name")
      .eq("user_id", user.id)
      .eq("is_system", false)
      .order("created_at", { ascending: false });
    
    setUserPlaylists(data || []);
  };

  const handleLikeToggle = async () => {
    if (!user) {
      toast({ title: "Sign in required", variant: "destructive" });
      return;
    }
    
    if (!isUuid(track.id)) {
      toast({ title: "Cannot like this track", variant: "destructive" });
      return;
    }

    if (isLiked) {
      await supabase
        .from("liked_songs")
        .delete()
        .eq("user_id", user.id)
        .eq("track_id", track.id);
      setIsLiked(false);
      toast({ title: "Removed from Liked Songs" });
    } else {
      await supabase
        .from("liked_songs")
        .insert({ user_id: user.id, track_id: track.id });
      setIsLiked(true);
      toast({ title: "Added to Liked Songs" });
    }
  };

  const handleAddToPlaylist = async (playlistId: string, playlistName: string) => {
    if (!user || !isUuid(track.id)) {
      toast({ title: "Cannot add this track", variant: "destructive" });
      return;
    }

    // Check if track already in playlist
    const { data: existing } = await supabase
      .from("playlist_tracks")
      .select("id")
      .eq("playlist_id", playlistId)
      .eq("track_id", track.id)
      .maybeSingle();

    if (existing) {
      toast({ title: "Track already in playlist" });
      return;
    }

    // Get max position
    const { data: maxPos } = await supabase
      .from("playlist_tracks")
      .select("position")
      .eq("playlist_id", playlistId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();

    const newPosition = (maxPos?.position ?? -1) + 1;

    const { error } = await supabase
      .from("playlist_tracks")
      .insert({
        playlist_id: playlistId,
        track_id: track.id,
        position: newPosition,
      });

    if (error) {
      toast({ title: "Error adding track", variant: "destructive" });
    } else {
      toast({ title: `Added to ${playlistName}` });
    }
  };

  return (
    <div
      className={cn(
        "group grid grid-cols-[auto_1fr_auto] md:grid-cols-[auto_1fr_auto_auto] gap-2 md:gap-4 items-center px-3 md:px-4 py-3 rounded-lg transition-colors cursor-pointer",
        isCurrentTrack ? "bg-secondary" : "hover:bg-secondary/50"
      )}
      onClick={onPlay}
    >
      <div className="w-6 md:w-8 flex items-center justify-center">
        <span className={cn("text-sm text-muted-foreground group-hover:hidden", isCurrentTrack && "text-primary")}>
          {index}
        </span>
        <Button
          variant="ghost"
          size="iconSm"
          className="hidden group-hover:flex h-6 w-6 md:h-8 md:w-8"
          onClick={(e) => {
            e.stopPropagation();
            onPlay();
          }}
        >
          {isPlaying && isCurrentTrack ? (
            <Pause className="w-3 h-3 md:w-4 md:h-4" />
          ) : (
            <Play className="w-3 h-3 md:w-4 md:h-4" />
          )}
        </Button>
      </div>

      <div className="flex items-center gap-2 md:gap-4 min-w-0 overflow-hidden">
        <img
          src={track.cover}
          alt={track.title}
          className="w-9 h-9 md:w-10 md:h-10 rounded object-cover flex-shrink-0"
        />
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className={cn("font-medium truncate text-sm md:text-base", isCurrentTrack ? "text-primary" : "text-foreground")}>
            {track.title}
          </p>
          <p className="text-xs md:text-sm text-muted-foreground truncate">{track.artist}</p>
        </div>
      </div>

      {/* Desktop like button */}
      <div className="hidden md:flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button 
          variant="ghost" 
          size="iconSm" 
          className={cn("text-muted-foreground hover:text-foreground", isLiked && "text-primary")}
          onClick={(e) => {
            e.stopPropagation();
            handleLikeToggle();
          }}
        >
          <Heart className={cn("w-4 h-4", isLiked && "fill-current")} />
        </Button>
      </div>

      <div className="flex items-center gap-1 md:gap-4">
        <span className="text-xs md:text-sm text-muted-foreground w-10 md:w-12 text-right">{track.duration}</span>
        
        <DropdownMenu onOpenChange={(open) => open && fetchUserPlaylists()}>
          <DropdownMenuTrigger asChild>
            {/* Mobile: always visible, Desktop: show on hover */}
            <Button 
              variant="ghost" 
              size="iconSm" 
              className={cn(
                "text-muted-foreground hover:text-foreground",
                "md:opacity-0 md:group-hover:opacity-100"
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 bg-card border-border z-50">
            <DropdownMenuItem onClick={handleLikeToggle}>
              <Heart className={cn("w-4 h-4 mr-2", isLiked && "fill-current text-primary")} />
              {isLiked ? "Remove from Liked" : "Add to Liked Songs"}
            </DropdownMenuItem>
            
            <DropdownMenuSeparator />
            
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <ListPlus className="w-4 h-4 mr-2" />
                Add to Playlist
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="bg-card border-border z-50">
                {userPlaylists.length > 0 ? (
                  userPlaylists.map((playlist) => (
                    <DropdownMenuItem 
                      key={playlist.id}
                      onClick={() => handleAddToPlaylist(playlist.id, playlist.name)}
                    >
                      {playlist.name}
                    </DropdownMenuItem>
                  ))
                ) : (
                  <DropdownMenuItem disabled>
                    <Plus className="w-4 h-4 mr-2" />
                    No playlists yet
                  </DropdownMenuItem>
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export default TrackRow;
