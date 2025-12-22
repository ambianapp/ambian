import { useState, useRef, useEffect, useCallback } from "react";
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Repeat, Repeat1, Shuffle, Heart, Disc3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePlayer } from "@/contexts/PlayerContext";
import { useToast } from "@/hooks/use-toast";
import SignedImage from "@/components/SignedImage";
import { Track } from "@/data/musicData";

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
    setCurrentTrackDirect,
  } = usePlayer();
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const crossfadeAudioRef = useRef<HTMLAudioElement>(null);
  const [volume, setVolume] = useState([75]);
  const [progress, setProgress] = useState([0]);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const normalizeUrl = useCallback((url: string) => {
    try {
      return new URL(url, window.location.href).href;
    } catch {
      return url;
    }
  }, []);
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
  const preloadedNextTrackRef = useRef<{ id: string; audioUrl: string; track: Track } | null>(null);
  const isPreloadingRef = useRef(false);
  const crossfadeCompleteRef = useRef(false);
  const crossfadeTrackSwitchedRef = useRef(false);
  const userVolumeRef = useRef(75); // Store user's intended volume
  const mainAudioSrcRef = useRef<string | null>(null); // Prevent React re-setting src during crossfade

  // Reset crossfade state - used when user manually skips tracks
  const resetCrossfadeState = useCallback(() => {
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
    lastSetTrackIdRef.current = null;
    if (crossfadeAudioRef.current) {
      crossfadeAudioRef.current.pause();
      crossfadeAudioRef.current.src = "";
    }
    setIsCrossfadeActive(false);
  }, []);

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
      if (document.visibilityState !== 'visible' || !isPlaying) return;

      const activeAudio = isCrossfadeActive ? crossfadeAudioRef.current : audioRef.current;
      if (!activeAudio) return;

      // Check if audio is actually playing, if not try to resume
      if (activeAudio.paused) {
        console.log('Tab visible again, resuming playback...');
        activeAudio.play().catch(() => {
          // If can't resume, skip to next
          handleNext();
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isPlaying, handleNext, isCrossfadeActive]);

  // Handle audio errors with auto-recovery
  const handleAudioError = (audioEl?: HTMLAudioElement) => {
    const audio = audioEl ?? (isCrossfadeActive ? crossfadeAudioRef.current : audioRef.current);
    console.error("Audio error:", audio?.error?.code, audio?.error?.message);

    // Don't fight the crossfade swap (can look like an error/stall on the inactive element)
    if (crossfade && (isCrossfadingRef.current || isCrossfadeActive)) {
      return;
    }

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
        const active = isCrossfadeActive ? crossfadeAudioRef.current : audioRef.current;
        if (active && currentTrack?.audioUrl) {
          active.load();
          active.play().catch(console.error);
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
  const handleStalled = (audioEl?: HTMLAudioElement) => {
    // Ignore stalls during crossfade (inactive element often stalls/ends)
    if (crossfade && (isCrossfadingRef.current || isCrossfadeActive)) return;

    console.log("Audio stalled, attempting recovery...");
    const active = audioEl ?? (isCrossfadeActive ? crossfadeAudioRef.current : audioRef.current);
    if (active && isPlaying) {
      // Try to resume playback
      setTimeout(() => {
        active.play().catch(console.error);
      }, 500);
    }
  };

  // Monitor for playback stalls (no progress for extended time)
  useEffect(() => {
    if (!isPlaying || !currentTrack?.audioUrl) return;

    stallCheckIntervalRef.current = setInterval(() => {
      // Don't try recovery while offline - let the online handler deal with it
      if (isOffline) return;

      // Ignore stall detection during crossfade (inactive element will appear stalled)
      if (crossfade && (isCrossfadingRef.current || isCrossfadeActive)) return;

      const activeAudio = isCrossfadeActive ? crossfadeAudioRef.current : audioRef.current;
      if (!activeAudio) return;

      const now = Date.now();
      const timeSinceLastProgress = now - lastProgressTimeRef.current;

      // If no progress for 10 seconds while playing, try recovery
      if (timeSinceLastProgress > 10000 && !activeAudio.paused) {
        console.log("Detected playback stall, attempting recovery...");

        if (retryCountRef.current < maxRetries) {
          retryCountRef.current++;
          const currentPos = activeAudio.currentTime;
          activeAudio.load();
          activeAudio.currentTime = currentPos;
          activeAudio.play().catch(() => {
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

    return () => {
      if (stallCheckIntervalRef.current) {
        clearInterval(stallCheckIntervalRef.current);
      }
    };
  }, [isPlaying, currentTrack?.audioUrl, handleNext, isOffline, crossfade, isCrossfadeActive]);

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
      resetCrossfadeState();
      handlePrevious();
    });
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      resetCrossfadeState();
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

  // Keep audio element src stable - only update src on the INACTIVE element or when not crossfading
  // This prevents the "restart after 5 seconds" bug caused by React re-setting src mid-playback
  const lastSetTrackIdRef = useRef<string | null>(null);
  
  useEffect(() => {
    if (!currentTrack?.audioUrl) return;

    // Skip if we already set this track (prevents duplicate loads)
    if (lastSetTrackIdRef.current === currentTrack.id) return;

    // During active crossfade, don't touch audio elements - the crossfade logic handles everything
    if (isCrossfadingRef.current) return;

    const activeAudio = isCrossfadeActive ? crossfadeAudioRef.current : audioRef.current;
    if (!activeAudio) return;

    const desiredSrc = normalizeUrl(currentTrack.audioUrl);
    const currentSrc = normalizeUrl(activeAudio.src || "");

    // If the element is already playing (e.g. we just completed a crossfade),
    // never force a reload mid-playback *unless* the user has actually switched to a different track.
    // This prevents the "restarts at ~5s" bug while still allowing manual skipping.
    if (
      crossfade &&
      isPlaying &&
      !activeAudio.paused &&
      activeAudio.currentTime > 0.5 &&
      currentSrc === desiredSrc
    ) {
      lastSetTrackIdRef.current = currentTrack.id;
      return;
    }

    // Only load if the active audio doesn't already have this track
    if (currentSrc !== desiredSrc) {
      console.log(
        "Setting active audio src:",
        currentTrack.id,
        "isCrossfadeActive:",
        isCrossfadeActive
      );
      activeAudio.src = desiredSrc;
      activeAudio.load();

      if (isPlaying) {
        activeAudio.play().catch(console.error);
      }
    }

    lastSetTrackIdRef.current = currentTrack.id;

    // Also update mainAudioSrcRef for consistency
    if (!isCrossfadeActive) {
      mainAudioSrcRef.current = desiredSrc;
    }
  }, [
    currentTrack?.id,
    currentTrack?.audioUrl,
    isCrossfadeActive,
    isPlaying,
    normalizeUrl,
    crossfade,
  ]);

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
        if (nextTrack?.audioUrl) {
          console.log('Preloading next track for crossfade:', nextTrack.id);
          preloadedNextTrackRef.current = { id: nextTrack.id, audioUrl: nextTrack.audioUrl, track: nextTrack };
          
          // Preload into the INACTIVE audio element
          const inactiveAudio = isCrossfadeActive ? audioRef.current : crossfadeAudioRef.current;
          if (inactiveAudio) {
            inactiveAudio.src = nextTrack.audioUrl;
            inactiveAudio.volume = 0;
            inactiveAudio.load();
          }
        }
        isPreloadingRef.current = false;
      }).catch(() => {
        isPreloadingRef.current = false;
      });
    }
  }, [currentTime, duration, crossfade, isPlaying, repeat, getNextTrack, isCrossfadeActive]);
  
  // Start crossfade when approaching end of track
  const startCrossfade = useCallback(() => {
    if (isCrossfadingRef.current || !crossfade || repeat === "one") return;
    if (!crossfadeAudioRef.current || !audioRef.current) return;
    
    // Check if preloaded track is ready
    if (!preloadedNextTrackRef.current) {
      console.log('Crossfade: next track not preloaded, skipping crossfade');
      return;
    }
    
    console.log('Starting crossfade, active element:', isCrossfadeActive ? 'crossfade' : 'main');
    isCrossfadingRef.current = true;
    crossfadeCompleteRef.current = false;
    crossfadeTrackSwitchedRef.current = false;
    nextTrackPreloadedRef.current = preloadedNextTrackRef.current.id;
    
    // Determine which audio is fading out and which is fading in
    const fadingOutAudio = isCrossfadeActive ? crossfadeAudioRef.current : audioRef.current;
    const fadingInAudio = isCrossfadeActive ? audioRef.current : crossfadeAudioRef.current;
    const targetVolume = isMuted ? 0 : Math.min(1, userVolumeRef.current / 100);
    
    // Start playing the fading-in audio (already preloaded)
    fadingInAudio.volume = 0;
    fadingInAudio.play().catch(console.error);
    
    const steps = 50;
    const stepTime = (CROSSFADE_DURATION * 1000) / steps;
    let step = 0;
    const startVolume = fadingOutAudio.volume;
    
    crossfadeIntervalRef.current = setInterval(() => {
      step++;
      const progress = Math.min(1, step / steps);
      
      // Fade out current, fade in next
      fadingOutAudio.volume = Math.max(0, startVolume * (1 - progress));
      fadingInAudio.volume = Math.max(0, Math.min(1, targetVolume * progress));
      
      if (step >= steps) {
        if (crossfadeIntervalRef.current) {
          clearInterval(crossfadeIntervalRef.current);
          crossfadeIntervalRef.current = null;
        }
        crossfadeCompleteRef.current = true;
        
        // Crossfade complete - swap active audio element (no reload needed!)
        if (!crossfadeTrackSwitchedRef.current && preloadedNextTrackRef.current) {
          crossfadeTrackSwitchedRef.current = true;

          const next = preloadedNextTrackRef.current;

          // Update mainAudioSrcRef BEFORE updating React state to prevent the effect from reloading
          if (isCrossfadeActive) {
            // Switching TO main audio - update its src ref
            mainAudioSrcRef.current = normalizeUrl(next.audioUrl);
          } else {
            // Switching TO crossfade audio - main audio will be inactive, but update ref anyway
            // to prevent future reload when we eventually switch back
          }

          // Stop the faded-out audio and clear its src
          fadingOutAudio.pause();
          fadingOutAudio.src = "";

          // Toggle which audio element is active BEFORE updating track state
          // This ensures the effect at line 415 sees the correct isCrossfadeActive value
          setIsCrossfadeActive(prev => !prev);

          // Update React state to the new track
          // Do this AFTER toggling active audio so the effect doesn't try to reload
          setCurrentTrackDirect(next.track);
          
          // Mark this track as already set to prevent the src-setting effect from reloading
          lastSetTrackIdRef.current = next.id;
          
          // Reset preload state for the next transition
          // Keep isCrossfadingRef true briefly to block the src-setting effect
          nextTrackPreloadedRef.current = null;
          preloadedNextTrackRef.current = null;
          isPreloadingRef.current = false;
          
          // Delay resetting crossfade flags to allow React state to settle
          setTimeout(() => {
            isCrossfadingRef.current = false;
            crossfadeCompleteRef.current = false;
            crossfadeTrackSwitchedRef.current = false;
          }, 100);
        }
      }
    }, stepTime);
  }, [crossfade, repeat, isMuted, setCurrentTrackDirect, normalizeUrl, isCrossfadeActive]);

  // Monitor for crossfade trigger point - works for whichever audio element is active
  useEffect(() => {
    if (!crossfade || !isPlaying || repeat === "one" || isCrossfadingRef.current) return;

    const activeAudio = isCrossfadeActive ? crossfadeAudioRef.current : audioRef.current;
    if (!activeAudio || !isFinite(activeAudio.duration) || activeAudio.duration === 0) return;

    const timeRemaining = activeAudio.duration - activeAudio.currentTime;

    // Trigger once when we enter the crossfade window
    if (timeRemaining <= CROSSFADE_DURATION && timeRemaining > 0.25) {
      startCrossfade();
    }
  }, [currentTime, crossfade, isPlaying, repeat, startCrossfade, isCrossfadeActive]);

  // Cleanup crossfade (unmount / disable)
  useEffect(() => {
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
      if (crossfadeAudioRef.current) {
        crossfadeAudioRef.current.pause();
        crossfadeAudioRef.current.src = "";
      }
      setIsCrossfadeActive(false);
    };
  }, []);

  // Handle crossfade audio ending
  // Normally crossfadeAudio is stopped once we swap back to mainAudio; this is a safety net.
  const handleCrossfadeEnded = useCallback(() => {
    if (!isCrossfadeActive) return;

    // If crossfadeAudio was the active player for some reason, fall back to next.
    isCrossfadingRef.current = false;
    crossfadeCompleteRef.current = false;
    crossfadeTrackSwitchedRef.current = false;
    nextTrackPreloadedRef.current = null;
    preloadedNextTrackRef.current = null;
    isPreloadingRef.current = false;
    setIsCrossfadeActive(false);
    handleNext();
  }, [handleNext, isCrossfadeActive]);

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

  const getActiveAudio = useCallback(() => {
    return isCrossfadeActive ? crossfadeAudioRef.current : audioRef.current;
  }, [isCrossfadeActive]);

  const handleTimeUpdate = () => {
    const activeAudio = getActiveAudio();
    if (activeAudio) {
      const time = activeAudio.currentTime;
      setCurrentTime(time);
      const dur = activeAudio.duration;
      if (isFinite(dur) && dur > 0) setDuration(dur);

      const progressPercent = dur ? (time / dur) * 100 : 0;
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

  const handleLoadedMetadata = (audioEl?: HTMLAudioElement) => {
    const activeAudio = audioEl ?? getActiveAudio();
    if (!activeAudio) return;

    const dur = activeAudio.duration;
    if (isFinite(dur) && dur > 0) setDuration(dur);

    // Seek to restored position if available (apply to the active element only)
    if (seekPosition !== null && seekPosition > 0) {
      activeAudio.currentTime = seekPosition;
      setSeekPosition(null);
    }
  };

  const handleProgressChange = (value: number[]) => {
    const activeAudio = getActiveAudio();
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
          onLoadedMetadata={(e) => handleLoadedMetadata(e.currentTarget)}
          onError={(e) => handleAudioError(e.currentTarget)}
          onStalled={(e) => handleStalled(e.currentTarget)}
          onWaiting={(e) => handleStalled(e.currentTarget)}
          onEnded={() => {
            if (repeat === "one" && audioRef.current) {
              audioRef.current.currentTime = 0;
              audioRef.current.play();
              return;
            }

            // Crossfade path: the next track is already playing on the crossfade audio.
            // Never advance again from the main audio ended event.
            if (crossfade && (isCrossfadingRef.current || isCrossfadeActive || crossfadeTrackSwitchedRef.current)) {
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
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={(e) => handleLoadedMetadata(e.currentTarget)}
        onError={(e) => handleAudioError(e.currentTarget)}
        onStalled={(e) => handleStalled(e.currentTarget)}
        onWaiting={(e) => handleStalled(e.currentTarget)}
        onEnded={handleCrossfadeEnded}
      />

      {/* Mobile Player Bar */}
      <div className="fixed bottom-[calc(56px+var(--safe-bottom-tight))] md:hidden left-0 right-0 glass border-t border-border z-50 flex flex-col">
        {/* Track Info Row */}
        <div className="flex items-center gap-3 px-3 pt-2">
          <SignedImage
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
        <div className="flex items-center justify-between px-4 py-2">
          {/* Left controls - justify-end to push buttons toward center */}
          <div className="flex-1 flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleShuffleToggle}
              className={cn("h-10 w-10", shuffle ? "text-primary" : "text-muted-foreground")}
            >
              <Shuffle className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => { resetCrossfadeState(); handlePrevious(); }} className="text-foreground h-11 w-11">
              <SkipBack className="w-6 h-6" />
            </Button>
          </div>
          
          {/* Center play button */}
          <Button variant="player" size="icon" onClick={handlePlayPause} className="h-12 w-12 flex-shrink-0 mx-2">
            {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
          </Button>
          
          {/* Right controls - justify-start to push buttons toward center */}
          <div className="flex-1 flex items-center justify-start gap-2">
            <Button variant="ghost" size="icon" onClick={() => { resetCrossfadeState(); handleNext(); }} className="text-foreground h-11 w-11">
              <SkipForward className="w-6 h-6" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRepeatToggle}
              className={cn("h-10 w-10 relative", repeat !== "off" ? "text-primary" : "text-muted-foreground")}
            >
              {repeat === "one" ? <Repeat1 className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
              {repeat !== "off" && <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-primary rounded-full" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                handleCrossfadeToggle();
                toast({ title: crossfade ? "Crossfade disabled" : "Crossfade enabled" });
              }}
              className={cn("h-10 w-10 relative", crossfade ? "text-primary" : "text-muted-foreground")}
              title="Crossfade"
            >
              <Disc3 className="w-5 h-5" />
              {crossfade && <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-primary rounded-full" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Desktop Player Bar */}
      <div className="fixed bottom-0 left-0 right-0 h-24 glass border-t border-border px-4 hidden md:flex items-center z-50">
        {/* Track Info */}
        <div className="flex items-center gap-4 w-72 min-w-0 flex-shrink-0">
          <SignedImage
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
            <Button variant="ghost" size="icon" onClick={() => { resetCrossfadeState(); handlePrevious(); }} className="text-foreground">
              <SkipBack className="w-5 h-5" />
            </Button>
            <Button variant="player" size="iconLg" onClick={handlePlayPause} className="h-12 w-12">
              {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => { resetCrossfadeState(); handleNext(); }} className="text-foreground">
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
