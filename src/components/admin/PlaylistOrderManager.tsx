import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GripVertical, ArrowUp, ArrowDown, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Playlist {
  id: string;
  name: string;
  display_order: number;
  cover_url: string | null;
  track_count: number;
}

interface PlaylistOrderManagerProps {
  category: "mood" | "genre";
  title: string;
  description: string;
}

export const PlaylistOrderManager = ({ category, title, description }: PlaylistOrderManagerProps) => {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadPlaylists();
  }, [category]);

  const loadPlaylists = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("playlists")
      .select("id, name, display_order, cover_url, playlist_tracks(count)")
      .eq("is_system", true)
      .eq("category", category)
      .order("display_order", { ascending: true });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      const playlistsWithCount = (data || []).map(p => ({
        ...p,
        track_count: (p.playlist_tracks as any)?.[0]?.count || 0
      }));
      setPlaylists(playlistsWithCount);
    }
    setIsLoading(false);
    setHasChanges(false);
  };

  const movePlaylist = (index: number, direction: "up" | "down") => {
    const newPlaylists = [...playlists];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    
    if (targetIndex < 0 || targetIndex >= newPlaylists.length) return;
    
    // Swap positions
    [newPlaylists[index], newPlaylists[targetIndex]] = [newPlaylists[targetIndex], newPlaylists[index]];
    
    // Update display_order values
    newPlaylists.forEach((playlist, idx) => {
      playlist.display_order = idx + 1;
    });
    
    setPlaylists(newPlaylists);
    setHasChanges(true);
  };

  const saveOrder = async () => {
    setIsSaving(true);
    
    try {
      // Update each playlist's display_order
      for (const playlist of playlists) {
        const { error } = await supabase
          .from("playlists")
          .update({ display_order: playlist.display_order })
          .eq("id", playlist.id);
        
        if (error) throw error;
      }
      
      toast({ title: "Success", description: "Playlist order saved" });
      setHasChanges(false);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
    
    setIsSaving(false);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground">Loading playlists...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          {hasChanges && (
            <Button onClick={saveOrder} disabled={isSaving} size="sm" className="gap-2">
              <Save className="w-4 h-4" />
              {isSaving ? "Saving..." : "Save Order"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {playlists.map((playlist, index) => (
            <div
              key={playlist.id}
              className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg"
            >
              <GripVertical className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground w-6">{index + 1}.</span>
              {playlist.cover_url && (
                <img 
                  src={playlist.cover_url} 
                  alt="" 
                  className="w-10 h-10 rounded object-cover"
                />
              )}
              <span className="flex-1 font-medium">{playlist.name}</span>
              <span className="text-sm text-muted-foreground">{playlist.track_count} tracks</span>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => movePlaylist(index, "up")}
                  disabled={index === 0}
                  className="h-8 w-8"
                >
                  <ArrowUp className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => movePlaylist(index, "down")}
                  disabled={index === playlists.length - 1}
                  className="h-8 w-8"
                >
                  <ArrowDown className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
