import { useState, useEffect } from "react";
import { X, ChevronDown, ListMusic } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useQuickAdd } from "@/contexts/QuickAddContext";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface Playlist {
  id: string;
  name: string;
  is_system: boolean;
}

const QuickAddBar = () => {
  const { isAdmin } = useAuth();
  const { targetPlaylist, setTargetPlaylist, isQuickAddMode, recentlyAdded, isQuickAddEnabled } = useQuickAdd();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;

    const fetchPlaylists = async () => {
      // Fetch all playlists (admins can see all)
      const { data } = await supabase
        .from("playlists")
        .select("id, name, is_system")
        .order("name");
      
      setPlaylists(data || []);
    };

    fetchPlaylists();
  }, [isAdmin]);

  if (!isAdmin || !isQuickAddEnabled) return null;

  return (
    <div className={cn(
      "fixed z-50 flex items-center gap-2 px-3 py-2 rounded-xl border shadow-lg transition-all",
      // Mobile: bottom-left to avoid hamburger menu (top-right)
      "bottom-36 left-4",
      // Desktop: top-right
      "md:bottom-auto md:top-4 md:left-auto md:right-4",
      isQuickAddMode 
        ? "bg-primary/20 border-primary/50 backdrop-blur-md" 
        : "bg-card/90 border-border backdrop-blur-sm"
    )}>
      <ListMusic className={cn("w-4 h-4", isQuickAddMode && "text-primary")} />
      
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="ghost" 
            size="sm" 
            className={cn(
              "h-8 gap-1 text-sm font-medium",
              isQuickAddMode && "text-primary"
            )}
          >
            {targetPlaylist ? targetPlaylist.name : "Quick Add Mode"}
            <ChevronDown className="w-3 h-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64 max-h-80 overflow-y-auto">
          {playlists.map((playlist) => (
            <DropdownMenuItem 
              key={playlist.id}
              onClick={() => {
                setTargetPlaylist({ id: playlist.id, name: playlist.name });
                setIsOpen(false);
              }}
              className={cn(
                targetPlaylist?.id === playlist.id && "bg-primary/20 text-primary"
              )}
            >
              <span className="truncate">{playlist.name}</span>
              {playlist.is_system && (
                <span className="ml-auto text-xs text-muted-foreground">System</span>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {isQuickAddMode && (
        <>
          <span className="text-xs text-primary font-medium px-2 py-0.5 bg-primary/20 rounded-full">
            {recentlyAdded.size} added
          </span>
          <Button
            variant="ghost"
            size="iconSm"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={() => setTargetPlaylist(null)}
          >
            <X className="w-4 h-4" />
          </Button>
        </>
      )}
    </div>
  );
};

export default QuickAddBar;
