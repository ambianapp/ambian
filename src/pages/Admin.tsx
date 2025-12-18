import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, ListMusic, Users } from "lucide-react";
import AdminPlaylistManager from "@/components/admin/AdminPlaylistManager";
import { UserManager } from "@/components/admin/UserManager";

const Admin = () => {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAdmin) {
      navigate("/");
    }
  }, [isAdmin, navigate]);

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background p-4 pb-36 md:p-8 md:pb-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Admin Panel</h1>
            <p className="text-muted-foreground">Manage playlists and users</p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="playlists" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="playlists" className="flex items-center gap-2">
              <ListMusic className="w-4 h-4" />
              Playlists
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Users
            </TabsTrigger>
          </TabsList>

          {/* Playlists Tab */}
          <TabsContent value="playlists" className="mt-6">
            <AdminPlaylistManager />
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users" className="mt-6">
            <UserManager />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Admin;
