import { useState, useEffect, useMemo } from "react";
import { Undo2, Trash2, Clock, Music, ChevronDown, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

interface DeletedTrack {
  id: string;
  playlist_id: string;
  track_id: string;
  original_position: number;
  deleted_at: string;
  playlist_name: string | null;
  track_title: string | null;
  track_artist: string | null;
}

interface GroupedTracks {
  [playlistId: string]: {
    playlistName: string;
    tracks: DeletedTrack[];
  };
}

export const DeletedTracksManager = () => {
  const [deletedTracks, setDeletedTracks] = useState<DeletedTrack[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadDeletedTracks();
  }, []);

  const loadDeletedTracks = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("deleted_playlist_tracks")
      .select("*")
      .order("deleted_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("Error loading deleted tracks:", error);
      toast.error("Failed to load deleted tracks");
    } else {
      setDeletedTracks(data || []);
    }
    setIsLoading(false);
  };

  const groupedTracks = useMemo(() => {
    const groups: GroupedTracks = {};
    deletedTracks.forEach((track) => {
      const key = track.playlist_id;
      if (!groups[key]) {
        groups[key] = {
          playlistName: track.playlist_name || "Unknown Playlist",
          tracks: [],
        };
      }
      groups[key].tracks.push(track);
    });
    return groups;
  }, [deletedTracks]);

  const toggleFolder = (playlistId: string) => {
    setOpenFolders((prev) => {
      const next = new Set(prev);
      if (next.has(playlistId)) {
        next.delete(playlistId);
      } else {
        next.add(playlistId);
      }
      return next;
    });
  };

  const handleRestore = async (item: DeletedTrack) => {
    const { error: insertError } = await supabase
      .from("playlist_tracks")
      .insert({
        playlist_id: item.playlist_id,
        track_id: item.track_id,
        position: item.original_position,
      });

    if (insertError) {
      if (insertError.code === "23505") {
        toast.error("Track already exists in playlist");
      } else {
        toast.error("Failed to restore track");
        console.error("Error restoring track:", insertError);
      }
      return;
    }

    const { error: deleteError } = await supabase
      .from("deleted_playlist_tracks")
      .delete()
      .eq("id", item.id);

    if (deleteError) {
      console.error("Error removing from deleted log:", deleteError);
    }

    toast.success(`Restored "${item.track_title}" to position ${item.original_position}`);
    setDeletedTracks((prev) => prev.filter((t) => t.id !== item.id));
  };

  const handlePermanentDelete = async (item: DeletedTrack) => {
    const { error } = await supabase
      .from("deleted_playlist_tracks")
      .delete()
      .eq("id", item.id);

    if (error) {
      toast.error("Failed to remove from log");
      console.error("Error deleting:", error);
    } else {
      toast.success("Removed from deleted log");
      setDeletedTracks((prev) => prev.filter((t) => t.id !== item.id));
    }
  };

  const handleClearAll = async () => {
    const { error } = await supabase
      .from("deleted_playlist_tracks")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");

    if (error) {
      toast.error("Failed to clear log");
      console.error("Error clearing:", error);
    } else {
      toast.success("Cleared all deleted tracks log");
      setDeletedTracks([]);
    }
  };

  const playlistIds = Object.keys(groupedTracks);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-destructive" />
              Deleted Tracks Log
            </CardTitle>
            <CardDescription>
              Recently deleted tracks grouped by playlist
            </CardDescription>
          </div>
          {deletedTracks.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleClearAll}>
              Clear All
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Loading...</div>
        ) : playlistIds.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <Music className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No deleted tracks</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {playlistIds.map((playlistId) => {
              const group = groupedTracks[playlistId];
              const isOpen = openFolders.has(playlistId);

              return (
                <Collapsible
                  key={playlistId}
                  open={isOpen}
                  onOpenChange={() => toggleFolder(playlistId)}
                >
                  <CollapsibleTrigger asChild>
                    <button className="flex items-center justify-between w-full p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-left">
                      <div className="flex items-center gap-3">
                        <FolderOpen className="w-5 h-5 text-primary" />
                        <span className="font-medium">{group.playlistName}</span>
                        <span className="text-sm text-muted-foreground">
                          ({group.tracks.length} {group.tracks.length === 1 ? "track" : "tracks"})
                        </span>
                      </div>
                      <ChevronDown
                        className={`w-4 h-4 text-muted-foreground transition-transform ${
                          isOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="pl-4 mt-1 space-y-1">
                      {group.tracks.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-card/50 border border-border"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">
                              {item.track_title || "Unknown Track"}
                            </p>
                            <p className="text-sm text-muted-foreground truncate">
                              {item.track_artist || "Unknown Artist"} • Position #{item.original_position}
                            </p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                              <Clock className="w-3 h-3" />
                              {format(new Date(item.deleted_at), "MMM d, yyyy HH:mm")}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRestore(item)}
                              className="text-primary hover:text-primary"
                            >
                              <Undo2 className="w-4 h-4 mr-1" />
                              Restore
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handlePermanentDelete(item)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
