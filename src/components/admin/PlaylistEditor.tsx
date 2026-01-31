import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import * as musicMetadata from "music-metadata-browser";

import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Trash2, Music, ArrowRightLeft, Loader2, ListMusic, FileUp, Upload, ImageIcon, Pencil, Star } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { Tables } from "@/integrations/supabase/types";
import { compressImage } from "@/lib/imageCompression";

type Playlist = Tables<"playlists">;
type Track = Tables<"tracks">;

interface PlaylistTrackWithDetails {
  id: string;
  track_id: string;
  position: number | null;
  is_featured: boolean;
  track: Track;
}

interface PlaylistEditorProps {
  playlist: Playlist;
  allPlaylists: Playlist[];
  onBack: () => void;
}

interface UploadProgress {
  total: number;
  completed: number;
  current: string;
}

const PlaylistEditor = ({ playlist, allPlaylists, onBack }: PlaylistEditorProps) => {
  const [playlistTracks, setPlaylistTracks] = useState<PlaylistTrackWithDetails[]>([]);
  const [allTracks, setAllTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTrackToAdd, setSelectedTrackToAdd] = useState<string>("");
  const [selectedTracksToTransfer, setSelectedTracksToTransfer] = useState<Set<string>>(new Set());
  const [transferTargetPlaylist, setTransferTargetPlaylist] = useState<string>("");
  const [isTransferring, setIsTransferring] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [currentCoverUrl, setCurrentCoverUrl] = useState<string | null>(playlist.cover_url);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, [playlist.id]);

  const loadData = async () => {
    setIsLoading(true);
    
    // Load playlist tracks with track details
    const { data: ptData, error: ptError } = await supabase
      .from("playlist_tracks")
      .select("id, track_id, position, is_featured, tracks(*)")
      .eq("playlist_id", playlist.id)
      .order("position", { ascending: true });

    if (ptError) {
      toast({ title: "Error", description: ptError.message, variant: "destructive" });
    } else {
      const formattedTracks = (ptData || []).map((pt: any) => ({
        id: pt.id,
        track_id: pt.track_id,
        position: pt.position,
        is_featured: pt.is_featured ?? false,
        track: pt.tracks as Track,
      }));
      // Sort: featured first (by position), then non-featured alphabetically
      formattedTracks.sort((a: PlaylistTrackWithDetails, b: PlaylistTrackWithDetails) => {
        if (a.is_featured && !b.is_featured) return -1;
        if (!a.is_featured && b.is_featured) return 1;
        if (a.is_featured && b.is_featured) {
          return (a.position || 0) - (b.position || 0);
        }
        return a.track.title.localeCompare(b.track.title, undefined, { numeric: true, sensitivity: 'base' });
      });
      setPlaylistTracks(formattedTracks);
    }

    // Load all tracks
    const { data: tracksData, error: tracksError } = await supabase
      .from("tracks")
      .select("*")
      .order("title");

    if (tracksError) {
      toast({ title: "Error", description: tracksError.message, variant: "destructive" });
    } else {
      setAllTracks(tracksData || []);
    }

    setIsLoading(false);
  };

  // Extract duration from audio file
  const getAudioDuration = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const audio = new Audio();
      audio.onloadedmetadata = () => {
        const mins = Math.floor(audio.duration / 60);
        const secs = Math.floor(audio.duration % 60);
        resolve(`${mins}:${secs.toString().padStart(2, "0")}`);
        URL.revokeObjectURL(audio.src);
      };
      audio.onerror = () => {
        resolve("0:00");
        URL.revokeObjectURL(audio.src);
      };
      audio.src = URL.createObjectURL(file);
    });
  };

  // Handle cover image upload
  const handleCoverUpload = async (file: File) => {
    const maxCoverSize = 10 * 1024 * 1024; // 10MB (will be compressed)
    
    if (!file.type.startsWith("image/")) {
      toast({ title: "Error", description: "Please select an image file (JPG, PNG)", variant: "destructive" });
      return;
    }

    if (file.size > maxCoverSize) {
      toast({ title: "Error", description: "Cover image must be under 10MB", variant: "destructive" });
      return;
    }

    setIsUploadingCover(true);

    try {
      // Compress image before upload
      const compressedFile = await compressImage(file, {
        maxWidth: 500,
        maxHeight: 500,
        quality: 0.85,
        format: 'jpeg'
      });
      
      const fileName = `${Date.now()}-${compressedFile.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
      
      const { error: uploadError } = await supabase.storage
        .from("playlist-covers")
        .upload(fileName, compressedFile, { contentType: compressedFile.type });

      if (uploadError) {
        throw uploadError;
      }

      const { data: urlData } = supabase.storage.from("playlist-covers").getPublicUrl(fileName);
      const newCoverUrl = urlData.publicUrl;

      // Update playlist in database
      const { error: updateError } = await supabase
        .from("playlists")
        .update({ cover_url: newCoverUrl })
        .eq("id", playlist.id);

      if (updateError) {
        throw updateError;
      }

      setCurrentCoverUrl(newCoverUrl);
      toast({ title: "Success", description: "Cover image updated" });
    } catch (err: any) {
      console.error("Cover upload error:", err);
      toast({ title: "Error", description: err.message || "Failed to upload cover", variant: "destructive" });
    } finally {
      setIsUploadingCover(false);
    }
  };

  // Extract title from filename
  const getTitleFromFilename = (filename: string): string => {
    return filename
      .replace(/\.[^/.]+$/, "") // Remove extension
      .replace(/[-_]/g, " ") // Replace dashes/underscores with spaces
      .replace(/\s+/g, " ") // Normalize spaces
      .trim();
  };

  // File size limits (in bytes)
  const MAX_AUDIO_FILE_SIZE = 50 * 1024 * 1024; // 50MB
  const MAX_IMAGE_FILE_SIZE = 5 * 1024 * 1024; // 5MB

  // Handle MP3 file uploads
  const handleFileUpload = async (files: FileList | File[]) => {
    const mp3Files = Array.from(files).filter(
      (file) => file.type === "audio/mpeg" || file.name.toLowerCase().endsWith(".mp3")
    );

    if (mp3Files.length === 0) {
      toast({ title: "Error", description: "Please select MP3 files", variant: "destructive" });
      return;
    }

    // Validate file sizes
    const oversizedFiles = mp3Files.filter(file => file.size > MAX_AUDIO_FILE_SIZE);
    if (oversizedFiles.length > 0) {
      toast({ 
        title: "Error", 
        description: `${oversizedFiles.length} file(s) exceed the 50MB limit`, 
        variant: "destructive" 
      });
      return;
    }

    setUploadProgress({ total: mp3Files.length, completed: 0, current: "" });

    const maxPosition = playlistTracks.reduce((max, pt) => Math.max(max, pt.position || 0), 0);
    let successCount = 0;

    for (let i = 0; i < mp3Files.length; i++) {
      const file = mp3Files[i];
      let title = getTitleFromFilename(file.name);
      let artist = "Unknown";
      let album: string | undefined;
      let coverUrl: string | undefined;
      
      setUploadProgress({ total: mp3Files.length, completed: i, current: title });

      try {
        // Extract metadata from MP3 using music-metadata-browser
        const metadata = await musicMetadata.parseBlob(file);
        
        // Use metadata title/artist if available
        if (metadata.common.title) {
          title = metadata.common.title;
        }
        if (metadata.common.artist) {
          artist = metadata.common.artist;
        }
        if (metadata.common.album) {
          album = metadata.common.album;
        }

        // Get duration from metadata or fallback to audio element
        let duration: string;
        if (metadata.format.duration) {
          const mins = Math.floor(metadata.format.duration / 60);
          const secs = Math.floor(metadata.format.duration % 60);
          duration = `${mins}:${secs.toString().padStart(2, "0")}`;
        } else {
          duration = await getAudioDuration(file);
        }

        // Extract and upload cover art if present
        const pictures = metadata.common.picture;
        if (pictures && pictures.length > 0) {
          const picture = pictures[0];
          const coverFileName = `covers/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}.${picture.format.split("/")[1] || "jpg"}`;
          
          // Create Uint8Array from picture data to ensure compatibility
          const coverData = new Uint8Array(picture.data);
          const coverBlob = new Blob([coverData], { type: picture.format });
          
          const { error: coverUploadError } = await supabase.storage
            .from("audio")
            .upload(coverFileName, coverBlob, {
              contentType: picture.format,
            });

          if (!coverUploadError) {
            const { data: coverUrlData } = supabase.storage.from("audio").getPublicUrl(coverFileName);
            coverUrl = coverUrlData.publicUrl;
          } else {
            console.warn(`Failed to upload cover for ${file.name}:`, coverUploadError);
          }
        }

        // Upload audio to storage
        const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
        const { error: uploadError } = await supabase.storage
          .from("audio")
          .upload(fileName, file);

        if (uploadError) {
          console.error(`Failed to upload ${file.name}:`, uploadError);
          continue;
        }

        // Get public URL
        const { data: urlData } = supabase.storage.from("audio").getPublicUrl(fileName);

        // Create track record with extracted metadata
        const { data: newTrack, error: trackError } = await supabase
          .from("tracks")
          .insert({
            title,
            artist,
            album,
            duration,
            audio_url: urlData.publicUrl,
            cover_url: coverUrl,
          })
          .select("id")
          .single();

        if (trackError || !newTrack) {
          console.error(`Failed to create track for ${file.name}:`, trackError);
          continue;
        }

        // Add to playlist
        const { error: linkError } = await supabase.from("playlist_tracks").insert({
          playlist_id: playlist.id,
          track_id: newTrack.id,
          position: maxPosition + successCount + 1,
        });

        if (!linkError) {
          successCount++;
        }
      } catch (err) {
        console.error(`Error processing ${file.name}:`, err);
      }
    }

    setUploadProgress(null);

    if (successCount > 0) {
      toast({ title: "Success", description: `${successCount} of ${mp3Files.length} tracks imported` });
      loadData();
    } else {
      toast({ title: "Error", description: "Failed to import tracks", variant: "destructive" });
    }
  };

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropZoneRef.current && !dropZoneRef.current.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files);
    }
  }, [playlistTracks, playlist.id]);


  const handleAddTrack = async () => {
    if (!selectedTrackToAdd) return;

    // Check if track already in playlist
    if (playlistTracks.some((pt) => pt.track_id === selectedTrackToAdd)) {
      toast({ title: "Info", description: "Track already in playlist" });
      return;
    }

    const maxPosition = playlistTracks.reduce((max, pt) => Math.max(max, pt.position || 0), 0);

    const { error } = await supabase.from("playlist_tracks").insert([
      {
        playlist_id: playlist.id,
        track_id: selectedTrackToAdd,
        position: maxPosition + 1,
      },
    ]);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Track added to playlist" });
      setSelectedTrackToAdd("");
      loadData();
    }
  };

  const handleRemoveTrack = async (playlistTrackId: string) => {
    const { error } = await supabase.from("playlist_tracks").delete().eq("id", playlistTrackId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Track removed from playlist" });
      setPlaylistTracks(playlistTracks.filter((pt) => pt.id !== playlistTrackId));
      setSelectedTracksToTransfer((prev) => {
        const next = new Set(prev);
        next.delete(playlistTrackId);
        return next;
      });
    }
  };

  const toggleTrackSelection = (playlistTrackId: string) => {
    setSelectedTracksToTransfer((prev) => {
      const next = new Set(prev);
      if (next.has(playlistTrackId)) {
        next.delete(playlistTrackId);
      } else {
        next.add(playlistTrackId);
      }
      return next;
    });
  };

  const handleTransferTracks = async () => {
    if (!transferTargetPlaylist || selectedTracksToTransfer.size === 0) return;

    setIsTransferring(true);

    // Get the track IDs from selected playlist tracks
    const trackIds = playlistTracks
      .filter((pt) => selectedTracksToTransfer.has(pt.id))
      .map((pt) => pt.track_id);

    // Check which tracks already exist in target playlist
    const { data: existingTracks } = await supabase
      .from("playlist_tracks")
      .select("track_id")
      .eq("playlist_id", transferTargetPlaylist)
      .in("track_id", trackIds);

    const existingTrackIds = new Set((existingTracks || []).map((t) => t.track_id));
    const newTrackIds = trackIds.filter((id) => !existingTrackIds.has(id));

    if (newTrackIds.length === 0) {
      toast({ title: "Info", description: "All selected tracks already exist in target playlist" });
      setIsTransferring(false);
      return;
    }

    // Get max position in target playlist
    const { data: targetTracks } = await supabase
      .from("playlist_tracks")
      .select("position")
      .eq("playlist_id", transferTargetPlaylist)
      .order("position", { ascending: false })
      .limit(1);

    let maxPosition = (targetTracks && targetTracks[0]?.position) || 0;

    // Insert tracks into target playlist
    const inserts = newTrackIds.map((trackId, index) => ({
      playlist_id: transferTargetPlaylist,
      track_id: trackId,
      position: maxPosition + index + 1,
    }));

    const { error } = await supabase.from("playlist_tracks").insert(inserts);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      const skipped = trackIds.length - newTrackIds.length;
      let message = `${newTrackIds.length} track(s) transferred`;
      if (skipped > 0) message += `, ${skipped} already existed`;
      toast({ title: "Success", description: message });
      setSelectedTracksToTransfer(new Set());
      setTransferTargetPlaylist("");
    }

    setIsTransferring(false);
  };

  const availableTracksToAdd = allTracks.filter(
    (track) => !playlistTracks.some((pt) => pt.track_id === track.id)
  );

  const otherPlaylists = allPlaylists.filter((p) => p.id !== playlist.id);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-4">
          {/* Editable Cover */}
          <div 
            className="w-20 h-20 rounded-lg overflow-hidden bg-muted flex-shrink-0 relative group cursor-pointer"
            onClick={() => coverInputRef.current?.click()}
          >
            {currentCoverUrl ? (
              <img src={currentCoverUrl} alt={playlist.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ListMusic className="w-10 h-10 text-muted-foreground" />
              </div>
            )}
            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              {isUploadingCover ? (
                <Loader2 className="w-6 h-6 text-white animate-spin" />
              ) : (
                <div className="text-center">
                  <Pencil className="w-5 h-5 text-white mx-auto mb-1" />
                  <span className="text-xs text-white">Change</span>
                </div>
              )}
            </div>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleCoverUpload(e.target.files[0])}
            />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">{playlist.name}</h2>
            <p className="text-muted-foreground">{playlistTracks.length} tracks</p>
            <p className="text-xs text-muted-foreground mt-1">Click cover to change (JPG, PNG)</p>
          </div>
        </div>
      </div>

      {/* Drag & Drop MP3 Import */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Import MP3 Files
          </CardTitle>
          <CardDescription>
            Drag and drop MP3 files here to import them. Title and duration are extracted automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            ref={dropZoneRef}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragging
                ? "border-primary bg-primary/10"
                : "border-muted-foreground/30 hover:border-primary/50"
            }`}
          >
            {uploadProgress ? (
              <div className="space-y-4">
                <Loader2 className="w-10 h-10 mx-auto animate-spin text-primary" />
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Importing {uploadProgress.completed + 1} of {uploadProgress.total}
                  </p>
                  <p className="text-sm font-medium text-foreground truncate px-4">
                    {uploadProgress.current}
                  </p>
                  <Progress 
                    value={(uploadProgress.completed / uploadProgress.total) * 100} 
                    className="h-2"
                  />
                </div>
              </div>
            ) : (
              <>
                <Upload className={`w-10 h-10 mx-auto mb-4 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
                <p className="text-lg font-medium text-foreground mb-2">
                  {isDragging ? "Drop MP3 files here" : "Drag & drop MP3 files"}
                </p>
                <p className="text-sm text-muted-foreground mb-4">
                  or click to browse
                </p>
                <input
                  type="file"
                  accept=".mp3,audio/mpeg"
                  multiple
                  onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
                  className="hidden"
                  id="mp3-file-input"
                />
                <Button
                  variant="outline"
                  onClick={() => document.getElementById("mp3-file-input")?.click()}
                >
                  <FileUp className="w-4 h-4 mr-2" />
                  Select Files
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>


      {/* Add Existing Track */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Add Existing Track
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Select value={selectedTrackToAdd} onValueChange={setSelectedTrackToAdd}>
              <SelectTrigger className="flex-1 bg-card">
                <SelectValue placeholder="Select a track to add" />
              </SelectTrigger>
              <SelectContent>
                {availableTracksToAdd.map((track) => (
                  <SelectItem key={track.id} value={track.id}>
                    {track.title} - {track.artist}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleAddTrack} disabled={!selectedTrackToAdd}>
              <Plus className="w-4 h-4 mr-2" />
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Transfer Controls */}
      {selectedTracksToTransfer.size > 0 && otherPlaylists.length > 0 && (
        <Card className="bg-primary/10 border-primary/20">
          <CardContent className="pt-4">
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-foreground font-medium">
                {selectedTracksToTransfer.size} track(s) selected
              </span>
              <Select value={transferTargetPlaylist} onValueChange={setTransferTargetPlaylist}>
                <SelectTrigger className="w-[200px] bg-card">
                  <SelectValue placeholder="Transfer to..." />
                </SelectTrigger>
                <SelectContent>
                  {otherPlaylists.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={handleTransferTracks}
                disabled={!transferTargetPlaylist || isTransferring}
              >
                {isTransferring ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <ArrowRightLeft className="w-4 h-4 mr-2" />
                )}
                Transfer
              </Button>
              <Button variant="ghost" onClick={() => setSelectedTracksToTransfer(new Set())}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Track List */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Music className="w-5 h-5" />
            Tracks in Playlist
          </CardTitle>
          <CardDescription>
            Click tracks to select for transfer. Star icon marks featured tracks (shown first to users).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : playlistTracks.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No tracks in this playlist yet.
            </p>
          ) : (
            <div className="space-y-2">
              {playlistTracks.map((pt, index) => {
                const featuredCount = playlistTracks.filter(t => t.is_featured).length;
                return (
                  <div
                    key={pt.id}
                    className={`flex items-center gap-4 p-3 rounded-lg transition-colors cursor-pointer ${
                      selectedTracksToTransfer.has(pt.id)
                        ? "bg-primary/20 ring-2 ring-primary"
                        : pt.is_featured
                        ? "bg-amber-500/10 ring-1 ring-amber-500/30"
                        : "bg-secondary/50 hover:bg-secondary"
                    }`}
                    onClick={() => toggleTrackSelection(pt.id)}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`flex-shrink-0 ${pt.is_featured ? "text-amber-500" : "text-muted-foreground hover:text-amber-500"}`}
                      onClick={async (e) => {
                        e.stopPropagation();
                        // Limit to 3 featured tracks
                        if (!pt.is_featured && featuredCount >= 3) {
                          toast({ title: "Limit reached", description: "Maximum 3 featured tracks allowed", variant: "destructive" });
                          return;
                        }
                        const newFeatured = !pt.is_featured;
                        const newPosition = newFeatured ? featuredCount + 1 : 0;
                        const { error } = await supabase
                          .from("playlist_tracks")
                          .update({ is_featured: newFeatured, position: newPosition })
                          .eq("id", pt.id);
                        if (error) {
                          toast({ title: "Error", description: error.message, variant: "destructive" });
                        } else {
                          loadData();
                        }
                      }}
                    >
                      <Star className={`w-4 h-4 ${pt.is_featured ? "fill-current" : ""}`} />
                    </Button>
                    {pt.track.cover_url ? (
                      <img
                        src={pt.track.cover_url}
                        alt={pt.track.title}
                        className="w-12 h-12 rounded object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded bg-muted flex items-center justify-center flex-shrink-0">
                        <Music className="w-5 h-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-foreground truncate">{pt.track.title}</p>
                        {pt.is_featured && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-500">
                            #{playlistTracks.filter(t => t.is_featured).findIndex(t => t.id === pt.id) + 1}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {pt.track.artist} {pt.track.album && `• ${pt.track.album}`}
                      </p>
                    </div>
                    <span className="text-sm text-muted-foreground">{pt.track.duration}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveTrack(pt.id);
                      }}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PlaylistEditor;
