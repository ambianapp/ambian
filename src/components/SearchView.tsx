import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { genres, tracks, playlists } from "@/data/musicData";
import GenreCard from "./GenreCard";
import TrackRow from "./TrackRow";
import { Track } from "@/data/musicData";

interface SearchViewProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  onTrackSelect: (track: Track) => void;
}

const SearchView = ({ currentTrack, isPlaying, onTrackSelect }: SearchViewProps) => {
  const [query, setQuery] = useState("");

  const filteredTracks = query
    ? tracks.filter(
        (track) =>
          track.title.toLowerCase().includes(query.toLowerCase()) ||
          track.artist.toLowerCase().includes(query.toLowerCase()) ||
          track.genre.toLowerCase().includes(query.toLowerCase())
      )
    : [];

  return (
    <div className="flex-1 overflow-y-auto pb-32">
      <div className="p-6 md:p-8 space-y-8">
        {/* Search Input */}
        <div className="animate-fade-in">
          <div className="relative max-w-lg">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="What do you want to listen to?"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-12 h-12 bg-card border-border text-foreground placeholder:text-muted-foreground rounded-full text-base"
            />
          </div>
        </div>

        {/* Search Results or Browse */}
        {query ? (
          <section className="animate-fade-in">
            <h2 className="text-xl font-bold text-foreground mb-4">
              {filteredTracks.length > 0 ? "Results" : "No results found"}
            </h2>
            {filteredTracks.length > 0 && (
              <div className="bg-card/30 rounded-xl overflow-hidden">
                {filteredTracks.map((track, index) => (
                  <TrackRow
                    key={track.id}
                    track={track}
                    index={index + 1}
                    isPlaying={isPlaying}
                    isCurrentTrack={currentTrack?.id === track.id}
                    onPlay={() => onTrackSelect(track)}
                  />
                ))}
              </div>
            )}
          </section>
        ) : (
          <section className="animate-fade-in" style={{ animationDelay: "0.1s" }}>
            <h2 className="text-xl font-bold text-foreground mb-4">Browse All</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {genres.map((genre) => (
                <GenreCard key={genre.id} genre={genre} onClick={() => setQuery(genre.name)} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default SearchView;
