import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, User, Mail, CreditCard, Calendar, Loader2, ExternalLink, FileText, Download, Monitor, Plus, Globe, Smartphone } from "lucide-react";
import { usePWAInstall } from "@/hooks/usePWAInstall";

interface Invoice {
  id: string;
  number: string;
  amount: number;
  currency: string;
  date: number;
  status: string;
  pdfUrl: string | null;
  hostedUrl: string | null;
}

const Profile = () => {
  const { user, subscription, checkSubscription, signOut, syncDeviceSlots } = useAuth();
  const { language, setLanguage, t, languageNames, availableLanguages } = useLanguage();
  const [fullName, setFullName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingPortal, setIsLoadingPortal] = useState(false);
  const [isLoadingDevice, setIsLoadingDevice] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const { canInstall, isInstalled, promptInstall } = usePWAInstall();

  useEffect(() => {
    // Check if returning from device slot purchase
    if (searchParams.get("device_added") === "true") {
      syncDeviceSlots();
      toast({ title: "Device slot added!", description: "You can now use your account on an additional device." });
      navigate("/profile", { replace: true });
    }
  }, [searchParams, syncDeviceSlots, toast, navigate]);

  useEffect(() => {
    const loadProfile = async () => {
      if (!user) return;
      
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data?.full_name) {
        setFullName(data.full_name);
      }
    };

    loadProfile();
  }, [user]);

  useEffect(() => {
    const loadInvoices = async () => {
      if (!user) return;
      setIsLoadingInvoices(true);

      try {
        const { data, error } = await supabase.functions.invoke("get-invoices");
        if (error) throw error;
        setInvoices(data?.invoices || []);
      } catch (error: any) {
        console.error("Failed to load invoices:", error);
      } finally {
        setIsLoadingInvoices(false);
      }
    };

    loadInvoices();
  }, [user]);

  const handleUpdateProfile = async () => {
    if (!user) return;
    setIsLoading(true);

    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName })
        .eq("user_id", user.id);

      if (error) throw error;

      toast({ title: "Profile updated", description: "Your changes have been saved." });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    setIsLoadingPortal(true);
    try {
      const { data, error } = await supabase.functions.invoke("customer-portal");
      if (error) throw error;
      
      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoadingPortal(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const handleAddDeviceSlot = async () => {
    setIsLoadingDevice(true);
    try {
      const { data, error } = await supabase.functions.invoke("add-device-slot");
      if (error) throw error;
      
      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoadingDevice(false);
    }
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  };

  if (!user) {
    navigate("/auth");
    return null;
  }

  return (
    <div className="min-h-screen bg-background p-4 pb-32 md:p-8 md:pb-48">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t("profile.title")}</h1>
            <p className="text-muted-foreground">{t("profile.subtitle")}</p>
          </div>
        </div>

        {/* Profile Card */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              {t("profile.personalInfo")}
            </CardTitle>
            <CardDescription>{t("profile.updateDetails")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={user.email || ""}
                  disabled
                  className="pl-10 bg-secondary"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fullName">{t("profile.fullName")}</Label>
              <Input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your name"
                className="bg-card"
              />
            </div>

            <Button onClick={handleUpdateProfile} disabled={isLoading}>
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {t("common.save")}
            </Button>
          </CardContent>
        </Card>

        {/* Language Card */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5" />
              {t("profile.language")}
            </CardTitle>
            <CardDescription>{t("profile.selectLanguage")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={language} onValueChange={(value) => setLanguage(value as any)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableLanguages.map((lang) => (
                  <SelectItem key={lang} value={lang}>
                    {languageNames[lang]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Subscription Card */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              {t("subscription.title")}
            </CardTitle>
            <CardDescription>{t("subscription.manage")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-secondary">
              <div>
                <p className="font-medium text-foreground">
                  {subscription.subscribed ? t("subscription.active") : t("subscription.inactive")}
                </p>
                {subscription.subscribed && (
                  <p className="text-sm text-muted-foreground">
                    {subscription.planType === "yearly" ? t("subscription.yearly") : t("subscription.monthly")}
                  </p>
                )}
              </div>
              <div
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  subscription.subscribed
                    ? "bg-primary/20 text-primary"
                    : "bg-destructive/20 text-destructive"
                }`}
              >
                {subscription.subscribed ? "Active" : "Inactive"}
              </div>
            </div>

            {subscription.subscriptionEnd && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="w-4 h-4" />
                <span>
                  {t("subscription.renewsOn")} {new Date(subscription.subscriptionEnd).toLocaleDateString()}
                </span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              {subscription.subscribed ? (
                <Button
                  variant="outline"
                  onClick={handleManageSubscription}
                  disabled={isLoadingPortal}
                  className="w-full sm:w-auto"
                >
                  {isLoadingPortal ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <ExternalLink className="w-4 h-4 mr-2" />
                  )}
                  {t("subscription.manageBtn")}
                </Button>
              ) : (
                <Button onClick={() => navigate("/pricing")} className="w-full sm:w-auto">
                  {t("subscription.subscribeNow")}
                </Button>
              )}
              <Button variant="ghost" onClick={() => checkSubscription()} className="w-full sm:w-auto">
                {t("subscription.refreshStatus")}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Device Slots Card */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="w-5 h-5" />
              {t("devices.title")}
            </CardTitle>
            <CardDescription>{t("devices.subtitle")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-secondary">
              <div>
                <p className="font-medium text-foreground">{t("devices.active")}</p>
                <p className="text-sm text-muted-foreground">
                  {t("devices.canPlay", { count: subscription.deviceSlots })}
                </p>
              </div>
              <div className="px-4 py-2 rounded-full bg-primary/20 text-primary font-bold text-xl">
                {subscription.deviceSlots}
              </div>
            </div>

            <div className="p-4 rounded-lg border border-border">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p className="font-medium text-foreground">{t("devices.needMore")}</p>
                  <p className="text-sm text-muted-foreground">{t("devices.addFor")}</p>
                </div>
                <Button
                  onClick={handleAddDeviceSlot}
                  disabled={isLoadingDevice || !subscription.subscribed}
                  size="sm"
                  className="w-full sm:w-auto"
                >
                  {isLoadingDevice ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Plus className="w-4 h-4 mr-2" />
                  )}
                  {t("devices.addBtn")}
                </Button>
              </div>
            </div>

            {!subscription.subscribed && (
              <p className="text-sm text-muted-foreground">
                {t("devices.subscribeFirst")}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Invoices Card */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              {t("invoices.title")}
            </CardTitle>
            <CardDescription>{t("invoices.subtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingInvoices ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : invoices.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">{t("invoices.none")}</p>
            ) : (
              <div className="space-y-3">
                {invoices.map((invoice) => (
                  <div
                    key={invoice.id}
                    className="flex items-center justify-between p-4 rounded-lg bg-secondary"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-foreground">
                        {invoice.number || "Invoice"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(invoice.date * 1000).toLocaleDateString()} • {formatCurrency(invoice.amount, invoice.currency)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 rounded text-xs font-medium bg-primary/20 text-primary">
                        {t("invoices.paid")}
                      </span>
                      {invoice.pdfUrl && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => window.open(invoice.pdfUrl!, "_blank")}
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Install App Card */}
        {!isInstalled && (
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="w-5 h-5" />
                Install App
              </CardTitle>
              <CardDescription>Install Ambian as a desktop app for quick access</CardDescription>
            </CardHeader>
            <CardContent>
              {canInstall ? (
                <Button onClick={promptInstall} className="w-full sm:w-auto">
                  <Download className="w-4 h-4 mr-2" />
                  Install Ambian
                </Button>
              ) : (
                <Button variant="outline" onClick={() => navigate("/install")} className="w-full sm:w-auto">
                  <Smartphone className="w-4 h-4 mr-2" />
                  View Install Instructions
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Sign Out */}
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <Button variant="destructive" onClick={handleSignOut}>
              {t("common.signOut")}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Profile;
