import { useState, useRef, useEffect, useCallback } from "react";
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Repeat, Repeat1, Shuffle, Heart, Disc3, ListMusic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePlayer } from "@/contexts/PlayerContext";
import { useLikedSongs } from "@/contexts/LikedSongsContext";
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
    isQuickMix,
    handlePlayPause,
    handleNext,
    handlePrevious,
    handleShuffleToggle,
    handleRepeatToggle,
    handleCrossfadeToggle,
    clearQuickMix,
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
  const [volume, setVolume] = useState([100]);
  const [progress, setProgress] = useState([0]);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  // Web Audio API for iOS volume control (iOS ignores HTMLMediaElement.volume)
  const audioContextRef = useRef<AudioContext | null>(null);
  const mainGainNodeRef = useRef<GainNode | null>(null);
  const crossfadeGainNodeRef = useRef<GainNode | null>(null);
  const mainSourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const crossfadeSourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const webAudioInitializedRef = useRef(false);

  const normalizeUrl = useCallback((url: string) => {
    try {
      return new URL(url, window.location.href).href;
    } catch {
      return url;
    }
  }, []);
  const [isMuted, setIsMuted] = useState(false);
  const { user, getDeviceId, canPlayMusic } = useAuth();
  const { isLiked: checkIsLiked, toggleLike } = useLikedSongs();
  const { toast } = useToast();

  // iOS/Safari autoplay can fail if play() isn't triggered from a user gesture.
  // We surface a clear CTA instead of failing silently.
  const lastAutoplayToastAtRef = useRef(0);
  
  const isLiked = currentTrack ? checkIsLiked(currentTrack.id) : false;

  // Crossfade debug buffer (stored in localStorage so you can inspect after the issue happens)
  const CROSSFADE_DEBUG_KEY = "ambian_crossfade_debug";
  const debugCrossfadeRef = useRef<boolean>(true); // keep on for now; we'll switch back once fixed
  const isCrossfadeActiveRef = useRef(false);

  const pushCrossfadeDebug = useCallback((entry: Record<string, unknown>) => {
    try {
      const raw = localStorage.getItem(CROSSFADE_DEBUG_KEY);
      const list = (raw ? (JSON.parse(raw) as any[]) : []) ?? [];
      const next = [
        ...list,
        {
          ts: new Date().toISOString(),
          ...entry,
        },
      ].slice(-200);
      localStorage.setItem(CROSSFADE_DEBUG_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }, []);

  const dbg = useCallback(
    (...args: any[]) => {
      if (!debugCrossfadeRef.current) return;

      // Keep console output (useful during dev)
      console.log("[crossfade]", ...args);

      // Also persist a structured entry for Admin → Crossfade Debug panel
      const message = typeof args[0] === "string" ? args[0] : "event";
      const payload = args.length > 1 ? args[1] : undefined;

      pushCrossfadeDebug({
        message,
        payload,
        trackId: currentTrack?.id ?? null,
        isPlaying,
        isCrossfadeActive: isCrossfadeActiveRef.current,
        isCrossfading: isCrossfadingRef.current,
        crossfadeComplete: crossfadeCompleteRef.current,
        trackSwitched: crossfadeTrackSwitchedRef.current,
        mainTime: audioRef.current?.currentTime ?? null,
        crossfadeTime: crossfadeAudioRef.current?.currentTime ?? null,
        mainSrc: audioRef.current?.src ?? null,
        crossfadeSrc: crossfadeAudioRef.current?.src ?? null,
      });
    },
    [pushCrossfadeDebug, currentTrack?.id, isPlaying]
  );

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

  // Keep crossfade active state available to debug logger without creating TS ordering issues
  useEffect(() => {
    isCrossfadeActiveRef.current = isCrossfadeActive;
  }, [isCrossfadeActive]);
  const lastCrossfadeSwapAtRef = useRef<number>(0); // Prevent post-swap reloads

  const softStop = useCallback((el: HTMLAudioElement | null, gain: GainNode | null) => {
    if (!el) return;

    // De-zipper: ramp gain to 0 briefly before pausing/clearing src to avoid pops (esp. iOS).
    const ctx = audioContextRef.current;
    const now = ctx?.currentTime ?? 0;
    if (gain && ctx) {
      try {
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.02);
      } catch {
        // ignore
      }
    }

    // Pause slightly after ramp starts.
    window.setTimeout(() => {
      try {
        el.pause();
        el.src = "";
      } catch {
        // ignore
      }
    }, 30);
  }, []);

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
    // Cancel any scheduled gain ramps and reset to current target volume
    const ctx = audioContextRef.current;
    const now = ctx?.currentTime ?? 0;
    const targetVol = isMuted ? 0 : Math.min(1, userVolumeRef.current / 100);
    for (const g of [mainGainNodeRef.current, crossfadeGainNodeRef.current]) {
      if (!g || !ctx) continue;
      try {
        g.gain.cancelScheduledValues(now);
        g.gain.setValueAtTime(targetVol, now);
      } catch {
        g.gain.value = targetVol;
      }
    }

    // Soft-stop the secondary audio element to avoid iOS pops
    softStop(crossfadeAudioRef.current, crossfadeGainNodeRef.current);
    setIsCrossfadeActive(false);
  }, [isMuted, softStop]);

  const softStopActiveAudio = useCallback(() => {
    const activeEl = isCrossfadeActive ? crossfadeAudioRef.current : audioRef.current;
    const activeGain = isCrossfadeActive ? crossfadeGainNodeRef.current : mainGainNodeRef.current;
    softStop(activeEl, activeGain);
  }, [isCrossfadeActive, softStop]);

  // Safety: if the track changes for any reason while a crossfade timer is still running,
  // stop that timer so it can’t “complete” ~5s later and interfere with the new song.
  useEffect(() => {
    // During an active crossfade we expect the track to change (swap). Don’t fight it.
    if (isCrossfadingRef.current) return;

    if (crossfadeIntervalRef.current) {
      clearInterval(crossfadeIntervalRef.current);
      crossfadeIntervalRef.current = null;
    }

    crossfadeCompleteRef.current = false;
    crossfadeTrackSwitchedRef.current = false;
    nextTrackPreloadedRef.current = null;
    preloadedNextTrackRef.current = null;
    isPreloadingRef.current = false;
  }, [currentTrack?.id]);

  // Global keyboard shortcut for space bar play/pause
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only trigger if not typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      
      if (e.code === 'Space' && currentTrack) {
        e.preventDefault();
        handlePlayPause();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentTrack, handlePlayPause]);

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

  // Session heartbeat - keep session alive while music is playing
  // Pings every 5 minutes to prevent the 10-minute stale session cleanup
  useEffect(() => {
    if (!isPlaying || !user) return;

    const HEARTBEAT_INTERVAL = 5 * 60 * 1000; // 5 minutes

    const sendHeartbeat = async () => {
      try {
        const sessionId = getDeviceId();
        const deviceInfo = navigator.userAgent;
        
        console.log("[Heartbeat] Sending session heartbeat...");
        
        const { error } = await supabase.functions.invoke("register-session", {
          body: { sessionId, deviceInfo },
        });

        if (error) {
          console.warn("[Heartbeat] Failed:", error);
        } else {
          console.log("[Heartbeat] Session refreshed successfully");
        }
      } catch (err) {
        console.warn("[Heartbeat] Error:", err);
      }
    };

    // Send initial heartbeat
    sendHeartbeat();

    // Then every 5 minutes
    const interval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

    return () => clearInterval(interval);
  }, [isPlaying, user, getDeviceId]);

  // Warn user before closing tab when music is playing
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isPlaying) {
        e.preventDefault();
        // Modern browsers require returnValue to be set
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
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
    
    // Ignore errors from audio elements with no src (happens when we clear src during transitions)
    if (!audio?.src || audio.src === "" || audio.src === window.location.href) {
      dbg("handleAudioError: ignoring (no src)", { src: audio?.src });
      return;
    }
    
    console.error("Audio error:", audio?.error?.code, audio?.error?.message);

    // Ignore errors from inactive audio elements during crossfade
    if (crossfade && isCrossfadingRef.current) {
      dbg("handleAudioError: ignoring (crossfade in progress)");
      return;
    }
    
    // Ignore errors from the non-active element
    const activeAudio = isCrossfadeActive ? crossfadeAudioRef.current : audioRef.current;
    if (audioEl && audioEl !== activeAudio) {
      dbg("handleAudioError: ignoring (error from inactive element)");
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
        dbg("stallRecovery: load()", {
          trackId: currentTrack?.id,
          t: activeAudio.currentTime,
          src: activeAudio.src,
        });

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
  }, [isPlaying, currentTrack?.audioUrl, handleNext, isOffline, crossfade, isCrossfadeActive, dbg, currentTrack?.id]);

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

    // Always use Ambian logo for lock screen artwork (with cache buster)
    const artworkUrl = `${window.location.origin}/ambian-logo.png?v=2`;
    
    // Set metadata with Ambian branding
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title || 'Unknown Track',
      artist: currentTrack.artist || 'Ambian',
      album: 'Ambian',
      artwork: [
        { src: artworkUrl, sizes: '96x96', type: 'image/png' },
        { src: artworkUrl, sizes: '128x128', type: 'image/png' },
        { src: artworkUrl, sizes: '192x192', type: 'image/png' },
        { src: artworkUrl, sizes: '256x256', type: 'image/png' },
        { src: artworkUrl, sizes: '384x384', type: 'image/png' },
        { src: artworkUrl, sizes: '512x512', type: 'image/png' },
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
      softStopActiveAudio();
      resetCrossfadeState();
      window.setTimeout(() => handlePrevious(), 35);
    });
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      softStopActiveAudio();
      resetCrossfadeState();
      window.setTimeout(() => handleNext(), 35);
    });
    
    // Remove seek handlers to prevent 10-second skip buttons
    navigator.mediaSession.setActionHandler('seekbackward', null);
    navigator.mediaSession.setActionHandler('seekforward', null);

  }, [currentTrack, handlePlayPause, handlePrevious, handleNext, resetCrossfadeState, softStopActiveAudio]);

  // Update playback state for media session
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying]);

  const handleLikeToggle = () => {
    if (!currentTrack) return;
    toggleLike(currentTrack.id);
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

    // Also skip if crossfade just completed - flags might still be resetting
    if (crossfadeCompleteRef.current || crossfadeTrackSwitchedRef.current) {
      dbg("srcEffect: skip (crossfade completing)", {
        trackId: currentTrack.id,
        crossfadeComplete: crossfadeCompleteRef.current,
        trackSwitched: crossfadeTrackSwitchedRef.current,
      });
      lastSetTrackIdRef.current = currentTrack.id;
      return;
    }

    const activeAudio = isCrossfadeActive ? crossfadeAudioRef.current : audioRef.current;
    if (!activeAudio) return;

    const desiredSrc = normalizeUrl(currentTrack.audioUrl);
    const currentSrc = normalizeUrl(activeAudio.src || "");

    // Extra safety: right after a crossfade swap, don't reload for a longer window
    const timeSinceSwap = Date.now() - lastCrossfadeSwapAtRef.current;
    if (crossfade && timeSinceSwap < 5000) {
      dbg("srcEffect: skip (post-swap window)", {
        trackId: currentTrack.id,
        t: activeAudio.currentTime,
        timeSinceSwap,
      });
      lastSetTrackIdRef.current = currentTrack.id;
      return;
    }

    // If the active audio already points to the same file (token may differ), NEVER reload.
    // Signed URLs change frequently; reloading causes the “restart at 5s” behavior.
    const desiredPath = desiredSrc.split("?")[0];
    const currentPath = currentSrc.split("?")[0];
    if (desiredPath && currentPath && desiredPath === currentPath) {
      dbg("srcEffect: skip (same file path; token diff ok)", {
        trackId: currentTrack.id,
        t: activeAudio.currentTime,
      });
      lastSetTrackIdRef.current = currentTrack.id;
      return;
    }

    // If the active audio is already playing and has progressed, don't reload it
    if (!activeAudio.paused && activeAudio.currentTime > 0.5 && isPlaying) {
      // Check if the src is similar (same file path, maybe different token)
      if (currentSrc === desiredSrc) {
        dbg("srcEffect: skip (already playing correct src)", {
          trackId: currentTrack.id,
          t: activeAudio.currentTime,
        });
        lastSetTrackIdRef.current = currentTrack.id;
        return;
      }
    }

    // Only load if the active audio doesn't already have this track
    if (currentSrc !== desiredSrc) {
      dbg("srcEffect: SET SRC + load()", {
        trackId: currentTrack.id,
        isCrossfadeActive,
        desiredSrc,
        currentSrc,
      });
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
    dbg,
  ]);

  useEffect(() => {
    // Skip play/pause management during ACTIVE crossfade transition only
    // (not during the settling period after crossfade completes)
    if (isCrossfadingRef.current) {
      dbg("play/pause effect: skip (crossfade in progress)");
      return;
    }
    
    const activeAudio = isCrossfadeActive ? crossfadeAudioRef.current : audioRef.current;
    if (activeAudio) {
      // Block playback if device limit is reached - always pause in this state
      if (!canPlayMusic) {
        if (!activeAudio.paused) {
          dbg("play/pause effect: pausing (device limit reached)");
          activeAudio.pause();
        }
        return;
      }
      
      if (isPlaying && (currentTrack?.audioUrl || isCrossfadeActive)) {
        // Only call play if audio is actually paused to avoid interrupting playback
        if (activeAudio.paused) {
          dbg("play/pause effect: calling play()", { 
            trackId: currentTrack?.id, 
            isCrossfadeActive,
            hasSrc: !!activeAudio.src 
          });
          activeAudio.play().catch((err) => {
            console.error("Play failed:", err);
            dbg("play/pause effect: play() failed", { error: err?.message });

            // iOS/Safari often throws NotAllowedError when autoplay is blocked.
            // Throttle the toast to avoid spam during retries.
            const name = (err as any)?.name;
            if (name === "NotAllowedError") {
              const now = Date.now();
              if (now - lastAutoplayToastAtRef.current > 3000) {
                lastAutoplayToastAtRef.current = now;
                toast({
                  title: "Tap Play to start",
                  description: "iPhone/iPad requires a tap to start audio after reconnecting.",
                });
              }
            }
          });
        }
      } else if (!isPlaying) {
        activeAudio.pause();
      }
    }
  }, [isPlaying, currentTrack?.id, currentTrack?.audioUrl, isCrossfadeActive, dbg, canPlayMusic]);

  // Initialize Web Audio API for iOS volume control
  const initWebAudio = useCallback(() => {
    if (webAudioInitializedRef.current) return;
    if (!audioRef.current) return;
    
    try {
      // Create AudioContext (Safari needs webkit prefix sometimes)
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      
      audioContextRef.current = new AudioCtx();
      
      // Create gain nodes for volume control
      mainGainNodeRef.current = audioContextRef.current.createGain();
      crossfadeGainNodeRef.current = audioContextRef.current.createGain();
      
      // Connect main audio element
      if (audioRef.current && !mainSourceNodeRef.current) {
        mainSourceNodeRef.current = audioContextRef.current.createMediaElementSource(audioRef.current);
        mainSourceNodeRef.current.connect(mainGainNodeRef.current);
        mainGainNodeRef.current.connect(audioContextRef.current.destination);
      }
      
      // Connect crossfade audio element
      if (crossfadeAudioRef.current && !crossfadeSourceNodeRef.current) {
        crossfadeSourceNodeRef.current = audioContextRef.current.createMediaElementSource(crossfadeAudioRef.current);
        crossfadeSourceNodeRef.current.connect(crossfadeGainNodeRef.current);
        crossfadeGainNodeRef.current.connect(audioContextRef.current.destination);
      }
      
      webAudioInitializedRef.current = true;
      console.log("[Audio] Web Audio API initialized for volume control");
    } catch (err) {
      console.warn("[Audio] Web Audio API initialization failed:", err);
    }
  }, []);

  const ensureAudioContextRunning = useCallback(async () => {
    initWebAudio();
    const ctx = audioContextRef.current;
    if (ctx?.state === "suspended") {
      try {
        await ctx.resume();
      } catch (err) {
        console.warn("[Audio] AudioContext resume failed:", err);
      }
    }
  }, [initWebAudio]);

  const handleUserPlayPause = useCallback(async () => {
    await ensureAudioContextRunning();

    const activeAudio = isCrossfadeActive ? crossfadeAudioRef.current : audioRef.current;
    if (activeAudio) {
      try {
        if (isPlaying) {
          // Pause directly in the gesture handler for immediate feedback.
          activeAudio.pause();
        } else {
          // Play directly in the gesture handler to satisfy iOS/Safari autoplay rules.
          if (activeAudio.paused && activeAudio.src) {
            await activeAudio.play();
          }
        }
      } catch (err: any) {
        const name = err?.name;
        if (name === "NotAllowedError") {
          toast({
            title: "Tap again to start audio",
            description: "Audio is ready, but iOS/Safari blocked autoplay. One more tap should start playback.",
          });
        } else {
          console.error("Direct play/pause failed:", err);
        }
      }
    }

    // Keep app state in sync (PlayerContext).
    handlePlayPause();
  }, [ensureAudioContextRunning, isCrossfadeActive, isPlaying, handlePlayPause, toast]);

  // Initialize Web Audio on first user interaction (required by browsers)
  useEffect(() => {
    const handleInteraction = () => {
      initWebAudio();
      // Resume AudioContext if suspended (Safari requirement)
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume();
      }
    };
    
    // Listen for user interaction to initialize
    document.addEventListener('click', handleInteraction, { once: false });
    document.addEventListener('touchstart', handleInteraction, { once: false });
    document.addEventListener('pointerdown', handleInteraction, { once: false });
    
    return () => {
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('touchstart', handleInteraction);
      document.removeEventListener('pointerdown', handleInteraction);
    };
  }, [initWebAudio]);

  // Apply volume:
  // - Desktop: HTMLMediaElement.volume
  // - iOS: Web Audio GainNodes
  // IMPORTANT: during crossfade we must NOT overwrite scheduled gain ramps.
  useEffect(() => {
    const targetVolume = isMuted ? 0 : Math.min(1, volume[0] / 100);

    // Resume AudioContext if suspended (Safari suspends aggressively)
    if (audioContextRef.current?.state === "suspended") {
      audioContextRef.current.resume().catch(console.warn);
    }

    // Method 1: Direct volume (works on desktop browsers)
    // Keep these in sync so non-iOS works even if WebAudio fails.
    if (audioRef.current) audioRef.current.volume = targetVolume;
    if (crossfadeAudioRef.current) crossfadeAudioRef.current.volume = targetVolume;

    // Method 2: Web Audio API gain (works on iOS)
    const ctx = audioContextRef.current;
    const now = ctx?.currentTime ?? 0;
    const mainGain = mainGainNodeRef.current;
    const crossGain = crossfadeGainNodeRef.current;
    if (!ctx || !mainGain || !crossGain) return;

    // During an active crossfade, gain ramps are scheduled by the crossfade logic.
    // Don't cancel/override them here or we'll create clicks/pops.
    if (isCrossfadingRef.current) return;

    const activeGain = isCrossfadeActive ? crossGain : mainGain;
    const inactiveGain = isCrossfadeActive ? mainGain : crossGain;

    try {
      activeGain.gain.cancelScheduledValues(now);
      activeGain.gain.setValueAtTime(activeGain.gain.value, now);
      activeGain.gain.linearRampToValueAtTime(targetVolume, now + 0.01);

      inactiveGain.gain.cancelScheduledValues(now);
      inactiveGain.gain.setValueAtTime(inactiveGain.gain.value, now);
      inactiveGain.gain.linearRampToValueAtTime(0, now + 0.01);
    } catch {
      activeGain.gain.value = targetVolume;
      inactiveGain.gain.value = 0;
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
      dbg("startCrossfade: next track not preloaded -> skip", {
        activeEl: isCrossfadeActive ? "crossfade" : "main",
        currentTrackId: currentTrack?.id,
      });
      return;
    }

    dbg("startCrossfade: begin", {
      activeEl: isCrossfadeActive ? "crossfade" : "main",
      fromTrackId: currentTrack?.id,
      toTrackId: preloadedNextTrackRef.current.id,
    });

    isCrossfadingRef.current = true;
    crossfadeCompleteRef.current = false;
    crossfadeTrackSwitchedRef.current = false;
    nextTrackPreloadedRef.current = preloadedNextTrackRef.current.id;

    // Determine which audio is fading out and which is fading in
    const fadingOutAudio = isCrossfadeActive ? crossfadeAudioRef.current : audioRef.current;
    const fadingInAudio = isCrossfadeActive ? audioRef.current : crossfadeAudioRef.current;
    const fadingOutGain = isCrossfadeActive ? crossfadeGainNodeRef.current : mainGainNodeRef.current;
    const fadingInGain = isCrossfadeActive ? mainGainNodeRef.current : crossfadeGainNodeRef.current;
    const targetVolume = isMuted ? 0 : Math.min(1, userVolumeRef.current / 100);

    // Set initial volume to 0 BEFORE playing to prevent pop
    fadingInAudio.volume = 0;
    
    // Initialize Web Audio gains for crossfade
    const ctx = audioContextRef.current;
    if (fadingInGain && ctx) {
      const now = ctx.currentTime;
      fadingInGain.gain.cancelScheduledValues(now);
      fadingInGain.gain.setValueAtTime(0, now);
    }
    
    // Start playing the fading-in audio
    fadingInAudio.play().catch((err) => {
      dbg("startCrossfade: fading-in play() failed", err);
      console.error(err);
    });

    // Use interval for BOTH direct volume AND Web Audio gains
    // This ensures consistent timing on PC and iOS Safari
    const steps = 50;
    const stepTime = (CROSSFADE_DURATION * 1000) / steps;
    let step = 0;
    const startOutVolume = fadingOutGain?.gain.value ?? fadingOutAudio.volume ?? targetVolume;

    dbg("startCrossfade: starting interval-based fade", { startOutVolume, targetVolume, steps, stepTime });

    crossfadeIntervalRef.current = setInterval(() => {
      step++;
      const progress = Math.min(1, step / steps);

      // Use ease-in-out curve for smoother perceived fade
      const easedProgress = progress < 0.5 
        ? 2 * progress * progress 
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;

      const fadeOutValue = Math.max(0, startOutVolume * (1 - easedProgress));
      const fadeInValue = Math.max(0, Math.min(1, targetVolume * easedProgress));

      // Direct volume for desktop browsers
      fadingOutAudio.volume = fadeOutValue;
      fadingInAudio.volume = fadeInValue;
      
      // Web Audio gains for iOS - use tiny ramps to avoid clicks
      const ctx = audioContextRef.current;
      if (ctx && fadingOutGain && fadingInGain) {
        const now = ctx.currentTime;
        const rampTime = 0.02; // 20ms micro-ramp to prevent clicks
        
        fadingOutGain.gain.cancelScheduledValues(now);
        fadingOutGain.gain.setValueAtTime(fadingOutGain.gain.value, now);
        fadingOutGain.gain.linearRampToValueAtTime(fadeOutValue, now + rampTime);
        
        fadingInGain.gain.cancelScheduledValues(now);
        fadingInGain.gain.setValueAtTime(fadingInGain.gain.value, now);
        fadingInGain.gain.linearRampToValueAtTime(fadeInValue, now + rampTime);
      }

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

          dbg("startCrossfade: swap", {
            nextTrackId: next.id,
            nextUrl: next.audioUrl,
            swapTo: isCrossfadeActive ? "main" : "crossfade",
          });

          // Update mainAudioSrcRef BEFORE updating React state to prevent the effect from reloading
          if (isCrossfadeActive) {
            // Switching TO main audio - update its src ref
            mainAudioSrcRef.current = normalizeUrl(next.audioUrl);
          }

          // Stop the faded-out audio and clear its src (soft-stop to avoid pops on iOS)
          softStop(fadingOutAudio, fadingOutGain);
          
          // Reset gain for the faded-out element for next use
          if (fadingOutGain) {
            fadingOutGain.gain.cancelScheduledValues(audioContextRef.current?.currentTime ?? 0);
            fadingOutGain.gain.setValueAtTime(targetVolume, audioContextRef.current?.currentTime ?? 0);
          }

          // Toggle which audio element is active BEFORE updating track state
          lastCrossfadeSwapAtRef.current = Date.now();
          setIsCrossfadeActive((prev) => !prev);

          // Update React state to the new track
          setCurrentTrackDirect(next.track);

          // Mark this track as already set to prevent the src-setting effect from reloading
          lastSetTrackIdRef.current = next.id;

          // Reset preload state for the next transition
          nextTrackPreloadedRef.current = null;
          preloadedNextTrackRef.current = null;
          isPreloadingRef.current = false;

          // Delay resetting crossfade flags to allow React state to settle
          setTimeout(() => {
            isCrossfadingRef.current = false;
            crossfadeCompleteRef.current = false;
            crossfadeTrackSwitchedRef.current = false;
            dbg("startCrossfade: done/flags reset");
          }, 500);
        }
      }
    }, stepTime);
  }, [crossfade, repeat, isMuted, setCurrentTrackDirect, normalizeUrl, isCrossfadeActive, dbg, currentTrack?.id, softStop]);

  // Monitor for crossfade trigger point - works for whichever audio element is active
  useEffect(() => {
    if (!crossfade || !isPlaying || repeat === "one" || isCrossfadingRef.current) return;

    // Don't trigger crossfade within 10 seconds of a swap (prevents double-triggering)
    const timeSinceSwap = Date.now() - lastCrossfadeSwapAtRef.current;
    if (timeSinceSwap < 10000) return;

    const activeAudio = isCrossfadeActive ? crossfadeAudioRef.current : audioRef.current;
    if (!activeAudio || !isFinite(activeAudio.duration) || activeAudio.duration === 0) return;

    const timeRemaining = activeAudio.duration - activeAudio.currentTime;

    // Trigger once when we enter the crossfade window (with minimum duration check)
    if (timeRemaining <= CROSSFADE_DURATION && timeRemaining > 0.25 && activeAudio.duration > CROSSFADE_DURATION + 5) {
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
    // If main audio is the active player, crossfade audio ending is just cleanup - don't advance
    if (!isCrossfadeActive) {
      dbg("crossfadeAudio onEnded: skip (main audio is active)", { trackId: currentTrack?.id });
      return;
    }

    // If we're in the middle of a crossfade transition, don't advance (crossfade handles it)
    if (isCrossfadingRef.current || crossfadeTrackSwitchedRef.current) {
      dbg("crossfadeAudio onEnded: skip (crossfade in progress)", {
        isCrossfading: isCrossfadingRef.current,
        trackSwitched: crossfadeTrackSwitchedRef.current,
      });
      return;
    }

    // Crossfade audio is active and ended - advance to next track
    dbg("crossfadeAudio onEnded: advancing to next track", { trackId: currentTrack?.id });
    isCrossfadingRef.current = false;
    crossfadeCompleteRef.current = false;
    crossfadeTrackSwitchedRef.current = false;
    nextTrackPreloadedRef.current = null;
    preloadedNextTrackRef.current = null;
    isPreloadingRef.current = false;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    setIsCrossfadeActive(false);
    handleNext();
  }, [handleNext, isCrossfadeActive, currentTrack?.id, dbg]);

  // Handle scheduled playlist crossfade transition
  useEffect(() => {
    if (!pendingScheduledTransition || !audioRef.current) return;

    const { track, playlist } = pendingScheduledTransition;
    
    // If crossfade is enabled and we have audio playing, do a smooth transition
    if (crossfade && isPlaying && currentTrack?.audioUrl && track.audioUrl && crossfadeAudioRef.current) {
      // Perform crossfade to new scheduled track
      isCrossfadingRef.current = true;
      crossfadeCompleteRef.current = false;
      crossfadeTrackSwitchedRef.current = false;
      
      // Determine which audio element is currently playing
      const fadingOutAudio = isCrossfadeActive ? crossfadeAudioRef.current : audioRef.current;
      const fadingInAudio = isCrossfadeActive ? audioRef.current : crossfadeAudioRef.current;
      const fadingOutGain = isCrossfadeActive ? crossfadeGainNodeRef.current : mainGainNodeRef.current;
      const fadingInGain = isCrossfadeActive ? mainGainNodeRef.current : crossfadeGainNodeRef.current;
      const targetVolume = isMuted ? 0 : Math.min(1, volume[0] / 100);
      
      fadingInAudio.src = track.audioUrl;
      fadingInAudio.volume = 0;
      
      // Initialize Web Audio gain for fade-in element
      const ctx = audioContextRef.current;
      if (fadingInGain && ctx) {
        const now = ctx.currentTime;
        fadingInGain.gain.cancelScheduledValues(now);
        fadingInGain.gain.setValueAtTime(0, now);
      }
      
      fadingInAudio.play().catch(console.error);
      
      const startOutVolume = fadingOutGain?.gain.value ?? fadingOutAudio.volume ?? 1;
      const steps = 50;
      const stepTime = (CROSSFADE_DURATION * 1000) / steps;
      let step = 0;
      
      const intervalId = setInterval(() => {
        step++;
        const progress = Math.min(1, step / steps);
        
        // Use ease-in-out curve for smoother perceived fade
        const easedProgress = progress < 0.5 
          ? 2 * progress * progress 
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        
        const fadeOutValue = Math.max(0, startOutVolume * (1 - easedProgress));
        const fadeInValue = Math.max(0, Math.min(1, targetVolume * easedProgress));
        
        // Direct volume for desktop browsers
        fadingOutAudio.volume = fadeOutValue;
        fadingInAudio.volume = fadeInValue;
        
        // Web Audio gains for iOS - use tiny ramps to avoid clicks
        const ctx = audioContextRef.current;
        if (ctx && fadingOutGain && fadingInGain) {
          const now = ctx.currentTime;
          const rampTime = 0.02; // 20ms micro-ramp to prevent clicks
          
          fadingOutGain.gain.cancelScheduledValues(now);
          fadingOutGain.gain.setValueAtTime(fadingOutGain.gain.value, now);
          fadingOutGain.gain.linearRampToValueAtTime(fadeOutValue, now + rampTime);
          
          fadingInGain.gain.cancelScheduledValues(now);
          fadingInGain.gain.setValueAtTime(fadingInGain.gain.value, now);
          fadingInGain.gain.linearRampToValueAtTime(fadeInValue, now + rampTime);
        }
        
        if (step >= steps) {
          clearInterval(intervalId);
          crossfadeCompleteRef.current = true;
          
          // Swap: update playlist and toggle active audio element
          playlistTracksRef.current = playlist;
          
          // Stop the faded-out audio (soft-stop to avoid pops on iOS)
          softStop(fadingOutAudio, fadingOutGain);
          
          // Reset gain for the faded-out element for next use
          if (fadingOutGain) {
            fadingOutGain.gain.cancelScheduledValues(audioContextRef.current?.currentTime ?? 0);
            fadingOutGain.gain.setValueAtTime(targetVolume, audioContextRef.current?.currentTime ?? 0);
          }
          
          // Mark swap time to prevent src-setting effect from interfering
          lastCrossfadeSwapAtRef.current = Date.now();
          
          // Toggle active audio element - DON'T reload, just switch which is active
          setIsCrossfadeActive(prev => !prev);
          
          // Update track state
          setCurrentTrackDirect(track);
          lastSetTrackIdRef.current = track.id;
          
          // Reset crossfade state after a short delay
          setTimeout(() => {
            isCrossfadingRef.current = false;
            crossfadeCompleteRef.current = false;
            crossfadeTrackSwitchedRef.current = false;
          }, 500);
          
          clearScheduledTransition();
        }
      }, stepTime);
      
      return () => clearInterval(intervalId);
    } else {
      // No crossfade - switch directly: update playlist and track
      console.log("[PlayerBar] Scheduled transition without crossfade - switching directly");
      playlistTracksRef.current = playlist;
      
      // Set the new track - this will trigger the src effect to load and play
      setCurrentTrackDirect(track);
      lastSetTrackIdRef.current = track.id;
      
      clearScheduledTransition();
    }
  }, [pendingScheduledTransition, crossfade, isPlaying, currentTrack?.audioUrl, volume, isMuted, clearScheduledTransition, isCrossfadeActive, setCurrentTrackDirect, softStop]);

  // Save current position for persistence
  const savePositionRef = useRef<NodeJS.Timeout | null>(null);
  const lastObservedTimeRef = useRef<number>(0);
  const lastObservedTrackIdRef = useRef<string | null>(null);

  const getActiveAudio = useCallback(() => {
    return isCrossfadeActive ? crossfadeAudioRef.current : audioRef.current;
  }, [isCrossfadeActive]);

  // Reset UI timing when the track changes (prevents stale duration/currentTime from previous element)
  // NOTE: Do NOT include isCrossfadeActive in deps - it toggles during crossfade swap and would
  // reset timing when the new track is already ~5s in, causing the "restart at 5 seconds" bug.
  useEffect(() => {
    // During crossfade or shortly after swap, don't reset timing - the new track is already playing
    if (isCrossfadingRef.current || crossfadeCompleteRef.current) return;
    
    // Also skip if we just did a crossfade swap (within 2 seconds)
    const timeSinceSwap = Date.now() - lastCrossfadeSwapAtRef.current;
    if (timeSinceSwap < 2000) {
      dbg("trackChange: skip (post-swap window)", { trackId: currentTrack?.id, timeSinceSwap });
      return;
    }
    
    lastObservedTimeRef.current = 0;
    lastObservedTrackIdRef.current = currentTrack?.id ?? null;
    
    // Get the current time from the active audio element (may be >0 after crossfade)
    const activeAudio = isCrossfadeActive ? crossfadeAudioRef.current : audioRef.current;
    if (activeAudio && activeAudio.currentTime > 0.5) {
      // Track already playing (crossfade completed) - sync UI to actual position
      const time = activeAudio.currentTime;
      const dur = activeAudio.duration;
      setCurrentTime(time);
      if (isFinite(dur) && dur > 0) {
        setDuration(dur);
        setProgress([(time / dur) * 100]);
      }
    } else {
      // New track starting from beginning
      setCurrentTime(0);
      setProgress([0]);
      setDuration(0);
    }
    dbg("trackChange", { trackId: currentTrack?.id, isCrossfadeActive });
  }, [currentTrack?.id, dbg]);

  const handleTimeUpdate = (audioEl: HTMLAudioElement) => {
    // Only trust timeupdate from the currently active element.
    // During crossfade both elements can emit events; processing the inactive one can trigger wrong timers.
    const activeAudio = getActiveAudio();
    if (!activeAudio || audioEl !== activeAudio) return;

    const time = activeAudio.currentTime;

    // Detect the reported bug: time jumps backwards near ~5s on the new track
    const prev = lastObservedTimeRef.current;
    const trackId = currentTrack?.id ?? null;
    if (trackId && lastObservedTrackIdRef.current !== trackId) {
      lastObservedTrackIdRef.current = trackId;
      lastObservedTimeRef.current = 0;
    } else if (prev > 4.0 && time < prev - 1.0) {
      dbg("TIME JUMP BACK", {
        trackId,
        prev,
        now: time,
        activeEl: isCrossfadeActive ? "crossfade" : "main",
        src: activeAudio.src,
      });
    }

    lastObservedTimeRef.current = time;

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
  };

  const handleLoadedMetadata = (audioEl: HTMLAudioElement) => {
    const activeAudio = getActiveAudio();
    if (!activeAudio || audioEl !== activeAudio) return;

    const dur = activeAudio.duration;
    if (isFinite(dur) && dur > 0) setDuration(dur);

    dbg("loadedmetadata", {
      trackId: currentTrack?.id,
      activeEl: isCrossfadeActive ? "crossfade" : "main",
      duration: dur,
      src: activeAudio.src,
    });

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
      {/* Hidden Audio Elements - always render both so refs are stable */}
      <audio
        ref={audioRef}
        crossOrigin="anonymous"
        preload="auto"
        onTimeUpdate={(e) => handleTimeUpdate(e.currentTarget)}
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

          // If crossfade audio is the active player, main audio ending is just cleanup - don't advance
          if (isCrossfadeActive) {
            dbg("mainAudio onEnded: skip (crossfade audio is active)", { trackId: currentTrack?.id });
            return;
          }

          // If we're in the middle of a crossfade transition, don't advance (crossfade handles it)
          if (isCrossfadingRef.current || crossfadeTrackSwitchedRef.current) {
            dbg("mainAudio onEnded: skip (crossfade in progress)", { 
              isCrossfading: isCrossfadingRef.current, 
              trackSwitched: crossfadeTrackSwitchedRef.current 
            });
            return;
          }

          // Normal case - main audio is active and ended, go to next track
          dbg("mainAudio onEnded: advancing to next track", { trackId: currentTrack?.id });
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
      {/* Hidden crossfade audio element - preloaded ahead of time */}
      <audio 
        ref={crossfadeAudioRef}
        crossOrigin="anonymous"
        preload="auto"
        onTimeUpdate={(e) => handleTimeUpdate(e.currentTarget)}
        onLoadedMetadata={(e) => handleLoadedMetadata(e.currentTarget)}
        onError={(e) => handleAudioError(e.currentTarget)}
        onStalled={(e) => handleStalled(e.currentTarget)}
        onWaiting={(e) => handleStalled(e.currentTarget)}
        onEnded={handleCrossfadeEnded}
      />

      {/* Mobile Player Bar */}
      <div className="fixed bottom-0 pb-[var(--safe-bottom-tight)] md:hidden left-0 right-0 glass border-t border-border z-50 flex flex-col">
        {/* Track Info Row */}
        <div className="flex items-center gap-3 px-3 pt-2">
          <SignedImage
            src={currentTrack.cover}
            alt={currentTrack.title}
            className="w-10 h-10 rounded-md object-cover shadow-lg flex-shrink-0"
            fallbackSrc="/ambian-logo.png"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="font-medium text-foreground truncate text-sm">{currentTrack.title}</p>
              {isQuickMix && (
                <button
                  onClick={() => {
                    clearQuickMix();
                    toast({ title: "Exited Quick Mix" });
                  }}
                  className="flex items-center gap-0.5 px-1.5 py-0.5 bg-primary/20 text-primary text-[10px] font-medium rounded-full flex-shrink-0 hover:bg-primary/30 transition-colors active:scale-95"
                >
                  <ListMusic className="w-2.5 h-2.5" />
                  Mix ✕
                </button>
              )}
            </div>
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
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                softStopActiveAudio();
                resetCrossfadeState();
                // tiny delay to let gain ramp begin (prevents pop)
                window.setTimeout(() => handlePrevious(), 35);
              }}
              className="text-foreground h-11 w-11"
            >
              <SkipBack className="w-6 h-6" />
            </Button>
          </div>
          
          {/* Center play button */}
          <Button variant="player" size="icon" onClick={handleUserPlayPause} className="h-12 w-12 flex-shrink-0 mx-2">
            {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
          </Button>
          
          {/* Right controls - justify-start to push buttons toward center */}
          <div className="flex-1 flex items-center justify-start gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                softStopActiveAudio();
                resetCrossfadeState();
                window.setTimeout(() => handleNext(), 35);
              }}
              className="text-foreground h-11 w-11"
            >
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
              onClick={(e) => {
                handleCrossfadeToggle();
                toast({ title: crossfade ? "Crossfade disabled" : "Crossfade enabled" });
                (e.currentTarget as HTMLButtonElement).blur();
              }}
              className={cn("h-10 w-10 relative touch-manipulation", crossfade ? "text-primary" : "text-muted-foreground")}
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
            fallbackSrc="/ambian-logo.png"
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

        {/* Quick Mix Indicator - between track info and controls */}
        {isQuickMix && (
          <button
            onClick={() => {
              clearQuickMix();
              toast({ title: "Exited Quick Mix" });
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/20 text-primary text-sm font-medium rounded-full flex-shrink-0 hover:bg-primary/30 transition-colors cursor-pointer mx-4"
          >
            <ListMusic className="w-4 h-4" />
            Quick Mix ✕
          </button>
        )}

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
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                softStopActiveAudio();
                resetCrossfadeState();
                window.setTimeout(() => handlePrevious(), 35);
              }}
              className="text-foreground"
            >
              <SkipBack className="w-5 h-5" />
            </Button>
            <Button variant="player" size="iconLg" onClick={handleUserPlayPause} className="h-12 w-12">
              {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                softStopActiveAudio();
                resetCrossfadeState();
                window.setTimeout(() => handleNext(), 35);
              }}
              className="text-foreground"
            >
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
              onClick={(e) => {
                handleCrossfadeToggle();
                toast({ title: crossfade ? "Crossfade disabled" : "Crossfade enabled" });
                (e.currentTarget as HTMLButtonElement).blur();
              }}
              className={cn("relative touch-manipulation", crossfade ? "text-primary" : "text-muted-foreground hover:text-foreground")}
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
            onClick={async () => {
              await ensureAudioContextRunning();

              setIsMuted((prev) => {
                const next = !prev;
                // If user unmutes while the slider is at 0, restore a sane value.
                if (!next && volume[0] === 0) {
                  const restore = Math.max(5, userVolumeRef.current || 75);
                  setVolume([restore]);
                }
                return next;
              });
            }}
            className="text-muted-foreground hover:text-foreground"
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </Button>
          <Slider
            value={volume}
            onPointerDown={() => {
              // iOS requires resume() to happen in direct user gesture handlers
              void ensureAudioContextRunning();
            }}
            onValueChange={(next) => {
              void ensureAudioContextRunning();
              setVolume(next);
              if (next[0] > 0 && isMuted) setIsMuted(false);
            }}
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
