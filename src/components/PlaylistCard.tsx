import { useState, useRef } from "react";
import { Play, Pencil, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Playlist } from "@/data/musicData";
import { useAuth } from "@/contexts/AuthContext";
import SignedImage from "@/components/SignedImage";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface PlaylistCardProps {
  playlist: Playlist;
  onClick: () => void;
  onPlay?: () => void;
  onUpdate?: (id: string, data: { name: string; description: string; cover: string }) => void;
  compact?: boolean;
}

const PlaylistCard = ({ playlist, onClick, onPlay, onUpdate, compact = false }: PlaylistCardProps) => {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editData, setEditData] = useState({
    name: playlist.name,
    description: playlist.description,
    cover: playlist.cover,
  });

  const handleCoverUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Error", description: "Please select an image file", variant: "destructive" });
      return;
    }

    setIsUploadingCover(true);
    try {
      const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
      
      const { error: uploadError } = await supabase.storage
        .from("playlist-covers")
        .upload(fileName, file, { contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("playlist-covers").getPublicUrl(fileName);
      setEditData(prev => ({ ...prev, cover: urlData.publicUrl }));
      toast({ title: "Success", description: "Cover uploaded" });
    } catch (err: any) {
      console.error("Cover upload error:", err);
      toast({ title: "Error", description: err.message || "Failed to upload", variant: "destructive" });
    } finally {
      setIsUploadingCover(false);
    }
  };

  const handleSave = () => {
    onUpdate?.(playlist.id, editData);
    setIsEditing(false);
  };

  return (
    <>
      <div className={`group rounded-xl bg-card/50 hover:bg-card transition-all duration-300 text-left relative ${compact ? "p-2" : "p-4"}`}>
        {isAdmin && (
          <Button
            variant="ghost"
            size="icon"
            className={`absolute top-1 right-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 hover:bg-background ${compact ? "w-6 h-6" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              setIsEditing(true);
            }}
          >
            <Pencil className={compact ? "w-3 h-3" : "w-4 h-4"} />
          </Button>
        )}
        <button onClick={onClick} className="w-full text-left">
          <div className={`relative ${compact ? "mb-2" : "mb-4"}`}>
            <SignedImage
              src={playlist.cover}
              alt={`${playlist.name} playlist cover`}
              className="w-full aspect-square object-cover rounded-lg shadow-lg group-hover:shadow-xl transition-shadow"
              fallbackSrc="/placeholder.svg"
            />
            <Button
              variant="player"
              size={compact ? "icon" : "iconLg"}
              className={`absolute bottom-1 right-1 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 shadow-2xl ${compact ? "w-8 h-8" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                if (onPlay) {
                  onPlay();
                } else {
                  onClick();
                }
              }}
            >
              <Play className={compact ? "w-4 h-4 ml-0.5" : "w-6 h-6 ml-0.5"} />
            </Button>
          </div>
          <h3 className={`font-semibold text-foreground truncate ${compact ? "text-sm" : ""}`}>{playlist.name}</h3>
          {!compact && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{playlist.description}</p>}
        </button>
      </div>

      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent className="bg-card" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Edit Playlist</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={editData.name}
                onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                className="bg-background"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={editData.description}
                onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                className="bg-background"
              />
            </div>
            <div className="space-y-2">
              <Label>Cover Image</Label>
              <div className="flex items-center gap-3">
                {editData.cover && (
                  <SignedImage 
                    src={editData.cover} 
                    alt="Preview" 
                    className="w-20 h-20 object-cover rounded-lg"
                    fallbackSrc="/placeholder.svg"
                  />
                )}
                <div className="flex-1 space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleCoverUpload(file);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingCover}
                  >
                    {isUploadingCover ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading...</>
                    ) : (
                      <><Upload className="w-4 h-4 mr-2" /> Upload Image</>
                    )}
                  </Button>
                  <Input
                    placeholder="Or paste image URL"
                    value={editData.cover}
                    onChange={(e) => setEditData({ ...editData, cover: e.target.value })}
                    className="bg-background text-xs"
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
            <Button onClick={handleSave}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PlaylistCard;
