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
import { ArrowLeft, User, Mail, CreditCard, Calendar, Loader2, ExternalLink, FileText, Download, Monitor, Plus, Globe, Smartphone, Eye, RefreshCw, Scale, Clock } from "lucide-react";
import { usePWAInstall } from "@/hooks/usePWAInstall";

interface Invoice {
  id: string;
  number: string;
  amount: number;
  currency: string;
  date: number;
  status: string;
  dueDate: number | null;
  pdfUrl: string | null;
  hostedUrl: string | null;
}

const Profile = () => {
  const { user, subscription, checkSubscription, signOut } = useAuth();
  const { language, setLanguage, t, languageNames, availableLanguages } = useLanguage();
  const [fullName, setFullName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingPortal, setIsLoadingPortal] = useState(false);
  const [isLoadingDevice, setIsLoadingDevice] = useState(false);
  const [isChangingPlan, setIsChangingPlan] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const { canInstall, isInstalled, isIOS, isMacOS, promptInstall } = usePWAInstall();

  useEffect(() => {
    // Check if returning from plan change
    if (searchParams.get("plan_changed") === "true") {
      checkSubscription();
      toast({ title: t("subscription.planChanged"), description: t("subscription.planChangedDesc") });
      navigate("/profile", { replace: true });
    }
  }, [searchParams, checkSubscription, toast, navigate, t]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]); // Only reload when user ID changes

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]); // Only reload when user ID changes

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

  const handleChangePlan = async (newPlan: "monthly" | "yearly") => {
    setIsChangingPlan(true);
    try {
      const { data, error } = await supabase.functions.invoke("change-subscription-plan", {
        body: { newPlan },
      });
      if (error) throw error;

      if (data?.fallback) {
        toast({
          title: t("subscription.manageBtn"),
          description: t("subscription.changePlan") + ".",
        });
      }

      // Open Stripe portal (either confirm flow or standard portal fallback)
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
      setIsChangingPlan(false);
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
            {/* Open Invoice Alert - show if there's an unpaid invoice */}
            {invoices.some(inv => inv.status === "open") && (
              <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-yellow-500 mb-1">
                      <FileText className="w-5 h-5" />
                      <span className="font-semibold">{t("subscription.paymentDue") || "Payment Due"}</span>
                    </div>
                    {(() => {
                      const openInvoice = invoices.find(inv => inv.status === "open");
                      if (!openInvoice) return null;
                      const dueDate = openInvoice.dueDate ? new Date(openInvoice.dueDate * 1000) : null;
                      return (
                        <p className="text-sm text-muted-foreground">
                          {formatCurrency(openInvoice.amount, openInvoice.currency)}
                          {dueDate && ` • ${t("invoices.dueBy")}: ${dueDate.toLocaleDateString()}`}
                        </p>
                      );
                    })()}
                  </div>
                  {(() => {
                    const openInvoice = invoices.find(inv => inv.status === "open");
                    if (!openInvoice?.hostedUrl) return null;
                    return (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => window.open(openInvoice.hostedUrl!, "_blank")}
                        className="bg-yellow-500 hover:bg-yellow-600 text-black"
                      >
                        {t("invoices.payNow")}
                      </Button>
                    );
                  })()}
                </div>
                <p className="text-xs text-yellow-600 mt-3 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {t("subscription.ibanNote")}
                </p>
              </div>
            )}

            {/* Pending Payment Alert - fallback for when invoice data isn't loaded yet */}
            {subscription.isPendingPayment && !invoices.some(inv => inv.status === "open") && (
              <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                <div className="flex items-center gap-2 text-yellow-500 mb-2">
                  <Mail className="w-5 h-5" />
                  <span className="font-semibold">{t("subscription.pendingPayment") || "Invoice Sent"}</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t("subscription.pendingPaymentDesc") || "Check your email for the invoice. You have access until the payment deadline."}
                </p>
                {subscription.subscriptionEnd && (
                  <p className="text-sm text-yellow-500/80 mt-2">
                    {t("subscription.paymentDeadline") || "Payment deadline"}: {new Date(subscription.subscriptionEnd).toLocaleDateString()}
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center justify-between p-4 rounded-lg bg-secondary">
              <div>
                <p className="font-medium text-foreground">
                  {subscription.isPendingPayment
                    ? t("subscription.awaitingPayment") || "Awaiting Payment"
                    : subscription.isTrial 
                      ? t("subscription.trial") 
                      : subscription.subscribed 
                        ? t("subscription.active") 
                        : t("subscription.inactive")}
                </p>
                {subscription.isTrial && (
                  <p className="text-sm text-muted-foreground">
                    {t("subscription.trialDaysRemaining", { days: subscription.trialDaysRemaining })}
                  </p>
                )}
                {subscription.subscribed && !subscription.isTrial && !subscription.isPendingPayment && subscription.planType && (
                  <p className="text-sm text-muted-foreground">
                    {subscription.planType === "yearly" ? t("subscription.yearly") : t("subscription.monthly")}
                    {subscription.collectionMethod && (
                      <span className="ml-2">
                        • {subscription.collectionMethod === "send_invoice" 
                          ? t("subscription.payByInvoice") 
                          : t("subscription.payByCard")}
                      </span>
                    )}
                  </p>
                )}
              </div>
              <div
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  subscription.isPendingPayment
                    ? "bg-yellow-500/20 text-yellow-500"
                    : subscription.subscribed
                      ? subscription.isTrial 
                        ? "bg-yellow-500/20 text-yellow-500"
                        : "bg-primary/20 text-primary"
                      : "bg-destructive/20 text-destructive"
                }`}
              >
                {subscription.isPendingPayment 
                  ? t("subscription.pending") || "Pending" 
                  : subscription.isTrial 
                    ? t("subscription.trial") 
                    : subscription.subscribed 
                      ? "Active" 
                      : "Inactive"}
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

            {/* Plan Change Options */}
            {subscription.subscribed && !subscription.isTrial && (
              <div className="p-4 rounded-lg border border-border">
                <p className="font-medium text-foreground mb-3">{t("subscription.changePlan")}</p>
                <div className="flex flex-col sm:flex-row gap-3">
                  {subscription.planType === "monthly" ? (
                    <Button
                      variant="default"
                      onClick={() => handleChangePlan("yearly")}
                      disabled={isChangingPlan}
                      className="w-full sm:w-auto flex-wrap h-auto py-2"
                    >
                      <span className="flex items-center">
                        {isChangingPlan ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : (
                          <RefreshCw className="w-4 h-4 mr-2" />
                        )}
                        {t("subscription.switchToYearly")}
                      </span>
                      <span className="text-xs bg-primary-foreground/20 px-2 py-0.5 rounded ml-2">
                        {t("subscription.yearlySave")}
                      </span>
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => handleChangePlan("monthly")}
                      disabled={isChangingPlan}
                      className="w-full sm:w-auto"
                    >
                      {isChangingPlan ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <RefreshCw className="w-4 h-4 mr-2" />
                      )}
                      {t("subscription.switchToMonthly")}
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Subscribe Now for Trial Users */}
            {subscription.isTrial && (
              <div className="p-4 rounded-lg border border-primary/30 bg-primary/5">
                <p className="font-medium text-foreground mb-3">{t("subscription.subscribeNow")}</p>
                <Button
                  variant="default"
                  onClick={() => navigate("/pricing")}
                  className="w-full sm:w-auto"
                >
                  {t("subscription.subscribeNow")}
                </Button>
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
              <Button 
                variant="ghost" 
                onClick={async () => {
                  setIsRefreshing(true);
                  await checkSubscription();
                  setIsRefreshing(false);
                }} 
                disabled={isRefreshing}
                className="w-full sm:w-auto"
              >
                {isRefreshing ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                {t("subscription.refreshStatus")}
              </Button>
            </div>
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
            ) : invoices.filter(inv => inv.status === "paid").length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">{t("invoices.none")}</p>
            ) : (
              <div className="space-y-3">
                {invoices.filter(inv => inv.status === "paid").map((invoice) => {
                  const invoiceDate = new Date(invoice.date * 1000);
                  const monthYear = invoiceDate.toLocaleDateString(language === 'fi' ? 'fi-FI' : language === 'sv' ? 'sv-SE' : language === 'de' ? 'de-DE' : language === 'fr' ? 'fr-FR' : 'en-US', { 
                    month: 'long', 
                    year: 'numeric' 
                  });
                  
                  return (
                    <div
                      key={invoice.id}
                      className="flex items-center justify-between p-4 rounded-lg bg-secondary"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-foreground">
                          {monthYear}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {invoiceDate.toLocaleDateString()} • {formatCurrency(invoice.amount, invoice.currency)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-1 rounded text-xs font-medium bg-primary/20 text-primary">
                          {t("invoices.paid")}
                        </span>
                        {invoice.hostedUrl && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => window.open(invoice.hostedUrl!, "_blank")}
                            title={t("invoices.preview") || "Preview"}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        )}
                        {invoice.pdfUrl && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => window.open(invoice.pdfUrl!, "_blank")}
                            title={t("invoices.download") || "Download"}
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

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

        {/* Install App Card */}
        {!isInstalled && (
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="w-5 h-5" />
                Install App
              </CardTitle>
              <CardDescription>Install Ambian as an app for quick access</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {canInstall ? (
                <Button onClick={promptInstall} className="w-full sm:w-auto">
                  <Download className="w-4 h-4 mr-2" />
                  Install Ambian
                </Button>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    {isIOS
                      ? "Tap Share → 'Add to Home Screen' in Safari."
                      : isMacOS
                      ? "In Chrome/Edge: click the install icon in the address bar, or Menu → 'Install Ambian'. This only works on the published site, not in preview."
                      : "Use your browser's menu to install this app."}
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => navigate("/install")}
                    className="w-full sm:w-auto"
                  >
                    View Install Instructions
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Terms & Conditions */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scale className="w-5 h-5" />
              {t("terms.title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => navigate("/terms")}>
              {t("profile.viewTerms")}
            </Button>
          </CardContent>
        </Card>

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
