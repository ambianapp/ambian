import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, ListMusic, Users, Settings, BarChart3, Building2 } from "lucide-react";
import AdminPlaylistManager from "@/components/admin/AdminPlaylistManager";
import IndustryCollectionManager from "@/components/admin/IndustryCollectionManager";
import { UserManager } from "@/components/admin/UserManager";
import { PriceMigration } from "@/components/admin/PriceMigration";
import { Analytics } from "@/components/admin/Analytics";

const Admin = () => {
  const { isAdmin } = useAuth();
  const { t } = useLanguage();
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
            <h1 className="text-2xl font-bold text-foreground">{t("admin.title")}</h1>
            <p className="text-muted-foreground">{t("admin.subtitle")}</p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="analytics" className="w-full">
          <TabsList className="grid w-full max-w-3xl grid-cols-5">
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="playlists" className="flex items-center gap-2">
              <ListMusic className="w-4 h-4" />
              {t("admin.playlists")}
            </TabsTrigger>
            <TabsTrigger value="industries" className="flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Industries
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              {t("admin.users")}
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Settings
            </TabsTrigger>
          </TabsList>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="mt-6">
            <Analytics />
          </TabsContent>

          {/* Playlists Tab */}
          <TabsContent value="playlists" className="mt-6">
            <AdminPlaylistManager />
          </TabsContent>

          {/* Industries Tab */}
          <TabsContent value="industries" className="mt-6">
            <IndustryCollectionManager />
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users" className="mt-6">
            <UserManager />
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="mt-6">
            <PriceMigration />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Admin;
