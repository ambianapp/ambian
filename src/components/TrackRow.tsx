import { Play, Pause, MoreHorizontal, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Track } from "@/data/musicData";
import { cn } from "@/lib/utils";

interface TrackRowProps {
  track: Track;
  index: number;
  isPlaying: boolean;
  isCurrentTrack: boolean;
  onPlay: () => void;
}

const TrackRow = ({ track, index, isPlaying, isCurrentTrack, onPlay }: TrackRowProps) => {
  return (
    <div
      className={cn(
        "group grid grid-cols-[auto_1fr_auto] md:grid-cols-[auto_1fr_auto_auto] gap-2 md:gap-4 items-center px-3 md:px-4 py-3 rounded-lg transition-colors",
        isCurrentTrack ? "bg-secondary" : "hover:bg-secondary/50"
      )}
    >
      <div className="w-6 md:w-8 flex items-center justify-center">
        <span className={cn("text-sm text-muted-foreground group-hover:hidden", isCurrentTrack && "text-primary")}>
          {index}
        </span>
        <Button
          variant="ghost"
          size="iconSm"
          className="hidden group-hover:flex h-6 w-6 md:h-8 md:w-8"
          onClick={onPlay}
        >
          {isPlaying && isCurrentTrack ? (
            <Pause className="w-3 h-3 md:w-4 md:h-4" />
          ) : (
            <Play className="w-3 h-3 md:w-4 md:h-4" />
          )}
        </Button>
      </div>

      <div className="flex items-center gap-2 md:gap-4 min-w-0 overflow-hidden">
        <img
          src={track.cover}
          alt={track.title}
          className="w-9 h-9 md:w-10 md:h-10 rounded object-cover flex-shrink-0"
        />
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className={cn("font-medium truncate text-sm md:text-base", isCurrentTrack ? "text-primary" : "text-foreground")}>
            {track.title}
          </p>
          <p className="text-xs md:text-sm text-muted-foreground truncate">{track.artist}</p>
        </div>
      </div>

      <div className="hidden md:flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button variant="ghost" size="iconSm" className="text-muted-foreground hover:text-foreground">
          <Heart className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex items-center gap-1 md:gap-4">
        <span className="text-xs md:text-sm text-muted-foreground w-10 md:w-12 text-right">{track.duration}</span>
        <Button variant="ghost" size="iconSm" className="hidden md:flex opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground">
          <MoreHorizontal className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};

export default TrackRow;
