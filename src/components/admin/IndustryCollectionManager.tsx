import { useState, useEffect } from "react";
import { Plus, Trash2, Edit, GripVertical, Save, X, Sparkles, Scissors, Dumbbell, UtensilsCrossed, ShoppingBag, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface IndustryCollection {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  cover_url: string | null;
  display_order: number;
  is_active: boolean;
}

interface Playlist {
  id: string;
  name: string;
  cover_url: string | null;
}

interface CollectionPlaylist {
  id: string;
  playlist_id: string;
  display_order: number;
  playlist: Playlist;
}

const iconOptions = [
  { value: "Sparkles", label: "Sparkles (Spa)", icon: Sparkles },
  { value: "Scissors", label: "Scissors (Salon)", icon: Scissors },
  { value: "Dumbbell", label: "Dumbbell (Gym)", icon: Dumbbell },
  { value: "UtensilsCrossed", label: "Utensils (Restaurant)", icon: UtensilsCrossed },
  { value: "ShoppingBag", label: "Shopping Bag (Retail)", icon: ShoppingBag },
  { value: "Building2", label: "Building (Hotel)", icon: Building2 },
];

const IndustryCollectionManager = () => {
  const { toast } = useToast();
  const [collections, setCollections] = useState<IndustryCollection[]>([]);
  const [allPlaylists, setAllPlaylists] = useState<Playlist[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<IndustryCollection | null>(null);
  const [collectionPlaylists, setCollectionPlaylists] = useState<CollectionPlaylist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    icon: "Sparkles",
    is_active: true,
  });

  useEffect(() => {
    loadCollections();
    loadAllPlaylists();
  }, []);

  const loadCollections = async () => {
    const { data } = await supabase
      .from("industry_collections")
      .select("*")
      .order("display_order", { ascending: true });

    setCollections(data || []);
    setIsLoading(false);
  };

  const loadAllPlaylists = async () => {
    const { data } = await supabase
      .from("playlists")
      .select("id, name, cover_url")
      .eq("is_system", true)
      .order("name", { ascending: true });

    setAllPlaylists(data || []);
  };

  const loadCollectionPlaylists = async (collectionId: string) => {
    const { data } = await supabase
      .from("industry_collection_playlists")
      .select(`
        id,
        playlist_id,
        display_order,
        playlists (
          id,
          name,
          cover_url
        )
      `)
      .eq("collection_id", collectionId)
      .order("display_order", { ascending: true });

    const mapped = (data || []).map((item: any) => ({
      id: item.id,
      playlist_id: item.playlist_id,
      display_order: item.display_order,
      playlist: item.playlists,
    }));

    setCollectionPlaylists(mapped);
  };

  const handleCreateCollection = async () => {
    const maxOrder = collections.length > 0 ? Math.max(...collections.map(c => c.display_order)) : 0;

    const { error } = await supabase.from("industry_collections").insert({
      name: formData.name,
      description: formData.description || null,
      icon: formData.icon,
      is_active: formData.is_active,
      display_order: maxOrder + 1,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Collection created" });
      setFormData({ name: "", description: "", icon: "Sparkles", is_active: true });
      setIsDialogOpen(false);
      loadCollections();
    }
  };

  const handleUpdateCollection = async () => {
    if (!selectedCollection) return;

    const { error } = await supabase
      .from("industry_collections")
      .update({
        name: formData.name,
        description: formData.description || null,
        icon: formData.icon,
        is_active: formData.is_active,
      })
      .eq("id", selectedCollection.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Collection updated" });
      setEditMode(false);
      loadCollections();
    }
  };

  const handleDeleteCollection = async (id: string) => {
    const { error } = await supabase.from("industry_collections").delete().eq("id", id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Collection deleted" });
      if (selectedCollection?.id === id) {
        setSelectedCollection(null);
      }
      loadCollections();
    }
  };

  const handleAddPlaylist = async (playlistId: string) => {
    if (!selectedCollection) return;

    const maxOrder = collectionPlaylists.length > 0 ? Math.max(...collectionPlaylists.map(p => p.display_order)) : 0;

    const { error } = await supabase.from("industry_collection_playlists").insert({
      collection_id: selectedCollection.id,
      playlist_id: playlistId,
      display_order: maxOrder + 1,
    });

    if (error) {
      if (error.code === "23505") {
        toast({ title: "Already added", description: "This playlist is already in the collection", variant: "destructive" });
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    } else {
      toast({ title: "Success", description: "Playlist added to collection" });
      loadCollectionPlaylists(selectedCollection.id);
    }
  };

  const handleRemovePlaylist = async (collectionPlaylistId: string) => {
    const { error } = await supabase.from("industry_collection_playlists").delete().eq("id", collectionPlaylistId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Playlist removed from collection" });
      if (selectedCollection) {
        loadCollectionPlaylists(selectedCollection.id);
      }
    }
  };

  const handleSelectCollection = (collection: IndustryCollection) => {
    setSelectedCollection(collection);
    setFormData({
      name: collection.name,
      description: collection.description || "",
      icon: collection.icon || "Sparkles",
      is_active: collection.is_active,
    });
    setEditMode(false);
    loadCollectionPlaylists(collection.id);
  };

  const getAvailablePlaylists = () => {
    const usedIds = new Set(collectionPlaylists.map(cp => cp.playlist_id));
    return allPlaylists.filter(p => !usedIds.has(p.id));
  };

  const getIconComponent = (iconName: string | null) => {
    const found = iconOptions.find(o => o.value === iconName);
    return found?.icon || Sparkles;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Industry Collections</h2>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add Collection
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Industry Collection</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label>Name</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Spa & Wellness"
                />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Short description..."
                />
              </div>
              <div>
                <Label>Icon</Label>
                <Select
                  value={formData.icon}
                  onValueChange={(value) => setFormData({ ...formData, icon: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {iconOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div className="flex items-center gap-2">
                          <opt.icon className="w-4 h-4" />
                          {opt.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
                <Label>Active</Label>
              </div>
              <Button onClick={handleCreateCollection} className="w-full">
                Create Collection
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Collections List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Collections</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {collections.map((collection) => {
              const Icon = getIconComponent(collection.icon);
              return (
                <div
                  key={collection.id}
                  onClick={() => handleSelectCollection(collection)}
                  className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedCollection?.id === collection.id
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-secondary/50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-5 h-5 text-primary" />
                    <div>
                      <p className="font-medium">{collection.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {collection.is_active ? "Active" : "Inactive"}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteCollection(collection.id);
                    }}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              );
            })}
            {collections.length === 0 && (
              <p className="text-muted-foreground text-center py-4">No collections yet</p>
            )}
          </CardContent>
        </Card>

        {/* Collection Details */}
        {selectedCollection && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">
                  {editMode ? "Edit Collection" : selectedCollection.name}
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditMode(!editMode)}
                >
                  {editMode ? <X className="w-4 h-4" /> : <Edit className="w-4 h-4" />}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {editMode ? (
                <>
                  <div>
                    <Label>Name</Label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Icon</Label>
                    <Select
                      value={formData.icon}
                      onValueChange={(value) => setFormData({ ...formData, icon: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {iconOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            <div className="flex items-center gap-2">
                              <opt.icon className="w-4 h-4" />
                              {opt.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={formData.is_active}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                    />
                    <Label>Active</Label>
                  </div>
                  <Button onClick={handleUpdateCollection} className="w-full">
                    <Save className="w-4 h-4 mr-2" />
                    Save Changes
                  </Button>
                </>
              ) : (
                <>
                  <div>
                    <Label>Playlists in Collection</Label>
                    <div className="space-y-2 mt-2">
                      {collectionPlaylists.map((cp) => (
                        <div
                          key={cp.id}
                          className="flex items-center justify-between p-2 rounded bg-secondary/50"
                        >
                          <div className="flex items-center gap-2">
                            <img
                              src={cp.playlist.cover_url || "/placeholder.svg"}
                              alt={cp.playlist.name}
                              className="w-8 h-8 rounded object-cover"
                            />
                            <span className="text-sm">{cp.playlist.name}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemovePlaylist(cp.id)}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      ))}
                      {collectionPlaylists.length === 0 && (
                        <p className="text-sm text-muted-foreground py-2">No playlists added</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <Label>Add Playlist</Label>
                    <Select onValueChange={handleAddPlaylist}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a playlist..." />
                      </SelectTrigger>
                      <SelectContent>
                        {getAvailablePlaylists().map((playlist) => (
                          <SelectItem key={playlist.id} value={playlist.id}>
                            <div className="flex items-center gap-2">
                              <img
                                src={playlist.cover_url || "/placeholder.svg"}
                                alt={playlist.name}
                                className="w-6 h-6 rounded object-cover"
                              />
                              {playlist.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default IndustryCollectionManager;
