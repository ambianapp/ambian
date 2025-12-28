import { useState, useEffect } from "react";
import { Search, Clock, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getSignedAudioUrl } from "@/lib/storage";
import { useLanguage } from "@/contexts/LanguageContext";
import TrackRow from "./TrackRow";
import PlaylistCard from "./PlaylistCard";
import { Track } from "@/data/musicData";

interface DbTrack {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  duration: string | null;
  cover_url: string | null;
  audio_url: string | null;
  genre: string | null;
}

interface DbPlaylist {
  id: string;
  name: string;
  description: string | null;
  cover_url: string | null;
}

interface SearchViewProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  onTrackSelect: (track: Track, playlistTracks?: Track[]) => void;
  onPlaylistSelect?: (playlist: any) => void;
  onPlayPlaylist?: (playlistId: string) => void;
}

const RECENT_SEARCHES_KEY = "ambian_recent_searches";
const MAX_RECENT_SEARCHES = 8;

const SearchView = ({ currentTrack, isPlaying, onTrackSelect, onPlaylistSelect, onPlayPlaylist }: SearchViewProps) => {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [filteredTracks, setFilteredTracks] = useState<DbTrack[]>([]);
  const [filteredPlaylists, setFilteredPlaylists] = useState<DbPlaylist[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  // Load recent searches from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (stored) {
      try {
        setRecentSearches(JSON.parse(stored));
      } catch {
        setRecentSearches([]);
      }
    }
  }, []);

  // Save search to recent searches
  const saveRecentSearch = (searchQuery: string) => {
    if (!searchQuery.trim()) return;
    
    const updated = [
      searchQuery.trim(),
      ...recentSearches.filter(s => s.toLowerCase() !== searchQuery.trim().toLowerCase())
    ].slice(0, MAX_RECENT_SEARCHES);
    
    setRecentSearches(updated);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  };

  const removeRecentSearch = (searchToRemove: string) => {
    const updated = recentSearches.filter(s => s !== searchToRemove);
    setRecentSearches(updated);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  };

  const clearRecentSearches = () => {
    setRecentSearches([]);
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  };

  // Sanitize search query to escape ILIKE special characters
  const sanitizeSearchQuery = (q: string): string => {
    return q.slice(0, 100).replace(/[%_\\[\]]/g, '\\$&');
  };

  useEffect(() => {
    const searchData = async () => {
      const trimmed = query.trim();
      if (!trimmed) {
        setFilteredTracks([]);
        setFilteredPlaylists([]);
        return;
      }

      setIsLoading(true);
      const sanitized = sanitizeSearchQuery(trimmed);
      const searchTerm = `%${sanitized}%`;

      const [tracksResult, playlistsResult] = await Promise.all([
        supabase
          .from("tracks")
          .select("*")
          .or(`title.ilike.${searchTerm},artist.ilike.${searchTerm},genre.ilike.${searchTerm}`)
          .limit(20),
        supabase
          .from("playlists")
          .select("*")
          .or(`name.ilike.${searchTerm},description.ilike.${searchTerm}`)
          .limit(10),
      ]);

      setFilteredTracks(tracksResult.data || []);
      setFilteredPlaylists(playlistsResult.data || []);
      setIsLoading(false);

      // Save search if we got results
      if ((tracksResult.data?.length || 0) > 0 || (playlistsResult.data?.length || 0) > 0) {
        saveRecentSearch(query);
      }
    };

    const debounce = setTimeout(searchData, 300);
    return () => clearTimeout(debounce);
  }, [query]);

  const handleTrackSelect = async (dbTrack: DbTrack) => {
    const signedAudioUrl = await getSignedAudioUrl(dbTrack.audio_url);
    
    const playlistTracks: Track[] = filteredTracks.map(t => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      album: t.album || "",
      duration: t.duration || "0:00",
      cover: t.cover_url || "/placeholder.svg",
      genre: t.genre || "",
    }));
    
    onTrackSelect({
      id: dbTrack.id,
      title: dbTrack.title,
      artist: dbTrack.artist,
      album: dbTrack.album || "",
      duration: dbTrack.duration || "0:00",
      cover: dbTrack.cover_url || "/placeholder.svg",
      genre: dbTrack.genre || "",
      audioUrl: signedAudioUrl,
    }, playlistTracks);
  };

  const hasResults = filteredTracks.length > 0 || filteredPlaylists.length > 0;

  return (
    <div className="flex-1 overflow-y-auto pb-40 md:pb-32">
      <div className="p-6 md:p-8 space-y-8 pt-10 md:pt-6">
        {/* Search Input */}
        <div className="animate-fade-in">
          <div className="relative max-w-lg">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              type="text"
              placeholder={t("search.placeholder")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-12 h-12 bg-card border-border text-foreground placeholder:text-muted-foreground rounded-full text-base"
            />
          </div>
        </div>

        {/* Search Results or Recent Searches */}
        {query ? (
          <div className="space-y-8 animate-fade-in">
            {isLoading ? (
              <p className="text-muted-foreground">{t("search.searching")}</p>
            ) : !hasResults ? (
              <h2 className="text-xl font-bold text-foreground">{t("search.noResults")}</h2>
            ) : (
              <>
                {filteredPlaylists.length > 0 && (
                  <section>
                    <h2 className="text-xl font-bold text-foreground mb-4">{t("search.playlists")}</h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {filteredPlaylists.map((playlist) => (
                        <PlaylistCard
                          key={playlist.id}
                          playlist={{
                            id: playlist.id,
                            name: playlist.name,
                            description: playlist.description || "",
                            cover: playlist.cover_url || "/placeholder.svg",
                            trackCount: 0,
                            tracks: [],
                          }}
                          onClick={() => onPlaylistSelect?.({
                            id: playlist.id,
                            name: playlist.name,
                            description: playlist.description,
                            cover: playlist.cover_url,
                          })}
                          onPlay={() => onPlayPlaylist?.(playlist.id)}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {filteredTracks.length > 0 && (
                  <section>
                    <h2 className="text-xl font-bold text-foreground mb-4">{t("search.songs")}</h2>
                    <div className="bg-card/30 rounded-xl overflow-hidden">
                      {filteredTracks.map((track, index) => (
                        <TrackRow
                          key={track.id}
                          track={{
                            id: track.id,
                            title: track.title,
                            artist: track.artist,
                            album: track.album || "",
                            duration: track.duration || "0:00",
                            cover: track.cover_url || "/placeholder.svg",
                            genre: track.genre || "",
                          }}
                          index={index + 1}
                          isPlaying={isPlaying}
                          isCurrentTrack={currentTrack?.id === track.id}
                          onPlay={() => handleTrackSelect(track)}
                        />
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        ) : (
          <section className="animate-fade-in" style={{ animationDelay: "0.1s" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-foreground">{t("search.recentSearches")}</h2>
              {recentSearches.length > 0 && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-muted-foreground hover:text-foreground"
                  onClick={clearRecentSearches}
                >
                  {t("search.clearAll")}
                </Button>
              )}
            </div>
            
            {recentSearches.length > 0 ? (
              <div className="space-y-2">
                {recentSearches.map((search, index) => (
                  <div 
                    key={index}
                    className="flex items-center gap-3 p-3 rounded-lg bg-card/30 hover:bg-card/50 transition-colors group"
                  >
                    <Clock className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                    <button
                      className="flex-1 text-left text-foreground hover:text-primary transition-colors"
                      onClick={() => setQuery(search)}
                    >
                      {search}
                    </button>
                    <Button
                      variant="ghost"
                      size="iconSm"
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
                      onClick={() => removeRecentSearch(search)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">{t("search.noRecent")}</p>
            )}
          </section>
        )}
      </div>
    </div>
  );
};

export default SearchView;
