import { useState, useRef, useEffect } from "react";
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Repeat, Shuffle, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Track } from "@/data/musicData";
import { cn } from "@/lib/utils";

interface PlayerBarProps {
  currentTrack: (Track & { audioUrl?: string }) | null;
  isPlaying: boolean;
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
}

const PlayerBar = ({ currentTrack, isPlaying, onPlayPause, onNext, onPrevious }: PlayerBarProps) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [volume, setVolume] = useState([75]);
  const [progress, setProgress] = useState([0]);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isLiked, setIsLiked] = useState(false);

  // Play/pause audio when isPlaying changes
  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying && currentTrack?.audioUrl) {
        audioRef.current.play().catch(console.error);
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying, currentTrack]);

  // Update volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume[0] / 100;
    }
  }, [volume, isMuted]);

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      const progressPercent = (audioRef.current.currentTime / audioRef.current.duration) * 100;
      setProgress([isNaN(progressPercent) ? 0 : progressPercent]);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleProgressChange = (value: number[]) => {
    if (audioRef.current && duration) {
      const newTime = (value[0] / 100) * duration;
      audioRef.current.currentTime = newTime;
      setProgress(value);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (!currentTrack) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 h-20 md:h-24 glass border-t border-border px-2 md:px-4 flex items-center z-50">
      {/* Hidden Audio Element */}
      {currentTrack.audioUrl && (
        <audio
          ref={audioRef}
          src={currentTrack.audioUrl}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={onNext}
        />
      )}

      {/* Track Info - Smaller on mobile */}
      <div className="flex items-center gap-2 md:gap-4 w-auto md:w-72 min-w-0 flex-shrink-0">
        <div className="relative group flex-shrink-0">
          <img
            src={currentTrack.cover}
            alt={currentTrack.title}
            className="w-12 h-12 md:w-14 md:h-14 rounded-lg object-cover shadow-lg"
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
        <div className="min-w-0 flex-1 md:flex-initial">
          <p className="font-semibold text-foreground truncate text-sm md:text-base">{currentTrack.title}</p>
          <p className="text-xs md:text-sm text-muted-foreground truncate">{currentTrack.artist}</p>
        </div>
        <Button
          variant="ghost"
          size="iconSm"
          onClick={() => setIsLiked(!isLiked)}
          className={cn("hidden md:flex", isLiked && "text-primary")}
        >
          <Heart className={cn("w-4 h-4", isLiked && "fill-current")} />
        </Button>
      </div>

      {/* Player Controls - Centered */}
      <div className="flex-1 flex flex-col items-center gap-1 md:gap-2 max-w-2xl mx-2 md:mx-auto">
        <div className="flex items-center gap-2 md:gap-4">
          <Button variant="ghost" size="iconSm" className="hidden md:flex text-muted-foreground hover:text-foreground">
            <Shuffle className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onPrevious} className="text-foreground h-8 w-8 md:h-10 md:w-10">
            <SkipBack className="w-4 h-4 md:w-5 md:h-5" />
          </Button>
          <Button variant="player" size="iconLg" onClick={onPlayPause} className="h-10 w-10 md:h-12 md:w-12">
            {isPlaying ? <Pause className="w-5 h-5 md:w-6 md:h-6" /> : <Play className="w-5 h-5 md:w-6 md:h-6 ml-0.5" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={onNext} className="text-foreground h-8 w-8 md:h-10 md:w-10">
            <SkipForward className="w-4 h-4 md:w-5 md:h-5" />
          </Button>
          <Button variant="ghost" size="iconSm" className="hidden md:flex text-muted-foreground hover:text-foreground">
            <Repeat className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2 md:gap-3 w-full">
          <span className="text-xs text-muted-foreground w-8 md:w-10 text-right">{formatTime(currentTime)}</span>
          <Slider
            value={progress}
            onValueChange={handleProgressChange}
            max={100}
            step={0.1}
            className="flex-1"
          />
          <span className="text-xs text-muted-foreground w-8 md:w-10">{formatTime(duration) || currentTrack.duration}</span>
        </div>
      </div>

      {/* Volume Control - Hidden on mobile */}
      <div className="hidden md:flex items-center gap-3 w-48 justify-end">
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
