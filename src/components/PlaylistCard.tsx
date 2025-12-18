import { useState } from "react";
import { Play, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Playlist } from "@/data/musicData";
import { useAuth } from "@/contexts/AuthContext";

interface PlaylistCardProps {
  playlist: Playlist;
  onClick: () => void;
  onPlay?: () => void;
  onUpdate?: (id: string, data: { name: string; description: string; cover: string }) => void;
}

const PlaylistCard = ({ playlist, onClick, onPlay, onUpdate }: PlaylistCardProps) => {
  const { isAdmin } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    name: playlist.name,
    description: playlist.description,
    cover: playlist.cover,
  });

  const handleSave = () => {
    onUpdate?.(playlist.id, editData);
    setIsEditing(false);
  };

  return (
    <>
      <div className="group p-4 rounded-xl bg-card/50 hover:bg-card transition-all duration-300 text-left relative">
        {isAdmin && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 hover:bg-background"
            onClick={(e) => {
              e.stopPropagation();
              setIsEditing(true);
            }}
          >
            <Pencil className="w-4 h-4" />
          </Button>
        )}
        <button onClick={onClick} className="w-full text-left">
          <div className="relative mb-4">
            <img
              src={playlist.cover}
              alt={playlist.name}
              className="w-full aspect-square object-cover rounded-lg shadow-lg group-hover:shadow-xl transition-shadow"
            />
            <Button
              variant="player"
              size="iconLg"
              className="absolute bottom-2 right-2 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 shadow-2xl"
              onClick={(e) => {
                e.stopPropagation();
                if (onPlay) {
                  onPlay();
                } else {
                  onClick();
                }
              }}
            >
              <Play className="w-6 h-6 ml-0.5" />
            </Button>
          </div>
          <h3 className="font-semibold text-foreground truncate">{playlist.name}</h3>
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{playlist.description}</p>
        </button>
      </div>

      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent className="bg-card">
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
              <Label htmlFor="edit-cover">Cover URL</Label>
              <Input
                id="edit-cover"
                value={editData.cover}
                onChange={(e) => setEditData({ ...editData, cover: e.target.value })}
                className="bg-background"
              />
              {editData.cover && (
                <img src={editData.cover} alt="Preview" className="w-20 h-20 object-cover rounded-lg mt-2" />
              )}
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
