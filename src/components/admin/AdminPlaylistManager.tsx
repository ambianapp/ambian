import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { Plus, Trash2, ListMusic, Edit, Loader2, Search } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import PlaylistEditor from "./PlaylistEditor";

type Playlist = Tables<"playlists">;

const AdminPlaylistManager = () => {
  const { t } = useLanguage();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [newPlaylist, setNewPlaylist] = useState({
    name: "",
    description: "",
    cover_url: "",
    category: "" as string,
  });
  const { toast } = useToast();

  useEffect(() => {
    loadPlaylists();
  }, []);

  const loadPlaylists = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("playlists")
      .select("*, playlist_tracks(count)")
      .eq("is_system", true)
      .order("name", { ascending: true });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setPlaylists(data || []);
    }
    setIsLoading(false);
  };

  const handleCreatePlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylist.name) {
      toast({ title: "Error", description: "Playlist name is required", variant: "destructive" });
      return;
    }

    setIsCreating(true);
    const { error } = await supabase.from("playlists").insert([
      {
        name: newPlaylist.name,
        description: newPlaylist.description || null,
        cover_url: newPlaylist.cover_url || null,
        category: newPlaylist.category || null,
        is_system: true,
        is_public: true,
        user_id: null,
      },
    ]);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Playlist created" });
      setNewPlaylist({ name: "", description: "", cover_url: "", category: "" });
      loadPlaylists();
    }
    setIsCreating(false);
  };

  const handleDeletePlaylist = async (id: string) => {
    // First delete all tracks from the playlist
    await supabase.from("playlist_tracks").delete().eq("playlist_id", id);
    
    const { error } = await supabase.from("playlists").delete().eq("id", id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Playlist deleted" });
      setPlaylists(playlists.filter((p) => p.id !== id));
      if (selectedPlaylist?.id === id) {
        setSelectedPlaylist(null);
      }
    }
  };

  if (selectedPlaylist) {
    return (
      <PlaylistEditor
        playlist={selectedPlaylist}
        allPlaylists={playlists}
        onBack={() => {
          setSelectedPlaylist(null);
          loadPlaylists();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Create Playlist Form */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            {t("admin.createPlaylist")}
          </CardTitle>
          <CardDescription>{t("admin.createPlaylistDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreatePlaylist} className="space-y-4">
            <div className="grid md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="playlist-name">{t("admin.playlistName")} *</Label>
                <Input
                  id="playlist-name"
                  value={newPlaylist.name}
                  onChange={(e) => setNewPlaylist({ ...newPlaylist, name: e.target.value })}
                  placeholder="Playlist name"
                  className="bg-card"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="playlist-category">{t("admin.category")}</Label>
                <Select
                  value={newPlaylist.category}
                  onValueChange={(value) => setNewPlaylist({ ...newPlaylist, category: value })}
                >
                  <SelectTrigger className="bg-card">
                    <SelectValue placeholder={t("admin.selectCategory")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mood">{t("admin.mood")}</SelectItem>
                    <SelectItem value="genre">{t("admin.genre")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="playlist-cover">{t("admin.coverUrl")}</Label>
                <Input
                  id="playlist-cover"
                  value={newPlaylist.cover_url}
                  onChange={(e) => setNewPlaylist({ ...newPlaylist, cover_url: e.target.value })}
                  placeholder="https://..."
                  className="bg-card"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="playlist-description">{t("admin.description")}</Label>
              <Textarea
                id="playlist-description"
                value={newPlaylist.description}
                onChange={(e) => setNewPlaylist({ ...newPlaylist, description: e.target.value })}
                placeholder="Playlist description"
                className="bg-card resize-none"
                rows={3}
              />
            </div>
            <Button type="submit" disabled={isCreating}>
              {isCreating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              {t("admin.createBtn")}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Playlist List */}
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ListMusic className="w-5 h-5" />
                {t("admin.systemPlaylists")} ({playlists.length})
              </CardTitle>
              <CardDescription>{t("admin.clickToManage")}</CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t("admin.searchPlaylists")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-card"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : playlists.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              {t("admin.noPlaylists")}
            </p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {playlists
                .filter((playlist) =>
                  playlist.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  playlist.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  playlist.category?.toLowerCase().includes(searchQuery.toLowerCase())
                )
                .map((playlist) => (
                <div
                  key={playlist.id}
                  className="relative group p-4 rounded-xl bg-secondary/50 hover:bg-secondary transition-all cursor-pointer"
                  onClick={() => setSelectedPlaylist(playlist)}
                >
                  <div className="aspect-square mb-3 rounded-lg overflow-hidden bg-muted">
                    {playlist.cover_url ? (
                      <img
                        src={playlist.cover_url}
                        alt={playlist.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ListMusic className="w-12 h-12 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-foreground truncate">{playlist.name}</h3>
                    {playlist.category && (
                      <Badge variant="secondary" className="capitalize text-xs">
                        {playlist.category}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {(playlist as any).playlist_tracks?.[0]?.count || 0} tracks
                  </p>
                  <p className="text-sm text-muted-foreground line-clamp-1 mt-1">
                    {playlist.description || t("admin.noDescription")}
                  </p>
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="secondary"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPlaylist(playlist);
                      }}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="destructive"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeletePlaylist(playlist.id);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminPlaylistManager;
