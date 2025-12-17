import { Plus, List, Grid3X3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { playlists } from "@/data/musicData";
import { Track } from "@/data/musicData";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface LibraryViewProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  onTrackSelect: (track: Track) => void;
}

const LibraryView = ({ currentTrack, isPlaying, onTrackSelect }: LibraryViewProps) => {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  return (
    <div className="flex-1 overflow-y-auto pb-32">
      <div className="p-6 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between animate-fade-in">
          <h1 className="text-2xl font-bold text-foreground">Your Library</h1>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
              <Plus className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-1 bg-secondary rounded-lg p-1">
              <Button
                variant="ghost"
                size="iconSm"
                className={cn(viewMode === "list" && "bg-muted")}
                onClick={() => setViewMode("list")}
              >
                <List className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="iconSm"
                className={cn(viewMode === "grid" && "bg-muted")}
                onClick={() => setViewMode("grid")}
              >
                <Grid3X3 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <Button variant="secondary" size="sm" className="rounded-full">
            Playlists
          </Button>
          <Button variant="ghost" size="sm" className="rounded-full text-muted-foreground">
            Artists
          </Button>
          <Button variant="ghost" size="sm" className="rounded-full text-muted-foreground">
            Albums
          </Button>
        </div>

        {/* Content */}
        <div
          className={cn(
            "animate-fade-in",
            viewMode === "grid"
              ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
              : "space-y-2"
          )}
          style={{ animationDelay: "0.2s" }}
        >
          {playlists.map((playlist) =>
            viewMode === "grid" ? (
              <button
                key={playlist.id}
                className="group p-4 rounded-xl bg-card/50 hover:bg-card transition-all duration-300 text-left"
                onClick={() => onTrackSelect(playlist.tracks[0])}
              >
                <img
                  src={playlist.cover}
                  alt={playlist.name}
                  className="w-full aspect-square object-cover rounded-lg shadow-lg mb-4"
                />
                <h3 className="font-semibold text-foreground truncate">{playlist.name}</h3>
                <p className="text-sm text-muted-foreground">{playlist.trackCount} songs</p>
              </button>
            ) : (
              <button
                key={playlist.id}
                className="flex items-center gap-4 p-3 rounded-lg bg-card/30 hover:bg-card/50 transition-colors w-full text-left"
                onClick={() => onTrackSelect(playlist.tracks[0])}
              >
                <img
                  src={playlist.cover}
                  alt={playlist.name}
                  className="w-14 h-14 object-cover rounded-lg"
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground truncate">{playlist.name}</h3>
                  <p className="text-sm text-muted-foreground">Playlist • {playlist.trackCount} songs</p>
                </div>
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
};

export default LibraryView;
