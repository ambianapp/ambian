import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Trash2, Music, Upload, Loader2, ListMusic, FileUp, FileAudio } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import AdminPlaylistManager from "@/components/admin/AdminPlaylistManager";

type Track = Tables<"tracks">;

const Admin = () => {
  const { user, isAdmin } = useAuth();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [isBulkAdding, setIsBulkAdding] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [bulkInput, setBulkInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newTrack, setNewTrack] = useState({
    title: "",
    artist: "",
    album: "",
    duration: "",
    cover_url: "",
    audio_url: "",
    genre: "",
  });
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!isAdmin) {
      navigate("/");
      return;
    }
    loadTracks();
  }, [isAdmin, navigate]);

  const loadTracks = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("tracks")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setTracks(data || []);
    }
    setIsLoading(false);
  };

  const handleAddTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTrack.title || !newTrack.artist) {
      toast({ title: "Error", description: "Title and artist are required", variant: "destructive" });
      return;
    }

    setIsAdding(true);
    const { error } = await supabase.from("tracks").insert([newTrack]);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Track added successfully" });
      setNewTrack({ title: "", artist: "", album: "", duration: "", cover_url: "", audio_url: "", genre: "" });
      loadTracks();
    }
    setIsAdding(false);
  };

  const handleBulkAdd = async () => {
    if (!bulkInput.trim()) {
      toast({ title: "Error", description: "Enter track data", variant: "destructive" });
      return;
    }

    setIsBulkAdding(true);
    const lines = bulkInput.trim().split("\n").filter(line => line.trim());
    const tracksToAdd: { title: string; artist: string; duration: string }[] = [];

    for (const line of lines) {
      // Format: "Title - Duration" or "Title    Duration" or just "Title"
      const parts = line.split(/\s{2,}|\t|-(?=\s*\d)/).map(p => p.trim()).filter(Boolean);
      if (parts.length >= 1) {
        const title = parts[0];
        const duration = parts[1] || "";
        tracksToAdd.push({ title, artist: "Unknown", duration });
      }
    }

    if (tracksToAdd.length === 0) {
      toast({ title: "Error", description: "No valid tracks found", variant: "destructive" });
      setIsBulkAdding(false);
      return;
    }

    const { error } = await supabase.from("tracks").insert(tracksToAdd);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: `${tracksToAdd.length} tracks added` });
      setBulkInput("");
      loadTracks();
    }
    setIsBulkAdding(false);
  };

  // Get audio duration using Audio API
  const getAudioDuration = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const audio = new Audio();
      audio.src = URL.createObjectURL(file);
      audio.addEventListener("loadedmetadata", () => {
        const minutes = Math.floor(audio.duration / 60);
        const seconds = Math.floor(audio.duration % 60);
        URL.revokeObjectURL(audio.src);
        resolve(`${minutes}:${seconds.toString().padStart(2, "0")}`);
      });
      audio.addEventListener("error", () => {
        URL.revokeObjectURL(audio.src);
        resolve("");
      });
    });
  };

  // Extract title from filename (remove extension and clean up)
  const getTitleFromFilename = (filename: string): string => {
    return filename
      .replace(/\.[^/.]+$/, "") // Remove extension
      .replace(/[-_]/g, " ") // Replace dashes/underscores with spaces
      .replace(/\s+/g, " ") // Collapse multiple spaces
      .trim();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setUploadProgress({ current: 0, total: files.length });

    let successCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadProgress({ current: i + 1, total: files.length });

      try {
        // Get duration from audio file
        const duration = await getAudioDuration(file);

        // Extract title from filename
        const title = getTitleFromFilename(file.name);

        // Generate unique filename
        const fileExt = file.name.split(".").pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

        // Upload to storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("audio")
          .upload(fileName, file);

        if (uploadError) {
          errors.push(`${file.name}: ${uploadError.message}`);
          continue;
        }

        // Get public URL
        const { data: urlData } = supabase.storage.from("audio").getPublicUrl(fileName);

        // Create track record
        const { error: insertError } = await supabase.from("tracks").insert({
          title,
          artist: "Unknown",
          duration,
          audio_url: urlData.publicUrl,
        });

        if (insertError) {
          errors.push(`${file.name}: ${insertError.message}`);
        } else {
          successCount++;
        }
      } catch (err) {
        errors.push(`${file.name}: Failed to process`);
      }
    }

    setIsUploading(false);
    setUploadProgress({ current: 0, total: 0 });

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    if (successCount > 0) {
      toast({ title: "Success", description: `${successCount} track(s) uploaded` });
      loadTracks();
    }

    if (errors.length > 0) {
      toast({
        title: "Some uploads failed",
        description: errors.slice(0, 3).join("\n"),
        variant: "destructive",
      });
    }
  };

  const handleDeleteTrack = async (id: string) => {
    const { error } = await supabase.from("tracks").delete().eq("id", id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Track deleted" });
      setTracks(tracks.filter((t) => t.id !== id));
    }
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Admin Panel</h1>
            <p className="text-muted-foreground">Manage music library and playlists</p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="tracks" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="tracks" className="flex items-center gap-2">
              <Music className="w-4 h-4" />
              Tracks
            </TabsTrigger>
            <TabsTrigger value="playlists" className="flex items-center gap-2">
              <ListMusic className="w-4 h-4" />
              Playlists
            </TabsTrigger>
          </TabsList>

          {/* Tracks Tab */}
          <TabsContent value="tracks" className="space-y-6 mt-6">
            {/* Upload MP3 Files */}
            <Card className="bg-card border-border border-dashed border-2 border-primary/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileAudio className="w-5 h-5 text-primary" />
                  Upload MP3 Files
                </CardTitle>
                <CardDescription>
                  Select multiple MP3 files. Title and duration are extracted automatically.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".mp3,audio/mpeg"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                  id="audio-upload"
                />
                <label
                  htmlFor="audio-upload"
                  className={`flex flex-col items-center justify-center p-8 border-2 border-dashed border-muted-foreground/30 rounded-lg cursor-pointer transition-colors hover:border-primary/50 hover:bg-primary/5 ${isUploading ? "pointer-events-none opacity-50" : ""}`}
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-10 h-10 text-primary animate-spin mb-3" />
                      <p className="text-foreground font-medium">
                        Uploading {uploadProgress.current} of {uploadProgress.total}...
                      </p>
                    </>
                  ) : (
                    <>
                      <FileAudio className="w-10 h-10 text-muted-foreground mb-3" />
                      <p className="text-foreground font-medium">Click to select MP3 files</p>
                      <p className="text-sm text-muted-foreground">or drag and drop</p>
                    </>
                  )}
                </label>
              </CardContent>
            </Card>

            {/* Bulk Add Tracks */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileUp className="w-5 h-5" />
                  Bulk Add Tracks (Text)
                </CardTitle>
                <CardDescription>
                  Paste multiple tracks, one per line. Format: "Title - Duration" or "Title   Duration"
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={bulkInput}
                  onChange={(e) => setBulkInput(e.target.value)}
                  placeholder={`Ocean Waves - 3:42\nForest Rain - 5:15\nMorning Birds   4:30\nPeaceful Stream`}
                  className="bg-card min-h-[150px] font-mono text-sm"
                  rows={8}
                />
                <Button onClick={handleBulkAdd} disabled={isBulkAdding}>
                  {isBulkAdding ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                  Add All Tracks
                </Button>
              </CardContent>
            </Card>

            {/* Add Single Track Form */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="w-5 h-5" />
                  Add Single Track
                </CardTitle>
                <CardDescription>Add a track with full details</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAddTrack} className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Title *</Label>
                    <Input
                      id="title"
                      value={newTrack.title}
                      onChange={(e) => setNewTrack({ ...newTrack, title: e.target.value })}
                      placeholder="Track title"
                      className="bg-card"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="artist">Artist *</Label>
                    <Input
                      id="artist"
                      value={newTrack.artist}
                      onChange={(e) => setNewTrack({ ...newTrack, artist: e.target.value })}
                      placeholder="Artist name"
                      className="bg-card"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="album">Album</Label>
                    <Input
                      id="album"
                      value={newTrack.album}
                      onChange={(e) => setNewTrack({ ...newTrack, album: e.target.value })}
                      placeholder="Album name"
                      className="bg-card"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="genre">Genre</Label>
                    <Input
                      id="genre"
                      value={newTrack.genre}
                      onChange={(e) => setNewTrack({ ...newTrack, genre: e.target.value })}
                      placeholder="Genre"
                      className="bg-card"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="duration">Duration</Label>
                    <Input
                      id="duration"
                      value={newTrack.duration}
                      onChange={(e) => setNewTrack({ ...newTrack, duration: e.target.value })}
                      placeholder="3:45"
                      className="bg-card"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cover_url">Cover URL</Label>
                    <Input
                      id="cover_url"
                      value={newTrack.cover_url}
                      onChange={(e) => setNewTrack({ ...newTrack, cover_url: e.target.value })}
                      placeholder="https://..."
                      className="bg-card"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="audio_url">Audio URL</Label>
                    <Input
                      id="audio_url"
                      value={newTrack.audio_url}
                      onChange={(e) => setNewTrack({ ...newTrack, audio_url: e.target.value })}
                      placeholder="https://..."
                      className="bg-card"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Button type="submit" disabled={isAdding}>
                      {isAdding ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                      Add Track
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {/* Track List */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Music className="w-5 h-5" />
                  Music Library ({tracks.length} tracks)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : tracks.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    No tracks yet. Add your first track above.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {tracks.map((track) => (
                      <div
                        key={track.id}
                        className="flex items-center gap-4 p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
                      >
                        {track.cover_url ? (
                          <img
                            src={track.cover_url}
                            alt={track.title}
                            className="w-12 h-12 rounded object-cover"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded bg-muted flex items-center justify-center">
                            <Music className="w-5 h-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground truncate">{track.title}</p>
                          <p className="text-sm text-muted-foreground truncate">
                            {track.artist} {track.album && `• ${track.album}`}
                          </p>
                        </div>
                        <span className="text-sm text-muted-foreground">{track.genre}</span>
                        <span className="text-sm text-muted-foreground">{track.duration}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteTrack(track.id)}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Playlists Tab */}
          <TabsContent value="playlists" className="mt-6">
            <AdminPlaylistManager />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Admin;
