import { useState, useRef, useEffect, useCallback } from "react";
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Repeat, Repeat1, Shuffle, Heart, Disc3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePlayer } from "@/contexts/PlayerContext";
import { useToast } from "@/hooks/use-toast";

const CROSSFADE_DURATION = 5; // seconds

const PlayerBar = () => {
  const {
    currentTrack,
    isPlaying,
    shuffle,
    repeat,
    crossfade,
    handlePlayPause,
    handleNext,
    handlePrevious,
    handleShuffleToggle,
    handleRepeatToggle,
    handleCrossfadeToggle,
    seekPosition,
    setSeekPosition,
    getNextTrack,
    pendingScheduledTransition,
    clearScheduledTransition,
    playlistTracksRef,
  } = usePlayer();
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const crossfadeAudioRef = useRef<HTMLAudioElement>(null);
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

  // Crossfade state
  const isCrossfadingRef = useRef(false);
  const crossfadeIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const nextTrackPreloadedRef = useRef<string | null>(null);
  const [isCrossfadeActive, setIsCrossfadeActive] = useState(false);
  const preloadedNextTrackRef = useRef<{ id: string; audioUrl: string } | null>(null);
  const isPreloadingRef = useRef(false);
  const userVolumeRef = useRef(75); // Store user's intended volume
  const mainAudioSrcRef = useRef<string | null>(null); // Prevent React re-setting src during crossfade

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

  // Keep main audio element src stable (avoid restarting the next track when PlayerContext changes during crossfade)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack?.audioUrl) return;

    // During crossfade, the main <audio> must NOT be forced to load the new track via React.
    if (crossfade && (isCrossfadingRef.current || isCrossfadeActive)) return;

    if (mainAudioSrcRef.current !== currentTrack.audioUrl) {
      mainAudioSrcRef.current = currentTrack.audioUrl;
      audio.src = currentTrack.audioUrl;
      audio.load();
    }

    if (isPlaying) {
      audio.play().catch(console.error);
    }
  }, [currentTrack?.audioUrl, crossfade, isCrossfadeActive, isPlaying]);

  useEffect(() => {
    const activeAudio = isCrossfadeActive ? crossfadeAudioRef.current : audioRef.current;
    if (activeAudio) {
      if (isPlaying && (currentTrack?.audioUrl || isCrossfadeActive)) {
        activeAudio.play().catch(console.error);
      } else {
        activeAudio.pause();
      }
    }
  }, [isPlaying, currentTrack, isCrossfadeActive]);

  useEffect(() => {
    const activeAudio = isCrossfadeActive ? crossfadeAudioRef.current : audioRef.current;
    if (activeAudio) {
      activeAudio.volume = isMuted ? 0 : Math.min(1, volume[0] / 100);
    }
  }, [volume, isMuted, isCrossfadeActive]);

  // Crossfade logic
  const crossfadeCompleteRef = useRef(false);
  const crossfadeTrackSwitchedRef = useRef(false);
  
  // Keep user volume in sync
  useEffect(() => {
    userVolumeRef.current = volume[0];
  }, [volume]);
  
  // Preload next track when current track is playing (well ahead of crossfade point)
  useEffect(() => {
    if (!crossfade || !isPlaying || !duration || repeat === "one") return;
    
    const preloadAheadTime = CROSSFADE_DURATION + 10; // Preload 15 seconds before end
    const timeRemaining = duration - currentTime;
    
    // Start preloading when we're approaching the crossfade point
    if (timeRemaining <= preloadAheadTime && timeRemaining > CROSSFADE_DURATION + 5 && !isPreloadingRef.current && !preloadedNextTrackRef.current) {
      isPreloadingRef.current = true;
      
      getNextTrack().then(nextTrack => {
        if (nextTrack?.audioUrl && crossfadeAudioRef.current) {
          console.log('Preloading next track for crossfade:', nextTrack.id);
          preloadedNextTrackRef.current = { id: nextTrack.id, audioUrl: nextTrack.audioUrl };
          
          // Preload by setting src and loading (but not playing)
          crossfadeAudioRef.current.src = nextTrack.audioUrl;
          crossfadeAudioRef.current.volume = 0;
          crossfadeAudioRef.current.load();
        }
        isPreloadingRef.current = false;
      }).catch(() => {
        isPreloadingRef.current = false;
      });
    }
  }, [currentTime, duration, crossfade, isPlaying, repeat, getNextTrack]);
  
  // Start crossfade when approaching end of track
  const startCrossfade = useCallback(() => {
    if (isCrossfadingRef.current || !crossfade || repeat === "one") return;
    if (!crossfadeAudioRef.current || !audioRef.current) return;
    
    // Check if preloaded track is ready
    if (!preloadedNextTrackRef.current || !crossfadeAudioRef.current.src) {
      console.log('Crossfade: next track not preloaded, skipping crossfade');
      return;
    }
    
    console.log('Starting crossfade');
    isCrossfadingRef.current = true;
    crossfadeCompleteRef.current = false;
    crossfadeTrackSwitchedRef.current = false;
    nextTrackPreloadedRef.current = preloadedNextTrackRef.current.id;
    
    const mainAudio = audioRef.current;
    const crossfadeAudio = crossfadeAudioRef.current;
    const targetVolume = isMuted ? 0 : Math.min(1, userVolumeRef.current / 100);
    
    // Start playing crossfade audio (already preloaded)
    crossfadeAudio.volume = 0;
    crossfadeAudio.play().catch(console.error);
    
    const steps = 50;
    const stepTime = (CROSSFADE_DURATION * 1000) / steps;
    let step = 0;
    const startVolume = mainAudio.volume;
    
    crossfadeIntervalRef.current = setInterval(() => {
      step++;
      const progress = Math.min(1, step / steps);
      
      // Fade out main, fade in crossfade
      mainAudio.volume = Math.max(0, startVolume * (1 - progress));
      crossfadeAudio.volume = Math.max(0, Math.min(1, targetVolume * progress));
      
      if (step >= steps) {
        if (crossfadeIntervalRef.current) {
          clearInterval(crossfadeIntervalRef.current);
          crossfadeIntervalRef.current = null;
        }
        crossfadeCompleteRef.current = true;
        
        // Crossfade complete - switch to crossfade audio as main player
        if (!crossfadeTrackSwitchedRef.current) {
          crossfadeTrackSwitchedRef.current = true;
          
          // Ensure crossfade audio is at correct volume
          crossfadeAudio.volume = targetVolume;
          
          // Pause and reset main audio
          mainAudio.pause();
          
          // Update state and call handleNext to sync PlayerContext
          setIsCrossfadeActive(true);
          if (crossfadeAudio.duration) {
            setDuration(crossfadeAudio.duration);
          }
          handleNext();
        }
      }
    }, stepTime);
  }, [crossfade, repeat, isMuted, handleNext]);

  // Monitor for crossfade trigger point
  useEffect(() => {
    if (!crossfade || !isPlaying || repeat === "one" || isCrossfadingRef.current) return;

    const audio = audioRef.current;
    if (!audio || !isFinite(audio.duration) || audio.duration === 0) return;

    const timeRemaining = audio.duration - audio.currentTime;

    // Trigger once when we enter the crossfade window
    if (timeRemaining <= CROSSFADE_DURATION && timeRemaining > 0.25) {
      startCrossfade();
    }
  }, [currentTime, crossfade, isPlaying, repeat, startCrossfade]);

  // Cleanup crossfade on track change
  useEffect(() => {
    // If crossfade completed and we're using crossfade audio as main, swap back
    if (isCrossfadeActive && crossfadeAudioRef.current && !crossfadeAudioRef.current.paused) {
      const crossfadeAudio = crossfadeAudioRef.current;
      const mainAudio = audioRef.current;
      
      if (mainAudio && crossfadeAudio.src) {
        // Copy crossfade audio state to main
        const currentSrc = crossfadeAudio.src;
        const currentTimePos = crossfadeAudio.currentTime;
        const targetVolume = isMuted ? 0 : Math.min(1, userVolumeRef.current / 100);

        mainAudioSrcRef.current = currentSrc;
        mainAudio.src = currentSrc;
        mainAudio.currentTime = currentTimePos;
        mainAudio.volume = targetVolume;
        mainAudio.play().catch(console.error);
        
        // Clean up crossfade
        crossfadeAudio.pause();
        crossfadeAudio.src = "";
        setIsCrossfadeActive(false);
        isCrossfadingRef.current = false;
        crossfadeCompleteRef.current = false;
        crossfadeTrackSwitchedRef.current = false;
        nextTrackPreloadedRef.current = null;
        preloadedNextTrackRef.current = null;
      }
      return;
    }
    
    return () => {
      if (crossfadeIntervalRef.current) {
        clearInterval(crossfadeIntervalRef.current);
        crossfadeIntervalRef.current = null;
      }
      isCrossfadingRef.current = false;
      crossfadeCompleteRef.current = false;
      crossfadeTrackSwitchedRef.current = false;
      nextTrackPreloadedRef.current = null;
      preloadedNextTrackRef.current = null;
      isPreloadingRef.current = false;
      if (!isCrossfadeActive && crossfadeAudioRef.current) {
        crossfadeAudioRef.current.pause();
        crossfadeAudioRef.current.src = "";
      }
      setIsCrossfadeActive(false);
    };
  }, [currentTrack?.id, isCrossfadeActive, isMuted]);

  // Handle crossfade audio ending
  const handleCrossfadeEnded = useCallback(() => {
    // Reset state and go to next
    isCrossfadingRef.current = false;
    crossfadeCompleteRef.current = false;
    crossfadeTrackSwitchedRef.current = false;
    nextTrackPreloadedRef.current = null;
    preloadedNextTrackRef.current = null;
    isPreloadingRef.current = false;
    setIsCrossfadeActive(false);
    handleNext();
  }, [handleNext]);

  // Handle scheduled playlist crossfade transition
  useEffect(() => {
    if (!pendingScheduledTransition || !audioRef.current) return;

    const { track, playlist } = pendingScheduledTransition;
    
    // If crossfade is enabled and we have audio playing, do a smooth transition
    if (crossfade && isPlaying && currentTrack?.audioUrl && track.audioUrl && crossfadeAudioRef.current) {
      // Perform crossfade to new scheduled track
      isCrossfadingRef.current = true;
      
      crossfadeAudioRef.current.src = track.audioUrl;
      crossfadeAudioRef.current.volume = 0;
      crossfadeAudioRef.current.play().catch(console.error);
      
      const mainAudio = audioRef.current;
      const crossfadeAudio = crossfadeAudioRef.current;
      const startVolume = isMuted ? 0 : Math.min(1, volume[0] / 100);
      const targetVolume = isMuted ? 0 : Math.min(1, volume[0] / 100);
      const steps = 50;
      const stepTime = (CROSSFADE_DURATION * 1000) / steps;
      let step = 0;
      
      const intervalId = setInterval(() => {
        step++;
        const progress = Math.min(1, step / steps);
        
        mainAudio.volume = Math.max(0, Math.min(1, startVolume * (1 - progress)));
        crossfadeAudio.volume = Math.max(0, Math.min(1, targetVolume * progress));
        
        if (step >= steps) {
          clearInterval(intervalId);
          
          // Swap: update playlist and set crossfade audio as main
          playlistTracksRef.current = playlist;
          mainAudio.src = track.audioUrl!;
          mainAudio.volume = targetVolume;
          mainAudio.play().catch(console.error);
          
          crossfadeAudio.pause();
          crossfadeAudio.src = "";
          
          isCrossfadingRef.current = false;
          clearScheduledTransition();
        }
      }, stepTime);
      
      return () => clearInterval(intervalId);
    } else {
      // No crossfade - just switch directly (handled by PlayerContext)
      clearScheduledTransition();
    }
  }, [pendingScheduledTransition, crossfade, isPlaying, currentTrack?.audioUrl, volume, isMuted, clearScheduledTransition]);

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
    const activeAudio = isCrossfadeActive ? crossfadeAudioRef.current : audioRef.current;
    if (activeAudio && duration) {
      const newTime = (value[0] / 100) * duration;
      activeAudio.currentTime = newTime;
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
      {/* Hidden Audio Elements */}
      {currentTrack.audioUrl && (
        <audio
          ref={audioRef}
          preload="auto"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onError={handleAudioError}
          onStalled={handleStalled}
          onWaiting={handleStalled}
          onEnded={() => {
            if (repeat === "one" && audioRef.current) {
              audioRef.current.currentTime = 0;
              audioRef.current.play();
              return;
            }

            // If crossfade is in progress or active, DO NOT start the next track from the main player.
            // The crossfade audio is responsible for continuing playback.
            if (crossfade && (isCrossfadingRef.current || isCrossfadeActive)) {
              return;
            }

            // Normal case - no crossfade, go to next track
            if (crossfadeIntervalRef.current) {
              clearInterval(crossfadeIntervalRef.current);
              crossfadeIntervalRef.current = null;
            }
            isCrossfadingRef.current = false;
            crossfadeCompleteRef.current = false;
            crossfadeTrackSwitchedRef.current = false;
            preloadedNextTrackRef.current = null;
            isPreloadingRef.current = false;
            if (crossfadeAudioRef.current) {
              crossfadeAudioRef.current.pause();
              crossfadeAudioRef.current.src = "";
            }
            handleNext();
          }}
        />
      )}
      {/* Hidden crossfade audio element - preloaded ahead of time */}
      <audio 
        ref={crossfadeAudioRef}
        preload="auto"
        onEnded={handleCrossfadeEnded}
        onTimeUpdate={() => {
          // Update UI time when crossfade audio is the active player
          if (isCrossfadeActive && crossfadeAudioRef.current) {
            const time = crossfadeAudioRef.current.currentTime;
            setCurrentTime(time);
            const progressPercent = (time / crossfadeAudioRef.current.duration) * 100;
            setProgress([isNaN(progressPercent) ? 0 : progressPercent]);
            lastProgressTimeRef.current = Date.now();
          }
        }}
        onLoadedMetadata={() => {
          if (isCrossfadeActive && crossfadeAudioRef.current) {
            setDuration(crossfadeAudioRef.current.duration);
          }
        }}
      />

      {/* Mobile Player Bar */}
      <div className="fixed bottom-[calc(56px+var(--safe-bottom-tight))] md:hidden left-0 right-0 glass border-t border-border z-50 flex flex-col">
        {/* Track Info Row */}
        <div className="flex items-center gap-3 px-3 pt-2">
          <img
            src={currentTrack.cover}
            alt={currentTrack.title}
            className="w-10 h-10 rounded-md object-cover shadow-lg flex-shrink-0"
          />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground truncate text-sm">{currentTrack.title}</p>
            <p className="text-xs text-muted-foreground truncate">Ambian</p>
          </div>
          <Button
            variant="ghost"
            size="iconSm"
            onClick={handleLikeToggle}
            className={cn("h-8 w-8", isLiked && "text-primary")}
          >
            <Heart className={cn("w-4 h-4", isLiked && "fill-current")} />
          </Button>
        </div>

        {/* Progress Slider */}
        <div className="flex items-center gap-2 px-3 pt-1">
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
        
        {/* Controls Row */}
        <div className="flex items-center justify-center gap-2 px-3 py-2">
          <Button
            variant="ghost"
            size="iconSm"
            onClick={handleShuffleToggle}
            className={cn("h-8 w-8", shuffle ? "text-primary" : "text-muted-foreground")}
          >
            <Shuffle className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handlePrevious} className="text-foreground h-10 w-10">
            <SkipBack className="w-5 h-5" />
          </Button>
          <Button variant="player" size="icon" onClick={handlePlayPause} className="h-12 w-12">
            {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={handleNext} className="text-foreground h-10 w-10">
            <SkipForward className="w-5 h-5" />
          </Button>
          <Button
            variant="ghost"
            size="iconSm"
            onClick={handleRepeatToggle}
            className={cn("h-8 w-8 relative", repeat !== "off" ? "text-primary" : "text-muted-foreground")}
          >
            {repeat === "one" ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
            {repeat !== "off" && <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-primary rounded-full" />}
          </Button>
          <Button
            variant="ghost"
            size="iconSm"
            onClick={() => {
              handleCrossfadeToggle();
              toast({ title: crossfade ? "Crossfade disabled" : "Crossfade enabled" });
            }}
            className={cn("h-8 w-8 relative", crossfade ? "text-primary" : "text-muted-foreground")}
            title="Crossfade"
          >
            <Disc3 className="w-4 h-4" />
            {crossfade && <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-primary rounded-full" />}
          </Button>
        </div>
      </div>

      {/* Desktop Player Bar */}
      <div className="fixed bottom-0 left-0 right-0 h-24 glass border-t border-border px-4 hidden md:flex items-center z-50">
        {/* Track Info */}
        <div className="flex items-center gap-4 w-72 min-w-0 flex-shrink-0">
          <img
            src={currentTrack.cover}
            alt={currentTrack.title}
            className="w-14 h-14 rounded-lg object-cover shadow-lg flex-shrink-0"
          />
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
            <Button 
              variant="ghost" 
              size="iconSm" 
              onClick={() => {
                handleCrossfadeToggle();
                toast({ title: crossfade ? "Crossfade disabled" : "Crossfade enabled" });
              }}
              className={cn("relative", crossfade ? "text-primary" : "text-muted-foreground hover:text-foreground")}
              title="Crossfade"
            >
              <Disc3 className="w-4 h-4" />
              {crossfade && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-primary rounded-full" />}
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
