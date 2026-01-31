import { useState, useEffect } from "react";
import { Play, Pause, MoreHorizontal, Heart, ListPlus, Plus, Check, Trash2, Loader2 } from "lucide-react";
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
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { useLikedSongs } from "@/contexts/LikedSongsContext";
import { useQuickAdd } from "@/contexts/QuickAddContext";

interface TrackRowProps {
  track: Track;
  index: number;
  isPlaying: boolean;
  isCurrentTrack: boolean;
  onPlay: () => void;
  onDelete?: () => void;
  showDelete?: boolean;
}

interface UserPlaylist {
  id: string;
  name: string;
}

const TrackRow = ({ track, index, isPlaying, isCurrentTrack, onPlay, onDelete, showDelete }: TrackRowProps) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  const { isLiked: checkIsLiked, toggleLike } = useLikedSongs();
  const { isQuickAddMode, quickAddTrack, recentlyAdded } = useQuickAdd();
  const [userPlaylists, setUserPlaylists] = useState<UserPlaylist[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [isPendingPlay, setIsPendingPlay] = useState(false);

  const isLiked = checkIsLiked(track.id);
  const isAlreadyAdded = recentlyAdded.has(track.id);

  // Clear pending state when this track becomes current
  useEffect(() => {
    if (isCurrentTrack) {
      setIsPendingPlay(false);
    }
  }, [isCurrentTrack]);

  // Show loading state: pending play OR already playing this track
  const showLoadingOrPlaying = isPendingPlay || (isPlaying && isCurrentTrack);

  const isUuid = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

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

  const handlePlay = () => {
    if (!isCurrentTrack) {
      setIsPendingPlay(true);
    }
    onPlay();
  };

  const handleLikeToggle = async () => {
    await toggleLike(track.id);
  };

  const handleAddToPlaylist = async (playlistId: string, playlistName: string) => {
    if (!user || !isUuid(track.id)) {
      toast({ title: t("toast.cannotAddTrack"), variant: "destructive" });
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
      toast({ title: t("toast.trackAlreadyInPlaylist") });
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
      toast({ title: t("toast.errorAddingTrack"), variant: "destructive" });
    } else {
      toast({ title: t("toast.addedToPlaylist", { playlist: playlistName }) });
    }
  };

  return (
    <div
      className={cn(
        "group grid gap-2 md:gap-4 items-center px-3 md:px-4 py-3 rounded-lg transition-colors cursor-pointer",
        "hover-capable:hover:bg-secondary/50",
        isQuickAddMode 
          ? "grid-cols-[auto_1fr_auto_auto_auto_auto]" 
          : showDelete
            ? "grid-cols-[auto_1fr_auto_auto_auto]"
            : "grid-cols-[auto_1fr_auto_auto]",
        (isCurrentTrack || isPendingPlay) && "bg-secondary"
      )}
      onClick={handlePlay}
    >
      <div className="w-6 md:w-8 flex items-center justify-center">
        {/* Show loading spinner when pending, pause when playing, index otherwise */}
        {isPendingPlay ? (
          <Loader2 className="w-4 h-4 text-primary animate-spin" />
        ) : isPlaying && isCurrentTrack ? (
          <Pause className="w-4 h-4 text-primary" />
        ) : (
          <>
            <span className={cn("text-sm text-muted-foreground group-hover:hidden", isCurrentTrack && "text-primary")}>
              {index}
            </span>
            <Button
              variant="ghost"
              size="iconSm"
              className="hidden group-hover:flex h-6 w-6 md:h-8 md:w-8"
              onClick={(e) => {
                e.stopPropagation();
                handlePlay();
              }}
            >
              <Play className="w-3 h-3 md:w-4 md:h-4" />
            </Button>
          </>
        )}
      </div>

      <div className="min-w-0 flex-1 overflow-hidden">
        <p className={cn("font-medium truncate text-sm md:text-base", isCurrentTrack ? "text-primary" : "text-foreground")}>
          {track.title}
        </p>
        <p className="text-xs md:text-sm text-muted-foreground truncate">Ambian</p>
      </div>

      {/* Quick Add button - only visible in quick add mode */}
      {isQuickAddMode && (
        <Button
          variant="ghost"
          size="iconSm"
          className={cn(
            "h-7 w-7 md:h-8 md:w-8 transition-all",
            isAlreadyAdded 
              ? "text-primary bg-primary/20" 
              : "text-muted-foreground hover:text-primary hover:bg-primary/20",
            isAdding && "animate-pulse"
          )}
          disabled={isAdding || isAlreadyAdded}
          onClick={async (e) => {
            e.stopPropagation();
            setIsAdding(true);
            await quickAddTrack(track.id, track.title);
            setIsAdding(false);
          }}
        >
          {isAlreadyAdded ? (
            <Check className="w-4 h-4" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
        </Button>
      )}

      {/* Like button - always visible on all devices */}
      <div className="flex items-center">
        <Button 
          variant="ghost" 
          size="iconSm" 
          className={cn("text-muted-foreground hover:text-foreground h-7 w-7 md:h-8 md:w-8", isLiked && "text-primary")}
          onClick={(e) => {
            e.stopPropagation();
            handleLikeToggle();
          }}
        >
          <Heart className={cn("w-4 h-4", isLiked && "fill-current")} />
        </Button>
      </div>

      {/* Admin delete button - red X */}
      {showDelete && onDelete && (
        <Button
          variant="ghost"
          size="iconSm"
          className="h-7 w-7 md:h-8 md:w-8 text-destructive hover:text-destructive hover:bg-destructive/20"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      )}

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
            
            {showDelete && onDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Remove from Playlist
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export default TrackRow;
