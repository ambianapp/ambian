import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Trash2, Music, ArrowRightLeft, Loader2, ListMusic } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Playlist = Tables<"playlists">;
type Track = Tables<"tracks">;

interface PlaylistTrackWithDetails {
  id: string;
  track_id: string;
  position: number | null;
  track: Track;
}

interface PlaylistEditorProps {
  playlist: Playlist;
  allPlaylists: Playlist[];
  onBack: () => void;
}

const PlaylistEditor = ({ playlist, allPlaylists, onBack }: PlaylistEditorProps) => {
  const [playlistTracks, setPlaylistTracks] = useState<PlaylistTrackWithDetails[]>([]);
  const [allTracks, setAllTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTrackToAdd, setSelectedTrackToAdd] = useState<string>("");
  const [selectedTracksToTransfer, setSelectedTracksToTransfer] = useState<Set<string>>(new Set());
  const [transferTargetPlaylist, setTransferTargetPlaylist] = useState<string>("");
  const [isTransferring, setIsTransferring] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, [playlist.id]);

  const loadData = async () => {
    setIsLoading(true);
    
    // Load playlist tracks with track details
    const { data: ptData, error: ptError } = await supabase
      .from("playlist_tracks")
      .select("id, track_id, position, tracks(*)")
      .eq("playlist_id", playlist.id)
      .order("position", { ascending: true });

    if (ptError) {
      toast({ title: "Error", description: ptError.message, variant: "destructive" });
    } else {
      const formattedTracks = (ptData || []).map((pt: any) => ({
        id: pt.id,
        track_id: pt.track_id,
        position: pt.position,
        track: pt.tracks as Track,
      }));
      setPlaylistTracks(formattedTracks);
    }

    // Load all tracks
    const { data: tracksData, error: tracksError } = await supabase
      .from("tracks")
      .select("*")
      .order("title");

    if (tracksError) {
      toast({ title: "Error", description: tracksError.message, variant: "destructive" });
    } else {
      setAllTracks(tracksData || []);
    }

    setIsLoading(false);
  };

  const handleAddTrack = async () => {
    if (!selectedTrackToAdd) return;

    // Check if track already in playlist
    if (playlistTracks.some((pt) => pt.track_id === selectedTrackToAdd)) {
      toast({ title: "Info", description: "Track already in playlist" });
      return;
    }

    const maxPosition = playlistTracks.reduce((max, pt) => Math.max(max, pt.position || 0), 0);

    const { error } = await supabase.from("playlist_tracks").insert([
      {
        playlist_id: playlist.id,
        track_id: selectedTrackToAdd,
        position: maxPosition + 1,
      },
    ]);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Track added to playlist" });
      setSelectedTrackToAdd("");
      loadData();
    }
  };

  const handleRemoveTrack = async (playlistTrackId: string) => {
    const { error } = await supabase.from("playlist_tracks").delete().eq("id", playlistTrackId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Track removed from playlist" });
      setPlaylistTracks(playlistTracks.filter((pt) => pt.id !== playlistTrackId));
      setSelectedTracksToTransfer((prev) => {
        const next = new Set(prev);
        next.delete(playlistTrackId);
        return next;
      });
    }
  };

  const toggleTrackSelection = (playlistTrackId: string) => {
    setSelectedTracksToTransfer((prev) => {
      const next = new Set(prev);
      if (next.has(playlistTrackId)) {
        next.delete(playlistTrackId);
      } else {
        next.add(playlistTrackId);
      }
      return next;
    });
  };

  const handleTransferTracks = async () => {
    if (!transferTargetPlaylist || selectedTracksToTransfer.size === 0) return;

    setIsTransferring(true);

    // Get the track IDs from selected playlist tracks
    const trackIds = playlistTracks
      .filter((pt) => selectedTracksToTransfer.has(pt.id))
      .map((pt) => pt.track_id);

    // Check which tracks already exist in target playlist
    const { data: existingTracks } = await supabase
      .from("playlist_tracks")
      .select("track_id")
      .eq("playlist_id", transferTargetPlaylist)
      .in("track_id", trackIds);

    const existingTrackIds = new Set((existingTracks || []).map((t) => t.track_id));
    const newTrackIds = trackIds.filter((id) => !existingTrackIds.has(id));

    if (newTrackIds.length === 0) {
      toast({ title: "Info", description: "All selected tracks already exist in target playlist" });
      setIsTransferring(false);
      return;
    }

    // Get max position in target playlist
    const { data: targetTracks } = await supabase
      .from("playlist_tracks")
      .select("position")
      .eq("playlist_id", transferTargetPlaylist)
      .order("position", { ascending: false })
      .limit(1);

    let maxPosition = (targetTracks && targetTracks[0]?.position) || 0;

    // Insert tracks into target playlist
    const inserts = newTrackIds.map((trackId, index) => ({
      playlist_id: transferTargetPlaylist,
      track_id: trackId,
      position: maxPosition + index + 1,
    }));

    const { error } = await supabase.from("playlist_tracks").insert(inserts);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      const skipped = trackIds.length - newTrackIds.length;
      let message = `${newTrackIds.length} track(s) transferred`;
      if (skipped > 0) message += `, ${skipped} already existed`;
      toast({ title: "Success", description: message });
      setSelectedTracksToTransfer(new Set());
      setTransferTargetPlaylist("");
    }

    setIsTransferring(false);
  };

  const availableTracksToAdd = allTracks.filter(
    (track) => !playlistTracks.some((pt) => pt.track_id === track.id)
  );

  const otherPlaylists = allPlaylists.filter((p) => p.id !== playlist.id);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted flex-shrink-0">
            {playlist.cover_url ? (
              <img src={playlist.cover_url} alt={playlist.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ListMusic className="w-8 h-8 text-muted-foreground" />
              </div>
            )}
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">{playlist.name}</h2>
            <p className="text-muted-foreground">{playlistTracks.length} tracks</p>
          </div>
        </div>
      </div>

      {/* Add Track */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Add Track
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Select value={selectedTrackToAdd} onValueChange={setSelectedTrackToAdd}>
              <SelectTrigger className="flex-1 bg-card">
                <SelectValue placeholder="Select a track to add" />
              </SelectTrigger>
              <SelectContent>
                {availableTracksToAdd.map((track) => (
                  <SelectItem key={track.id} value={track.id}>
                    {track.title} - {track.artist}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleAddTrack} disabled={!selectedTrackToAdd}>
              <Plus className="w-4 h-4 mr-2" />
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Transfer Controls */}
      {selectedTracksToTransfer.size > 0 && otherPlaylists.length > 0 && (
        <Card className="bg-primary/10 border-primary/20">
          <CardContent className="pt-4">
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-foreground font-medium">
                {selectedTracksToTransfer.size} track(s) selected
              </span>
              <Select value={transferTargetPlaylist} onValueChange={setTransferTargetPlaylist}>
                <SelectTrigger className="w-[200px] bg-card">
                  <SelectValue placeholder="Transfer to..." />
                </SelectTrigger>
                <SelectContent>
                  {otherPlaylists.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={handleTransferTracks}
                disabled={!transferTargetPlaylist || isTransferring}
              >
                {isTransferring ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <ArrowRightLeft className="w-4 h-4 mr-2" />
                )}
                Transfer
              </Button>
              <Button variant="ghost" onClick={() => setSelectedTracksToTransfer(new Set())}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Track List */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Music className="w-5 h-5" />
            Tracks in Playlist
          </CardTitle>
          <CardDescription>Click tracks to select them for transfer</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : playlistTracks.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No tracks in this playlist yet.
            </p>
          ) : (
            <div className="space-y-2">
              {playlistTracks.map((pt) => (
                <div
                  key={pt.id}
                  className={`flex items-center gap-4 p-3 rounded-lg transition-colors cursor-pointer ${
                    selectedTracksToTransfer.has(pt.id)
                      ? "bg-primary/20 ring-2 ring-primary"
                      : "bg-secondary/50 hover:bg-secondary"
                  }`}
                  onClick={() => toggleTrackSelection(pt.id)}
                >
                  {pt.track.cover_url ? (
                    <img
                      src={pt.track.cover_url}
                      alt={pt.track.title}
                      className="w-12 h-12 rounded object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded bg-muted flex items-center justify-center flex-shrink-0">
                      <Music className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{pt.track.title}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {pt.track.artist} {pt.track.album && `• ${pt.track.album}`}
                    </p>
                  </div>
                  <span className="text-sm text-muted-foreground">{pt.track.duration}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveTrack(pt.id);
                    }}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PlaylistEditor;
