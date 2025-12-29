import { useState, useEffect } from "react";
import { Home, Search, Library, Plus, Heart, User, Shield, Clock, HelpCircle, Menu, LogOut } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import SignedImage from "@/components/SignedImage";
import LanguageSelector from "@/components/LanguageSelector";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
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

interface MobileSidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
  onPlaylistSelect?: (playlist: SelectedPlaylist) => void;
  schedulerEnabled?: boolean;
  onToggleScheduler?: (enabled: boolean) => void;
}

const MobileSidebar = ({ activeView, onViewChange, onPlaylistSelect, schedulerEnabled = true, onToggleScheduler }: MobileSidebarProps) => {
  const { user, isAdmin, signOut } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [ownPlaylists, setOwnPlaylists] = useState<SidebarPlaylist[]>([]);
  const [likedPlaylists, setLikedPlaylists] = useState<SidebarPlaylist[]>([]);
  const [likedSongsCount, setLikedSongsCount] = useState(0);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [newPlaylistDescription, setNewPlaylistDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const isOnIndexPage = location.pathname === "/";

  const fetchPlaylists = async () => {
    if (!user) return;

    const { data: userPlaylists } = await supabase
      .from("playlists")
      .select("id, name, cover_url, description")
      .eq("user_id", user.id)
      .eq("is_system", false)
      .order("created_at", { ascending: false });

    if (userPlaylists) {
      setOwnPlaylists(userPlaylists);
    }

    const { data: likedData } = await supabase
      .from("liked_playlists")
      .select("playlist_id, playlists(id, name, cover_url, description)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (likedData) {
      const playlists = likedData
        .map((item: any) => item.playlists)
        .filter(Boolean);
      setLikedPlaylists(playlists);
    }

    const { count } = await supabase
      .from("liked_songs")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

    setLikedSongsCount(count || 0);
  };

  useEffect(() => {
    fetchPlaylists();
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('mobile-sidebar-liked-playlists')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'liked_playlists',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchPlaylists();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const navItems = [
    { id: "home", label: t("nav.home"), icon: Home },
    { id: "search", label: t("nav.search"), icon: Search },
    { id: "library", label: t("nav.library"), icon: Library },
    { id: "schedule", label: t("nav.schedule"), icon: Clock },
  ];

  const handleNavClick = (id: string) => {
    if (isOnIndexPage) {
      onViewChange(id);
    } else {
      navigate("/", { state: { view: id } });
    }
    setOpen(false);
  };

  const handlePlaylistClick = (playlist: SidebarPlaylist) => {
    if (onPlaylistSelect) {
      onPlaylistSelect({
        id: playlist.id,
        name: playlist.name,
        cover: playlist.cover_url,
        description: playlist.description,
      });
    }
    setOpen(false);
  };

  const handleLikedSongsClick = () => {
    if (onPlaylistSelect) {
      onPlaylistSelect({
        id: "liked-songs",
        name: t("sidebar.likedSongs"),
        cover: null,
        description: null,
      });
    }
    setOpen(false);
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
      
      if (data && onPlaylistSelect) {
        onPlaylistSelect({
          id: data.id,
          name: data.name,
          cover: data.cover_url,
          description: data.description,
        });
      }
      setOpen(false);
    }
  };

  const allPlaylists = [...ownPlaylists, ...likedPlaylists];
  const uniquePlaylists = allPlaylists.filter(
    (playlist, index, self) => index === self.findIndex((p) => p.id === playlist.id)
  );

  return (
    <>
      {/* Floating Hamburger Menu Button */}
      <div className="md:hidden fixed top-4 right-4 z-50">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button size="icon" className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg">
              <Menu className="w-6 h-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72 p-0 flex flex-col">
            <div className="flex flex-col h-full overflow-hidden">
              {/* Logo in sidebar */}
              <div className="flex items-center gap-3 px-4 py-4 border-b border-border">
                <img 
                  src="/ambian-logo.png" 
                  alt="Ambian" 
                  className="h-12 object-contain"
                />
              </div>

              {/* Main Navigation */}
              <nav className="flex flex-col gap-1 p-4">
                {navItems.map((item) => (
                  <div key={item.id} className="flex items-center">
                    <Button
                      variant="ghost"
                      className={cn(
                        "justify-start gap-4 h-12 text-base font-medium flex-1",
                        isOnIndexPage && activeView === item.id
                          ? "bg-secondary text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                      onClick={() => handleNavClick(item.id)}
                    >
                      <item.icon className="w-5 h-5" />
                      {item.label}
                    </Button>
                    {item.id === "schedule" && onToggleScheduler && (
                      <Switch
                        checked={schedulerEnabled}
                        onCheckedChange={onToggleScheduler}
                        className="mr-2"
                      />
                    )}
                  </div>
                ))}
                <Button
                  variant="ghost"
                  className={cn(
                    "justify-start gap-4 h-12 text-base font-medium",
                    location.pathname === "/profile"
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => { navigate("/profile"); setOpen(false); }}
                >
                  <User className="w-5 h-5" />
                  {t("nav.profile")}
                </Button>
                <Button
                  variant="ghost"
                  className={cn(
                    "justify-start gap-4 h-12 text-base font-medium",
                    location.pathname === "/help"
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => { navigate("/help"); setOpen(false); }}
                >
                  <HelpCircle className="w-5 h-5" />
                  {t("nav.help")}
                </Button>
                <div className="px-3 py-1">
                  <LanguageSelector />
                </div>
                {isAdmin && (
                  <Button
                    variant="ghost"
                    className={cn(
                      "justify-start gap-4 h-12 text-base font-medium",
                      location.pathname === "/admin"
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    onClick={() => { navigate("/admin"); setOpen(false); }}
                  >
                    <Shield className="w-5 h-5 text-primary" />
                    {t("sidebar.adminPanel")}
                  </Button>
                )}
              </nav>

              {/* Playlists Section */}
              <div className="flex-1 flex flex-col gap-2 px-4 min-h-0 overflow-hidden">
                <div className="flex items-center justify-between flex-shrink-0">
                  <span className="text-sm font-semibold text-muted-foreground">{t("sidebar.yourPlaylists")}</span>
                  <Button 
                    variant="ghost" 
                    size="iconSm" 
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => setIsCreateDialogOpen(true)}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-1 scrollbar-subtle pb-4">
                  {/* Liked Songs */}
                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-3 h-10 text-sm text-muted-foreground hover:text-foreground"
                    onClick={handleLikedSongsClick}
                  >
                    <Heart className="w-4 h-4 text-primary fill-current" />
                    <span className="truncate">{t("sidebar.likedSongs")}</span>
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
                        <SignedImage
                          src={playlist.cover_url}
                          alt={`${playlist.name} playlist cover`}
                          className="w-4 h-4 rounded object-cover"
                          fallbackSrc="/placeholder.svg"
                        />
                      ) : (
                        <div className="w-4 h-4 rounded bg-gradient-to-br from-primary to-accent" />
                      )}
                      <span className="truncate">{playlist.name}</span>
                    </Button>
                  ))}

                  {uniquePlaylists.length === 0 && (
                    <p className="text-xs text-muted-foreground px-2 py-2">
                      {t("sidebar.noPlaylists")}
                    </p>
                  )}
                </div>
              </div>

              {/* Sign Out at bottom */}
              <div className="p-4 border-t border-border mt-auto">
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-4 h-12 text-base font-medium text-destructive hover:text-destructive"
                  onClick={() => { signOut(); setOpen(false); }}
                >
                  <LogOut className="w-5 h-5" />
                  {t("common.signOut")}
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Create Playlist Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("sidebar.createPlaylist")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="mobile-playlist-name">{t("sidebar.playlistName")}</Label>
              <Input
                id="mobile-playlist-name"
                placeholder="My Playlist"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mobile-playlist-description">{t("sidebar.playlistDescription")}</Label>
              <Textarea
                id="mobile-playlist-description"
                placeholder="Add a description..."
                value={newPlaylistDescription}
                onChange={(e) => setNewPlaylistDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsCreateDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button 
              onClick={handleCreatePlaylist} 
              disabled={!newPlaylistName.trim() || isCreating}
            >
              {isCreating ? t("common.loading") : t("sidebar.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default MobileSidebar;
