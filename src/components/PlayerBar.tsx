import { useState } from "react";
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Repeat, Shuffle, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Track } from "@/data/musicData";
import { cn } from "@/lib/utils";

interface PlayerBarProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
}

const PlayerBar = ({ currentTrack, isPlaying, onPlayPause, onNext, onPrevious }: PlayerBarProps) => {
  const [volume, setVolume] = useState([75]);
  const [progress, setProgress] = useState([35]);
  const [isMuted, setIsMuted] = useState(false);
  const [isLiked, setIsLiked] = useState(false);

  if (!currentTrack) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 h-24 glass border-t border-border px-4 flex items-center z-50">
      {/* Track Info */}
      <div className="flex items-center gap-4 w-72">
        <div className="relative group">
          <img
            src={currentTrack.cover}
            alt={currentTrack.title}
            className="w-14 h-14 rounded-lg object-cover shadow-lg"
          />
          {isPlaying && (
            <div className="absolute inset-0 flex items-end justify-center gap-0.5 pb-2">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="w-1 bg-primary rounded-full waveform-bar"
                  style={{ animationDelay: `${i * 0.15}s`, height: "30%" }}
                />
              ))}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground truncate">{currentTrack.title}</p>
          <p className="text-sm text-muted-foreground truncate">{currentTrack.artist}</p>
        </div>
        <Button
          variant="ghost"
          size="iconSm"
          onClick={() => setIsLiked(!isLiked)}
          className={cn(isLiked && "text-primary")}
        >
          <Heart className={cn("w-4 h-4", isLiked && "fill-current")} />
        </Button>
      </div>

      {/* Player Controls */}
      <div className="flex-1 flex flex-col items-center gap-2 max-w-2xl mx-auto">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="iconSm" className="text-muted-foreground hover:text-foreground">
            <Shuffle className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onPrevious} className="text-foreground">
            <SkipBack className="w-5 h-5" />
          </Button>
          <Button variant="player" size="iconLg" onClick={onPlayPause}>
            {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={onNext} className="text-foreground">
            <SkipForward className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="iconSm" className="text-muted-foreground hover:text-foreground">
            <Repeat className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex items-center gap-3 w-full">
          <span className="text-xs text-muted-foreground w-10 text-right">1:23</span>
          <Slider
            value={progress}
            onValueChange={setProgress}
            max={100}
            step={1}
            className="flex-1"
          />
          <span className="text-xs text-muted-foreground w-10">{currentTrack.duration}</span>
        </div>
      </div>

      {/* Volume Control */}
      <div className="flex items-center gap-3 w-48 justify-end">
        <Button
          variant="ghost"
          size="iconSm"
          onClick={() => setIsMuted(!isMuted)}
          className="text-muted-foreground hover:text-foreground"
        >
          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </Button>
        <Slider
          value={isMuted ? [0] : volume}
          onValueChange={setVolume}
          max={100}
          step={1}
          className="w-24"
        />
      </div>
    </div>
  );
};

export default PlayerBar;
