import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Trash2, Music, Upload, Loader2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Track = Tables<"tracks">;

const Admin = () => {
  const { user, isAdmin } = useAuth();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
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
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Admin Panel</h1>
            <p className="text-muted-foreground">Manage music library</p>
          </div>
        </div>

        {/* Add Track Form */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Add New Track
            </CardTitle>
            <CardDescription>Add a new track to the music library</CardDescription>
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
      </div>
    </div>
  );
};

export default Admin;
