import { useState, useEffect } from "react";
import { Shuffle, Search, Check, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getSignedAudioUrl } from "@/lib/storage";
import type { Track } from "@/data/musicData";

interface DbPlaylist {
  id: string;
  name: string;
  description: string | null;
  cover_url: string | null;
  category: string | null;
}

interface QuickMixDialogProps {
  onTrackSelect: (track: Track, playlistTracks?: Track[]) => void;
  trigger?: React.ReactNode;
}

const QuickMixDialog = ({ onTrackSelect, trigger }: QuickMixDialogProps) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [allPlaylists, setAllPlaylists] = useState<DbPlaylist[]>([]);
  const [filteredPlaylists, setFilteredPlaylists] = useState<DbPlaylist[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (open) {
      loadPlaylists();
    }
  }, [open]);

  useEffect(() => {
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      setFilteredPlaylists(
        allPlaylists.filter(p => 
          p.name.toLowerCase().includes(query) ||
          p.category?.toLowerCase().includes(query)
        )
      );
    } else {
      setFilteredPlaylists(allPlaylists);
    }
  }, [searchQuery, allPlaylists]);

  const loadPlaylists = async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from("playlists")
      .select("id, name, description, cover_url, category")
      .or("is_system.eq.true,is_public.eq.true")
      .order("name", { ascending: true });

    setAllPlaylists(data || []);
    setFilteredPlaylists(data || []);
    setIsLoading(false);
  };

  const togglePlaylist = (id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredPlaylists.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredPlaylists.map(p => p.id)));
    }
  };

  const handlePlayMix = async () => {
    if (selectedIds.size === 0) return;
    setIsPlaying(true);

    try {
      // Fetch all tracks from selected playlists
      const { data: allTracksData } = await supabase
        .from("playlist_tracks")
        .select("tracks(*), playlist_id")
        .in("playlist_id", Array.from(selectedIds));

      if (!allTracksData || allTracksData.length === 0) {
        setIsPlaying(false);
        return;
      }

      // Convert to Track format
      const allTracks: Track[] = allTracksData
        .map((item: any) => item.tracks)
        .filter(Boolean)
        .map((t: any) => ({
          id: t.id,
          title: t.title,
          artist: t.artist,
          album: t.album || "",
          duration: t.duration || "",
          cover: t.cover_url || "/placeholder.svg",
          genre: t.genre || "",
        }));

      // Remove duplicates
      const uniqueTracks = allTracks.filter((track, index, self) => 
        index === self.findIndex(t => t.id === track.id)
      );

      if (uniqueTracks.length === 0) {
        setIsPlaying(false);
        return;
      }

      // Shuffle the tracks
      const shuffledTracks = [...uniqueTracks].sort(() => Math.random() - 0.5);

      // Get signed URL for the first track
      const firstTrack = shuffledTracks[0];
      const { data: trackData } = await supabase
        .from("tracks")
        .select("audio_url")
        .eq("id", firstTrack.id)
        .single();

      const signedAudioUrl = trackData?.audio_url 
        ? await getSignedAudioUrl(trackData.audio_url)
        : undefined;

      // Log play history
      if (user) {
        for (const playlistId of Array.from(selectedIds)) {
          await supabase.from("play_history").insert({
            user_id: user.id,
            playlist_id: playlistId,
          });
        }
      }

      setOpen(false);
      setSelectedIds(new Set());
      setSearchQuery("");
      
      onTrackSelect({
        ...firstTrack,
        audioUrl: signedAudioUrl,
      }, shuffledTracks);
    } finally {
      setIsPlaying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="gap-2">
            <Shuffle className="w-4 h-4" />
            Quick Mix
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shuffle className="w-5 h-5 text-primary" />
            Quick Mix
          </DialogTitle>
        </DialogHeader>
        
        <p className="text-sm text-muted-foreground">
          Select multiple playlists to shuffle their songs together
        </p>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search playlists..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSelectAll}
          >
            {selectedIds.size === filteredPlaylists.length && filteredPlaylists.length > 0 
              ? "Deselect All" 
              : "Select All"}
          </Button>
          {selectedIds.size > 0 && (
            <span className="text-sm text-muted-foreground">
              {selectedIds.size} selected
            </span>
          )}
        </div>

        {/* Playlist List */}
        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-1 py-2">
            {isLoading ? (
              <p className="text-center text-muted-foreground py-8">Loading...</p>
            ) : filteredPlaylists.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No playlists found</p>
            ) : (
              filteredPlaylists.map((playlist) => (
                <button
                  key={playlist.id}
                  onClick={() => togglePlaylist(playlist.id)}
                  className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors ${
                    selectedIds.has(playlist.id) 
                      ? "bg-primary/10 ring-1 ring-primary/30" 
                      : "hover:bg-muted/50"
                  }`}
                >
                  <Checkbox 
                    checked={selectedIds.has(playlist.id)}
                    className="pointer-events-none"
                  />
                  <img
                    src={playlist.cover_url || "/placeholder.svg"}
                    alt={playlist.name}
                    className="w-10 h-10 rounded object-cover"
                  />
                  <div className="flex-1 text-left min-w-0">
                    <p className="font-medium text-foreground truncate">{playlist.name}</p>
                    {playlist.category && (
                      <p className="text-xs text-muted-foreground capitalize">{playlist.category}</p>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </ScrollArea>

        {/* Play Button */}
        <div className="pt-4 border-t border-border">
          <Button
            onClick={handlePlayMix}
            disabled={selectedIds.size === 0 || isPlaying}
            className="w-full gap-2"
          >
            <Play className="w-4 h-4" />
            {isPlaying ? "Loading..." : `Play Mix (${selectedIds.size} playlists)`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default QuickMixDialog;
