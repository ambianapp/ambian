import { useState, useRef, useEffect } from "react";
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Repeat, Repeat1, Shuffle, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePlayer } from "@/contexts/PlayerContext";
import { useToast } from "@/hooks/use-toast";

const PlayerBar = () => {
  const {
    currentTrack,
    isPlaying,
    shuffle,
    repeat,
    handlePlayPause,
    handleNext,
    handlePrevious,
    handleShuffleToggle,
    handleRepeatToggle,
    seekPosition,
    setSeekPosition,
  } = usePlayer();
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const [volume, setVolume] = useState([75]);
  const [progress, setProgress] = useState([0]);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  // Playback monitoring state
  const retryCountRef = useRef(0);
  const lastProgressTimeRef = useRef(Date.now());
  const stallCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const wasPlayingBeforeOfflineRef = useRef(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const maxRetries = 3;

  // Wake Lock API - prevents device from sleeping during playback
  useEffect(() => {
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator && isPlaying) {
        try {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
          console.log('Wake Lock acquired for continuous playback');
          
          wakeLockRef.current.addEventListener('release', () => {
            console.log('Wake Lock released');
          });
        } catch (err) {
          console.log('Wake Lock not available:', err);
        }
      }
    };

    const releaseWakeLock = () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    };

    if (isPlaying) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }

    // Re-acquire wake lock when page becomes visible again
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isPlaying) {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      releaseWakeLock();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isPlaying]);

  // Page visibility recovery - resume playback when tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && audioRef.current && isPlaying) {
        // Check if audio is actually playing, if not try to resume
        if (audioRef.current.paused) {
          console.log('Tab visible again, resuming playback...');
          audioRef.current.play().catch(() => {
            // If can't resume, skip to next
            handleNext();
          });
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isPlaying, handleNext]);

  // Handle audio errors with auto-recovery
  const handleAudioError = () => {
    const audio = audioRef.current;
    console.error("Audio error:", audio?.error?.code, audio?.error?.message);
    
    // Don't retry while offline - let the online handler deal with it
    if (isOffline) {
      wasPlayingBeforeOfflineRef.current = true;
      return;
    }
    
    if (retryCountRef.current < maxRetries) {
      retryCountRef.current++;
      console.log(`Retrying playback (attempt ${retryCountRef.current}/${maxRetries})...`);
      
      // Wait and retry
      setTimeout(() => {
        if (audioRef.current && currentTrack?.audioUrl) {
          audioRef.current.load();
          audioRef.current.play().catch(console.error);
        }
      }, 1000 * retryCountRef.current); // Exponential backoff
    } else {
      console.log("Max retries reached, skipping to next track");
      retryCountRef.current = 0;
      toast({
        title: "Playback issue",
        description: "Skipping to next track",
      });
      handleNext();
    }
  };

  // Handle stall/waiting events
  const handleStalled = () => {
    console.log("Audio stalled, attempting recovery...");
    if (audioRef.current && isPlaying) {
      // Try to resume playback
      setTimeout(() => {
        audioRef.current?.play().catch(console.error);
      }, 500);
    }
  };

  // Monitor for playback stalls (no progress for extended time)
  useEffect(() => {
    if (isPlaying && currentTrack?.audioUrl) {
      stallCheckIntervalRef.current = setInterval(() => {
        // Don't try recovery while offline - let the online handler deal with it
        if (isOffline) {
          return;
        }
        
        const now = Date.now();
        const timeSinceLastProgress = now - lastProgressTimeRef.current;
        
        // If no progress for 10 seconds while playing, try recovery
        if (timeSinceLastProgress > 10000 && audioRef.current && !audioRef.current.paused) {
          console.log("Detected playback stall, attempting recovery...");
          
          if (retryCountRef.current < maxRetries) {
            retryCountRef.current++;
            const currentPos = audioRef.current.currentTime;
            audioRef.current.load();
            audioRef.current.currentTime = currentPos;
            audioRef.current.play().catch(() => {
              // If recovery fails, skip to next
              retryCountRef.current = 0;
              handleNext();
            });
          } else {
            retryCountRef.current = 0;
            handleNext();
          }
        }
      }, 5000);
    }

    return () => {
      if (stallCheckIntervalRef.current) {
        clearInterval(stallCheckIntervalRef.current);
      }
    };
  }, [isPlaying, currentTrack, handleNext, isOffline]);

  // Reset retry count on successful track change
  useEffect(() => {
    retryCountRef.current = 0;
    lastProgressTimeRef.current = Date.now();
  }, [currentTrack?.id]);

  // Network-aware playback recovery
  useEffect(() => {
    const handleOnline = () => {
      console.log("Network connection restored, wasPlaying:", wasPlayingBeforeOfflineRef.current);
      setIsOffline(false);
      
      // If we were playing before going offline, automatically play the next song
      if (wasPlayingBeforeOfflineRef.current) {
        toast({
          title: "Connection restored",
          description: "Playing next track...",
        });
        
        retryCountRef.current = 0;
        
        // Play next song after a short delay to ensure network is stable
        setTimeout(() => {
          handleNext();
        }, 500);
      } else {
        toast({
          title: "Connection restored",
        });
      }
      
      wasPlayingBeforeOfflineRef.current = false;
    };

    const handleOffline = () => {
      console.log("Network connection lost, currently playing:", !audioRef.current?.paused);
      setIsOffline(true);
      // Check actual audio state, not React state which may be stale
      wasPlayingBeforeOfflineRef.current = audioRef.current ? !audioRef.current.paused : false;
      toast({
        title: "Connection lost",
        description: "Music will resume when connection returns",
        variant: "destructive",
      });
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [toast, handleNext]);

  // Media Session API for lock screen controls
  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentTrack) return;

    // Get absolute URL for cover image (iOS requires full URLs)
    const getCoverUrl = () => {
      if (!currentTrack.cover || currentTrack.cover === '/placeholder.svg') {
        return null;
      }
      // If already absolute URL, use as is
      if (currentTrack.cover.startsWith('http')) {
        return currentTrack.cover;
      }
      // Convert relative URL to absolute
      return `${window.location.origin}${currentTrack.cover}`;
    };

    const coverUrl = getCoverUrl();
    
    // Always use Ambian logo for lock screen artwork
    const logoUrl = `${window.location.origin}/ambian-logo.png`;
    
    // Set metadata
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title || 'Unknown Track',
      artist: 'Ambian',
      album: 'Ambian Music',
      artwork: [
        { src: logoUrl, sizes: '96x96', type: 'image/png' },
        { src: logoUrl, sizes: '128x128', type: 'image/png' },
        { src: logoUrl, sizes: '192x192', type: 'image/png' },
        { src: logoUrl, sizes: '256x256', type: 'image/png' },
        { src: logoUrl, sizes: '384x384', type: 'image/png' },
        { src: logoUrl, sizes: '512x512', type: 'image/png' },
      ],
    });

    // Set action handlers for next/previous (this shows track buttons instead of seek buttons)
    navigator.mediaSession.setActionHandler('play', () => {
      handlePlayPause();
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      handlePlayPause();
    });
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      handlePrevious();
    });
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      handleNext();
    });
    
    // Remove seek handlers to prevent 10-second skip buttons
    navigator.mediaSession.setActionHandler('seekbackward', null);
    navigator.mediaSession.setActionHandler('seekforward', null);

  }, [currentTrack, handlePlayPause, handlePrevious, handleNext]);

  // Update playback state for media session
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying]);

  const isUuid = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

  // Check if current track is liked
  useEffect(() => {
    const checkIfLiked = async () => {
      if (!user || !currentTrack) {
        setIsLiked(false);
        return;
      }

      // Demo/mock tracks use non-UUID ids; skip DB check for those.
      if (!isUuid(currentTrack.id)) {
        setIsLiked(false);
        return;
      }

      const { data } = await supabase
        .from("liked_songs")
        .select("id")
        .eq("user_id", user.id)
        .eq("track_id", currentTrack.id)
        .maybeSingle();

      setIsLiked(!!data);
    };

    checkIfLiked();
  }, [user, currentTrack]);

  const handleLikeToggle = async () => {
    if (!user || !currentTrack) {
      toast({
        title: "Sign in required",
        description: "Please sign in to like songs",
        variant: "destructive",
      });
      return;
    }

    if (!isUuid(currentTrack.id)) {
      toast({
        title: "Can't like this track",
        description: "Please play a library track first.",
        variant: "destructive",
      });
      return;
    }

    if (isLiked) {
      const { error } = await supabase
        .from("liked_songs")
        .delete()
        .eq("user_id", user.id)
        .eq("track_id", currentTrack.id);

      if (!error) {
        setIsLiked(false);
        toast({ title: "Removed from Liked Songs" });
      }
    } else {
      const { error } = await supabase
        .from("liked_songs")
        .insert({ user_id: user.id, track_id: currentTrack.id });

      if (!error) {
        setIsLiked(true);
        toast({ title: "Added to Liked Songs" });
      }
    }
  };

  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying && currentTrack?.audioUrl) {
        audioRef.current.play().catch(console.error);
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying, currentTrack]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume[0] / 100;
    }
  }, [volume, isMuted]);

  // Save current position for persistence
  const savePositionRef = useRef<NodeJS.Timeout | null>(null);
  
  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const time = audioRef.current.currentTime;
      setCurrentTime(time);
      const progressPercent = (time / audioRef.current.duration) * 100;
      setProgress([isNaN(progressPercent) ? 0 : progressPercent]);
      // Update last progress time for stall detection
      lastProgressTimeRef.current = Date.now();
      
      // Save position to localStorage (throttled)
      if (!savePositionRef.current) {
        savePositionRef.current = setTimeout(() => {
          try {
            const saved = localStorage.getItem("ambian_playback_state");
            if (saved) {
              const state = JSON.parse(saved);
              state.position = time;
              state.savedAt = Date.now();
              localStorage.setItem("ambian_playback_state", JSON.stringify(state));
            }
          } catch (e) {
            // Ignore errors
          }
          savePositionRef.current = null;
        }, 5000); // Save every 5 seconds
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
      
      // Seek to restored position if available
      if (seekPosition !== null && seekPosition > 0) {
        audioRef.current.currentTime = seekPosition;
        setSeekPosition(null);
      }
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
    <>
      {/* Hidden Audio Element */}
      {currentTrack.audioUrl && (
        <audio
          ref={audioRef}
          src={currentTrack.audioUrl}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onError={handleAudioError}
          onStalled={handleStalled}
          onWaiting={handleStalled}
          onEnded={() => {
            if (repeat === "one" && audioRef.current) {
              audioRef.current.currentTime = 0;
              audioRef.current.play();
            } else {
              handleNext();
            }
          }}
        />
      )}

      {/* Mobile Player Bar */}
      <div className="fixed bottom-[calc(72px+env(safe-area-inset-bottom))] md:hidden left-0 right-0 glass border-t border-border z-50 flex flex-col">
        {/* Full-width Progress Slider */}
        <div className="flex items-center gap-2 px-3 pt-2">
          <span className="text-[10px] text-muted-foreground w-8 text-right">{formatTime(currentTime)}</span>
          <Slider
            value={progress}
            onValueChange={handleProgressChange}
            max={100}
            step={0.1}
            className="flex-1 cursor-pointer [&_[role=slider]]:h-3 [&_[role=slider]]:w-3"
          />
          <span className="text-[10px] text-muted-foreground w-8">{formatTime(duration) || currentTrack.duration}</span>
        </div>
        
        {/* Track Info + Controls Row */}
        <div className="flex items-center justify-between px-3 py-2">
          {/* Track Info */}
          <div className="flex items-center gap-2 min-w-0 flex-1 max-w-[45%]">
            <div className="relative flex-shrink-0">
              <img
                src={currentTrack.cover}
                alt={currentTrack.title}
                className="w-10 h-10 rounded-md object-cover shadow-lg"
              />
              {isPlaying && (
                <div className="absolute inset-0 flex items-end justify-center gap-0.5 pb-1">
                  {[...Array(3)].map((_, i) => (
                    <div
                      key={i}
                      className="w-0.5 bg-primary rounded-full waveform-bar"
                      style={{ animationDelay: `${i * 0.15}s`, height: "25%" }}
                    />
                  ))}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground truncate text-xs">{currentTrack.title}</p>
              <p className="text-[10px] text-muted-foreground truncate">Ambian</p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="iconSm"
              onClick={handleShuffleToggle}
              className={cn("h-7 w-7", shuffle ? "text-primary" : "text-muted-foreground")}
            >
              <Shuffle className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="iconSm" onClick={handlePrevious} className="text-foreground h-8 w-8">
              <SkipBack className="w-4 h-4" />
            </Button>
            <Button variant="player" size="icon" onClick={handlePlayPause} className="h-10 w-10">
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </Button>
            <Button variant="ghost" size="iconSm" onClick={handleNext} className="text-foreground h-8 w-8">
              <SkipForward className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="iconSm"
              onClick={handleRepeatToggle}
              className={cn("h-7 w-7 relative", repeat !== "off" ? "text-primary" : "text-muted-foreground")}
            >
              {repeat === "one" ? <Repeat1 className="w-3.5 h-3.5" /> : <Repeat className="w-3.5 h-3.5" />}
              {repeat !== "off" && <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-primary rounded-full" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Desktop Player Bar */}
      <div className="fixed bottom-0 left-0 right-0 h-24 glass border-t border-border px-4 hidden md:flex items-center z-50">
        {/* Track Info */}
        <div className="flex items-center gap-4 w-72 min-w-0 flex-shrink-0">
          <div className="relative group flex-shrink-0">
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
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground truncate">{currentTrack.title}</p>
            <p className="text-sm text-muted-foreground truncate">Ambian</p>
          </div>
          <Button
            variant="ghost"
            size="iconSm"
            onClick={handleLikeToggle}
            className={cn(isLiked && "text-primary")}
          >
            <Heart className={cn("w-4 h-4", isLiked && "fill-current")} />
          </Button>
        </div>

        {/* Player Controls */}
        <div className="flex-1 flex flex-col items-center gap-2 max-w-2xl mx-auto">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="iconSm" 
              onClick={handleShuffleToggle}
              className={cn(shuffle ? "text-primary" : "text-muted-foreground hover:text-foreground")}
            >
              <Shuffle className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handlePrevious} className="text-foreground">
              <SkipBack className="w-5 h-5" />
            </Button>
            <Button variant="player" size="iconLg" onClick={handlePlayPause} className="h-12 w-12">
              {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={handleNext} className="text-foreground">
              <SkipForward className="w-5 h-5" />
            </Button>
            <Button 
              variant="ghost" 
              size="iconSm" 
              onClick={handleRepeatToggle}
              className={cn("relative", repeat !== "off" ? "text-primary" : "text-muted-foreground hover:text-foreground")}
            >
              {repeat === "one" ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
              {repeat !== "off" && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-primary rounded-full" />}
            </Button>
          </div>

          <div className="flex items-center gap-3 w-full">
            <span className="text-xs text-muted-foreground w-10 text-right">{formatTime(currentTime)}</span>
            <Slider
              value={progress}
              onValueChange={handleProgressChange}
              max={100}
              step={0.1}
              className="flex-1 cursor-pointer [&_[role=slider]]:h-4 [&_[role=slider]]:w-4"
            />
            <span className="text-xs text-muted-foreground w-10">{formatTime(duration) || currentTrack.duration}</span>
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
            className="w-24 cursor-pointer [&_[role=slider]]:h-3 [&_[role=slider]]:w-3"
          />
        </div>
      </div>
    </>
  );
};

export default PlayerBar;
