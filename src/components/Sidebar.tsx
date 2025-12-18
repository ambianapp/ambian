import { useState, useEffect } from "react";
import { Home, Search, Library, Plus, Heart, Music2, User, Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

interface SelectedPlaylist {
  id: string;
  name: string;
  cover: string | null;
  description: string | null;
}

interface SidebarPlaylist {
  id: string;
  name: string;
  cover_url: string | null;
  description: string | null;
}

interface SidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
  onPlaylistSelect?: (playlist: SelectedPlaylist) => void;
}

const Sidebar = ({ activeView, onViewChange, onPlaylistSelect }: SidebarProps) => {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [ownPlaylists, setOwnPlaylists] = useState<SidebarPlaylist[]>([]);
  const [likedPlaylists, setLikedPlaylists] = useState<SidebarPlaylist[]>([]);
  const [likedSongsCount, setLikedSongsCount] = useState(0);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [newPlaylistDescription, setNewPlaylistDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const fetchPlaylists = async () => {
    if (!user) return;

    // Fetch user's own playlists
    const { data: userPlaylists } = await supabase
      .from("playlists")
      .select("id, name, cover_url, description")
      .eq("user_id", user.id)
      .eq("is_system", false)
      .order("created_at", { ascending: false })
      .limit(5);

    if (userPlaylists) {
      setOwnPlaylists(userPlaylists);
    }

    // Fetch liked playlists
    const { data: likedData } = await supabase
      .from("liked_playlists")
      .select("playlist_id, playlists(id, name, cover_url, description)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5);

    if (likedData) {
      const playlists = likedData
        .map((item: any) => item.playlists)
        .filter(Boolean);
      setLikedPlaylists(playlists);
    }

    // Fetch liked songs count
    const { count } = await supabase
      .from("liked_songs")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

    setLikedSongsCount(count || 0);
  };

  useEffect(() => {
    fetchPlaylists();
  }, [user]);

  const navItems = [
    { id: "home", label: "Home", icon: Home },
    { id: "search", label: "Search", icon: Search },
    { id: "library", label: "Your Library", icon: Library },
  ];

  const handlePlaylistClick = (playlist: SidebarPlaylist) => {
    if (onPlaylistSelect) {
      onPlaylistSelect({
        id: playlist.id,
        name: playlist.name,
        cover: playlist.cover_url,
        description: playlist.description,
      });
    }
  };

  const handleLikedSongsClick = () => {
    if (onPlaylistSelect) {
      onPlaylistSelect({
        id: "liked-songs",
        name: "Liked Songs",
        cover: null,
        description: "Your favorite tracks",
      });
    }
  };

  const handleCreatePlaylist = async () => {
    if (!user || !newPlaylistName.trim()) return;

    setIsCreating(true);
    const { data, error } = await supabase
      .from("playlists")
      .insert({
        name: newPlaylistName.trim(),
        description: newPlaylistDescription.trim() || null,
        user_id: user.id,
        is_system: false,
        is_public: false,
      })
      .select()
      .single();

    setIsCreating(false);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to create playlist",
        variant: "destructive",
      });
    } else {
      toast({ title: "Playlist created" });
      setNewPlaylistName("");
      setNewPlaylistDescription("");
      setIsCreateDialogOpen(false);
      fetchPlaylists();
      
      // Open the new playlist
      if (data && onPlaylistSelect) {
        onPlaylistSelect({
          id: data.id,
          name: data.name,
          cover: data.cover_url,
          description: data.description,
        });
      }
    }
  };

  const allPlaylists = [...ownPlaylists, ...likedPlaylists];
  const uniquePlaylists = allPlaylists.filter(
    (playlist, index, self) => index === self.findIndex((p) => p.id === playlist.id)
  );

  return (
    <aside className="hidden md:flex flex-col w-64 bg-card/50 border-r border-border p-4 gap-6">
      {/* Logo */}
      <div className="flex items-center gap-3 px-2 py-4">
        <img 
          src="/ambian-logo.png" 
          alt="Ambian" 
          className="h-8 object-contain"
        />
      </div>

      {/* Main Navigation */}
      <nav className="flex flex-col gap-1">
        {navItems.map((item) => (
          <Button
            key={item.id}
            variant="ghost"
            className={cn(
              "justify-start gap-4 h-12 text-base font-medium",
              activeView === item.id
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => onViewChange(item.id)}
          >
            <item.icon className="w-5 h-5" />
            {item.label}
          </Button>
        ))}
        <Button
          variant="ghost"
          className="justify-start gap-4 h-12 text-base font-medium text-muted-foreground hover:text-foreground"
          onClick={() => navigate("/profile")}
        >
          <User className="w-5 h-5" />
          Profile
        </Button>
        {isAdmin && (
          <Button
            variant="ghost"
            className="justify-start gap-4 h-12 text-base font-medium text-muted-foreground hover:text-foreground"
            onClick={() => navigate("/admin")}
          >
            <Shield className="w-5 h-5 text-primary" />
            Admin Panel
          </Button>
        )}
      </nav>

      {/* Playlists Section */}
      <div className="flex-1 flex flex-col gap-4 mt-4">
        <div className="flex items-center justify-between px-2">
          <span className="text-sm font-semibold text-muted-foreground">Your Playlists</span>
          <Button 
            variant="ghost" 
            size="iconSm" 
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setIsCreateDialogOpen(true)}
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>

      {/* Create Playlist Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Playlist</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="playlist-name">Name</Label>
              <Input
                id="playlist-name"
                placeholder="My Playlist"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="playlist-description">Description (optional)</Label>
              <Textarea
                id="playlist-description"
                placeholder="Add a description..."
                value={newPlaylistDescription}
                onChange={(e) => setNewPlaylistDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreatePlaylist} 
              disabled={!newPlaylistName.trim() || isCreating}
            >
              {isCreating ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

        <div className="flex-1 overflow-y-auto space-y-1">
          {/* Liked Songs - always shown */}
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 h-10 text-sm text-muted-foreground hover:text-foreground"
            onClick={handleLikedSongsClick}
          >
            <Heart className="w-4 h-4 text-primary fill-current" />
            <span className="truncate">Liked Songs</span>
            {likedSongsCount > 0 && (
              <span className="text-xs text-muted-foreground ml-auto">{likedSongsCount}</span>
            )}
          </Button>

          {/* User's playlists */}
          {uniquePlaylists.map((playlist) => (
            <Button
              key={playlist.id}
              variant="ghost"
              className="w-full justify-start gap-3 h-10 text-sm text-muted-foreground hover:text-foreground"
              onClick={() => handlePlaylistClick(playlist)}
            >
              {playlist.cover_url ? (
                <img
                  src={playlist.cover_url}
                  alt={playlist.name}
                  className="w-4 h-4 rounded object-cover"
                />
              ) : (
                <div className="w-4 h-4 rounded bg-gradient-to-br from-primary to-accent" />
              )}
              <span className="truncate">{playlist.name}</span>
            </Button>
          ))}

          {uniquePlaylists.length === 0 && (
            <p className="text-xs text-muted-foreground px-2 py-2">
              No playlists yet. Create one in Your Library.
            </p>
          )}
        </div>
      </div>

    </aside>
  );
};

export default Sidebar;