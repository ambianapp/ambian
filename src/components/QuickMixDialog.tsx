import { useState, useEffect } from "react";
import { Shuffle, Search, Check, Play, X, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
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
  onTrackSelect: (track: Track, playlistTracks?: Track[], isQuickMix?: boolean) => void;
  trigger?: React.ReactNode;
  likedOnly?: boolean; // When true, only show user's liked playlists
}

const QuickMixDialog = ({ onTrackSelect, trigger, likedOnly = false }: QuickMixDialogProps) => {
  const { user } = useAuth();
  const { t } = useLanguage();
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
    
    // Create a virtual "Liked Songs" playlist option
    const likedSongsPlaylist: DbPlaylist = {
      id: "liked-songs",
      name: t("library.likedSongs"),
      description: t("library.likedSongsDesc"),
      cover_url: null,
      category: null,
    };
    
    if (likedOnly && user) {
      // Fetch only the user's liked playlists
      const { data: likedData } = await supabase
        .from("liked_playlists")
        .select("playlist_id, playlists(id, name, description, cover_url, category)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      const playlists = likedData
        ?.map((item: any) => item.playlists)
        .filter(Boolean) || [];
      
      // Add Liked Songs at the top
      const allWithLiked = [likedSongsPlaylist, ...playlists];
      setAllPlaylists(allWithLiked);
      setFilteredPlaylists(allWithLiked);
    } else {
      // Fetch all system/public playlists
      const { data } = await supabase
        .from("playlists")
        .select("id, name, description, cover_url, category")
        .or("is_system.eq.true,is_public.eq.true")
        .order("name", { ascending: true });

      // Add Liked Songs at the top
      const allWithLiked = [likedSongsPlaylist, ...(data || [])];
      setAllPlaylists(allWithLiked);
      setFilteredPlaylists(allWithLiked);
    }
    
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
      const allTracks: Track[] = [];
      const selectedArray = Array.from(selectedIds);
      const hasLikedSongs = selectedArray.includes("liked-songs");
      const playlistIds = selectedArray.filter(id => id !== "liked-songs");

      // Fetch tracks from liked_songs if selected
      if (hasLikedSongs && user) {
        const { data: likedTracksData } = await supabase
          .from("liked_songs")
          .select("tracks(*)")
          .eq("user_id", user.id);

        if (likedTracksData) {
          const likedTracks = likedTracksData
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
          allTracks.push(...likedTracks);
        }
      }

      // Fetch tracks from regular playlists
      if (playlistIds.length > 0) {
        const { data: playlistTracksData } = await supabase
          .from("playlist_tracks")
          .select("tracks(*), playlist_id")
          .in("playlist_id", playlistIds);

        if (playlistTracksData) {
          const playlistTracks = playlistTracksData
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
          allTracks.push(...playlistTracks);
        }
      }

      if (allTracks.length === 0) {
        setIsPlaying(false);
        return;
      }

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

      // Log play history (skip liked-songs virtual ID)
      if (user) {
        for (const playlistId of playlistIds) {
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
      }, shuffledTracks, true);
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
            {t("quickMix.button")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shuffle className="w-5 h-5 text-primary" />
            {t("quickMix.title")}
          </DialogTitle>
        </DialogHeader>
        
        <p className="text-sm text-muted-foreground">
          {t("quickMix.description")}
        </p>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("quickMix.searchPlaylists")}
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
              ? t("quickMix.deselectAll")
              : t("quickMix.selectAll")}
          </Button>
          {selectedIds.size > 0 && (
            <span className="text-sm text-muted-foreground">
              {t("quickMix.selected").replace("{count}", String(selectedIds.size))}
            </span>
          )}
        </div>

        {/* Playlist List */}
        <div className="flex-1 min-h-0 h-[300px] -mx-6 px-6 overflow-y-auto overscroll-contain">
          <div className="space-y-1 py-2">
            {isLoading ? (
              <p className="text-center text-muted-foreground py-8">{t("quickMix.loading")}</p>
            ) : filteredPlaylists.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">{t("quickMix.noPlaylists")}</p>
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
                  <Checkbox checked={selectedIds.has(playlist.id)} className="pointer-events-none" />
                  {playlist.id === "liked-songs" ? (
                    <div className="w-10 h-10 rounded bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center">
                      <Heart className="w-5 h-5 text-primary-foreground fill-primary-foreground" />
                    </div>
                  ) : (
                    <img
                      src={playlist.cover_url || "/placeholder.svg"}
                      alt={playlist.name}
                      className="w-10 h-10 rounded object-cover"
                    />
                  )}
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
        </div>

        {/* Play Button */}
        <div className="pt-4 border-t border-border">
          <Button
            onClick={handlePlayMix}
            disabled={selectedIds.size === 0 || isPlaying}
            className="w-full gap-2"
          >
            <Play className="w-4 h-4" />
            {isPlaying 
              ? t("quickMix.loadingPlay")
              : t("quickMix.playMix").replace("{count}", String(selectedIds.size))}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default QuickMixDialog;
