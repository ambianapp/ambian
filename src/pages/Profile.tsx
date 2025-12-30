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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, User, Mail, CreditCard, Calendar, Loader2, ExternalLink, FileText, Download, Monitor, Plus, Globe, Smartphone, Eye, RefreshCw, Clock, Trash2, X, Lock } from "lucide-react";


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

interface DeviceSlotSubscription {
  id: string;
  quantity: number;
  period: "monthly" | "yearly";
  amount: number;
  currency: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
}

interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

const Profile = () => {
  const { user, subscription, checkSubscription, signOut } = useAuth();
  const { language, setLanguage, t, languageNames, availableLanguages } = useLanguage();
  const [fullName, setFullName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingPortal, setIsLoadingPortal] = useState(false);
  const [isLoadingDevice, setIsLoadingDevice] = useState(false);
  const [deviceSlotPeriod, setDeviceSlotPeriod] = useState<"monthly" | "yearly">("yearly");
  const [deviceSlotQuantity, setDeviceSlotQuantity] = useState(1);
  const [deviceSlotPayByInvoice, setDeviceSlotPayByInvoice] = useState(false);
  const [isChangingPlan, setIsChangingPlan] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(false);
  const [deviceSlotSubs, setDeviceSlotSubs] = useState<DeviceSlotSubscription[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [cancellingSlotId, setCancellingSlotId] = useState<string | null>(null);
  const [showInvoiceConfirm, setShowInvoiceConfirm] = useState(false);
  const [slotToCancel, setSlotToCancel] = useState<DeviceSlotSubscription | null>(null);
  // Billing info for device slot invoice
  const [deviceCompanyName, setDeviceCompanyName] = useState("");
  const [deviceAddressLine, setDeviceAddressLine] = useState("");
  const [deviceCity, setDeviceCity] = useState("");
  const [devicePostalCode, setDevicePostalCode] = useState("");
  const [deviceCountry, setDeviceCountry] = useState("FI");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [trialTimeRemaining, setTrialTimeRemaining] = useState<TimeRemaining | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  

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

  useEffect(() => {
    loadInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]); // Only reload when user ID changes

  const loadDeviceSlots = async () => {
    if (!user) return;
    setIsLoadingSlots(true);

    try {
      const { data, error } = await supabase.functions.invoke("get-device-slots");
      if (error) throw error;
      setDeviceSlotSubs(data?.deviceSlots || []);
    } catch (error: any) {
      console.error("Failed to load device slots:", error);
    } finally {
      setIsLoadingSlots(false);
    }
  };

  useEffect(() => {
    loadDeviceSlots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Determine if user has a password set (for OAuth users who may have added one)
  useEffect(() => {
    const checkHasPassword = async () => {
      if (!user) return;
      
      // For email provider users, they always have a password
      if (user.app_metadata?.provider === 'email') {
        setHasPassword(true);
        return;
      }
      
      // For OAuth users, check identities - if there's an email identity, they have a password
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (currentUser?.identities) {
        const hasEmailIdentity = currentUser.identities.some(
          (identity) => identity.provider === 'email'
        );
        setHasPassword(hasEmailIdentity);
      } else {
        setHasPassword(false);
      }
    };
    
    checkHasPassword();
  }, [user?.id]);

  // Trial countdown timer
  useEffect(() => {
    if (!subscription.isTrial || !subscription.trialEnd) {
      setTrialTimeRemaining(null);
      return;
    }

    const calculateTimeRemaining = () => {
      const now = new Date().getTime();
      const end = new Date(subscription.trialEnd!).getTime();
      const diff = end - now;

      if (diff <= 0) {
        setTrialTimeRemaining(null);
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTrialTimeRemaining({ days, hours, minutes, seconds });
    };

    calculateTimeRemaining();
    const interval = setInterval(calculateTimeRemaining, 1000);

    return () => clearInterval(interval);
  }, [subscription.isTrial, subscription.trialEnd]);

  const formatNumber = (n: number) => n.toString().padStart(2, '0');

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

  const handleChangePassword = async () => {
    if (!currentPassword) {
      toast({
        title: t("common.error"),
        description: t("auth.currentPasswordRequired"),
        variant: "destructive",
      });
      return;
    }
    
    if (newPassword.length < 6) {
      toast({
        title: t("common.error"),
        description: t("auth.passwordMin"),
        variant: "destructive",
      });
      return;
    }
    
    if (newPassword !== confirmPassword) {
      toast({
        title: t("common.error"),
        description: t("auth.passwordsNoMatch"),
        variant: "destructive",
      });
      return;
    }

    setIsChangingPassword(true);
    try {
      // First verify current password by re-authenticating
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email || "",
        password: currentPassword,
      });
      
      if (signInError) {
        toast({
          title: t("common.error"),
          description: t("auth.currentPasswordIncorrect"),
          variant: "destructive",
        });
        return;
      }
      
      // Now update to new password
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      
      if (error) throw error;
      
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({
        title: t("auth.passwordUpdated"),
        description: t("auth.passwordUpdatedDesc"),
      });
    } catch (error: any) {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleSetPassword = async () => {
    if (newPassword.length < 6) {
      toast({
        title: t("common.error"),
        description: t("auth.passwordMin"),
        variant: "destructive",
      });
      return;
    }
    
    if (newPassword !== confirmPassword) {
      toast({
        title: t("common.error"),
        description: t("auth.passwordsNoMatch"),
        variant: "destructive",
      });
      return;
    }

    setIsChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      
      if (error) throw error;
      
      // Mark that user now has a password
      setHasPassword(true);
      
      setNewPassword("");
      setConfirmPassword("");
      toast({
        title: t("auth.passwordSet"),
        description: t("auth.passwordSetDesc"),
      });
    } catch (error: any) {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsChangingPassword(false);
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

  const handleAddDeviceSlotClick = () => {
    // Block location purchases if subscription isn't active or is set to cancel
    if (!subscription.subscribed || subscription.isTrial || subscription.cancelAtPeriodEnd) {
      toast({
        title: t("common.error"),
        description:
          t("devices.subscriptionRequired") ||
          "An active subscription is required before you can add additional locations.",
        variant: "destructive",
      });
      return;
    }

    // Show confirmation dialog for invoice payments
    if (deviceSlotPayByInvoice && deviceSlotPeriod === "yearly") {
      setShowInvoiceConfirm(true);
    } else {
      handleAddDeviceSlot();
    }
  };

  const handleAddDeviceSlot = async () => {
    // Safety guard: don't allow purchases if subscription isn't active or is set to cancel
    if (!subscription.subscribed || subscription.isTrial || subscription.cancelAtPeriodEnd) {
      return;
    }

    const isInvoice = deviceSlotPayByInvoice && deviceSlotPeriod === "yearly";
    
    // Validate billing info for invoice payments
    if (isInvoice) {
      if (!deviceCompanyName.trim() || !deviceAddressLine.trim() || !deviceCity.trim() || !devicePostalCode.trim()) {
        toast({
          title: t("common.error"),
          description: t("devices.fillBillingInfo") || "Please fill in all company and address fields for the invoice.",
          variant: "destructive",
        });
        return;
      }
    }
    
    setShowInvoiceConfirm(false);
    setIsLoadingDevice(true);
    try {
      const body: any = { 
        period: deviceSlotPeriod, 
        quantity: deviceSlotQuantity,
        payByInvoice: isInvoice,
      };
      
      // Add billing info for invoice payments
      if (isInvoice) {
        body.billingInfo = {
          companyName: deviceCompanyName.trim(),
          address: {
            line1: deviceAddressLine.trim(),
            city: deviceCity.trim(),
            postal_code: devicePostalCode.trim(),
            country: deviceCountry,
          },
        };
      }
      
      const { data, error } = await supabase.functions.invoke("add-device-slot", { body });
      if (error) throw error;
      
      // Handle checkout vs invoice responses
      if (data?.type === "checkout" && data?.url) {
        // Card payment - open Stripe Checkout
        window.open(data.url, "_blank");
      } else if (data?.type === "invoice") {
        // Invoice payment - show success and refresh
        toast({
          title: t("devices.invoiceSent") || "Invoice sent",
          description: t("devices.invoiceSentDesc") || "Invoice has been sent to your email. Your new location is now active.",
        });
        
        // Clear billing info after successful invoice request
        setDeviceCompanyName("");
        setDeviceAddressLine("");
        setDeviceCity("");
        setDevicePostalCode("");
        setDeviceCountry("FI");
        
        // Sync device slots from Stripe and refresh the UI
        try {
          await supabase.functions.invoke("sync-device-slots");
          await Promise.all([
            loadDeviceSlots(),
            loadInvoices(),
            checkSubscription(),
          ]);
        } catch (syncError) {
          console.error("Failed to sync device slots:", syncError);
        }
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

  const handleCancelDeviceSlotConfirm = (slot: DeviceSlotSubscription) => {
    setSlotToCancel(slot);
  };

  const handleCancelDeviceSlot = async () => {
    if (!slotToCancel) return;
    
    const subscriptionId = slotToCancel.id;
    setSlotToCancel(null);
    setCancellingSlotId(subscriptionId);
    try {
      const { error } = await supabase.functions.invoke("cancel-device-slot", {
        body: { subscriptionId, cancelImmediately: false },
      });
      if (error) throw error;
      
      toast({
        title: t("devices.cancelSuccess") || "Location removed",
        description: t("devices.cancelSuccessDesc") || "The location will be removed at the end of the billing period.",
      });
      
      // Reload device slots
      await loadDeviceSlots();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setCancellingSlotId(null);
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
    <div className="min-h-screen bg-background p-4 pb-32 md:p-8 md:pb-48 pt-4 md:pt-8 overflow-y-auto">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4 pr-14 md:pr-0">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t("profile.title")}</h1>
            <p className="text-muted-foreground text-sm sm:text-base">{t("profile.subtitle")}</p>
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
            {/* Open Invoice Alert - show if there are unpaid invoices */}
            {invoices.some(inv => inv.status === "open") && (
              <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-yellow-500 mb-1">
                      <FileText className="w-5 h-5" />
                      <span className="font-semibold">{t("subscription.paymentDue") || "Payment Due"}</span>
                    </div>
                    {(() => {
                      const openInvoices = invoices.filter(inv => inv.status === "open");
                      if (openInvoices.length === 0) return null;
                      
                      // Calculate total amount across all open invoices
                      const totalAmount = openInvoices.reduce((sum, inv) => sum + inv.amount, 0);
                      const currency = openInvoices[0].currency;
                      
                      // Get earliest due date
                      const dueDates = openInvoices
                        .filter(inv => inv.dueDate)
                        .map(inv => inv.dueDate!);
                      const earliestDueDate = dueDates.length > 0 
                        ? new Date(Math.min(...dueDates) * 1000) 
                        : null;
                      
                      return (
                        <p className="text-sm text-muted-foreground">
                          {openInvoices.length > 1 
                            ? `${openInvoices.length} ${t("invoices.openInvoices") || "open invoices"}: `
                            : ""}
                          {formatCurrency(totalAmount, currency)}
                          {earliestDueDate && ` • ${t("invoices.dueBy")}: ${earliestDueDate.toLocaleDateString()}`}
                        </p>
                      );
                    })()}
                  </div>
                  <div className="flex gap-2">
                    {invoices.filter(inv => inv.status === "open").map((openInvoice, idx) => (
                      openInvoice.hostedUrl && (
                        <Button
                          key={openInvoice.id}
                          variant="default"
                          size="sm"
                          onClick={() => window.open(openInvoice.hostedUrl!, "_blank")}
                          className="bg-yellow-500 hover:bg-yellow-600 text-black"
                        >
                          {invoices.filter(inv => inv.status === "open").length > 1 
                            ? `${t("invoices.payNow")} #${idx + 1}`
                            : t("invoices.payNow")}
                        </Button>
                      )
                    ))}
                  </div>
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
                  {subscription.cancelAtPeriodEnd
                    ? t("subscription.cancelled")
                    : subscription.isPendingPayment
                      ? t("subscription.awaitingPayment") || "Awaiting Payment"
                      : subscription.isTrial 
                        ? t("subscription.trial") 
                        : subscription.subscribed 
                          ? t("subscription.active") 
                          : t("subscription.inactive")}
                </p>
                {subscription.cancelAtPeriodEnd && subscription.subscriptionEnd && (
                  <p className="text-sm text-muted-foreground">
                    {t("subscription.validUntil")}: {new Date(subscription.subscriptionEnd).toLocaleDateString()}
                  </p>
                )}
                {subscription.isTrial && trialTimeRemaining && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>
                      {t("subscription.timeRemaining") || "Time remaining"}:{" "}
                      <span className="font-mono">
                        {trialTimeRemaining.days > 0 && `${trialTimeRemaining.days}d `}
                        {formatNumber(trialTimeRemaining.hours)}:{formatNumber(trialTimeRemaining.minutes)}:{formatNumber(trialTimeRemaining.seconds)}
                      </span>
                    </span>
                  </p>
                )}
                {subscription.isTrial && !trialTimeRemaining && (
                  <p className="text-sm text-muted-foreground">
                    {t("subscription.trialDaysRemaining", { days: subscription.trialDaysRemaining })}
                  </p>
                )}
                {subscription.subscribed && !subscription.isTrial && !subscription.isPendingPayment && !subscription.cancelAtPeriodEnd && subscription.planType && (
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
                  subscription.cancelAtPeriodEnd
                    ? "bg-orange-500/20 text-orange-500"
                    : subscription.isPendingPayment
                      ? "bg-yellow-500/20 text-yellow-500"
                      : subscription.subscribed
                        ? subscription.isTrial 
                          ? "bg-yellow-500/20 text-yellow-500"
                          : "bg-green-500/20 text-green-500"
                        : "bg-destructive/20 text-destructive"
                }`}
              >
                {subscription.cancelAtPeriodEnd
                  ? t("subscription.cancelled")
                  : subscription.isPendingPayment 
                    ? t("subscription.pending") || "Pending" 
                    : subscription.isTrial 
                      ? t("subscription.trial") 
                      : subscription.subscribed 
                        ? "Active" 
                        : "Inactive"}
              </div>
            </div>

            {subscription.subscriptionEnd && !subscription.cancelAtPeriodEnd && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="w-4 h-4" />
                <span>
                  {t("subscription.renewsOn")} {new Date(subscription.subscriptionEnd).toLocaleDateString()}
                </span>
              </div>
            )}

            {/* Plan Change Options - hide if cancelled */}
            {subscription.subscribed && !subscription.isTrial && !subscription.cancelAtPeriodEnd && (
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
            {(() => {
              const computedSlots = 1 + deviceSlotSubs.reduce((sum, slot) => sum + slot.quantity, 0);
              const activeSlots = Math.max(subscription.deviceSlots || 1, computedSlots);

              return (
                <div className="flex items-center justify-between p-4 rounded-lg bg-secondary">
                  <div>
                    <p className="font-medium text-foreground">{t("devices.active")}</p>
                    <p className="text-sm text-muted-foreground">
                      {t("devices.canPlay", { count: activeSlots })}
                    </p>
                  </div>
                  <div className="px-4 py-2 rounded-full bg-primary/20 text-primary font-bold text-xl">
                    {activeSlots}
                  </div>
                </div>
              );
            })()}

            {/* Show disabled state with message if no active subscription or cancelled */}
            {(!subscription.subscribed || subscription.isTrial || subscription.cancelAtPeriodEnd) ? (
              <div className="p-4 rounded-lg border border-border bg-muted/30 space-y-3">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Monitor className="w-5 h-5" />
                  <p className="font-medium">{t("devices.needMore")}</p>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t("devices.subscriptionRequired") || "An active subscription is required before you can add additional locations."}
                </p>
                <Button
                  onClick={() => navigate("/pricing")}
                  variant="outline"
                  className="w-full"
                >
                  <CreditCard className="w-4 h-4 mr-2" />
                  {t("subscription.subscribeNow")}
                </Button>
              </div>
            ) : (
              <div className="p-4 rounded-lg border border-border space-y-4">
                <div>
                  <p className="font-medium text-foreground">{t("devices.needMore")}</p>
                  <p className="text-sm text-muted-foreground">{t("devices.addFor")}</p>
                </div>
                
                {/* Quantity selection */}
                <div>
                  <Label className="text-sm font-medium text-foreground mb-2 block">
                    {t("devices.quantity") || "Number of device slots"}
                  </Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setDeviceSlotQuantity(Math.max(1, deviceSlotQuantity - 1))}
                      disabled={deviceSlotQuantity <= 1}
                    >
                      -
                    </Button>
                    <div className="w-16 text-center font-bold text-lg">{deviceSlotQuantity}</div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setDeviceSlotQuantity(Math.min(10, deviceSlotQuantity + 1))}
                      disabled={deviceSlotQuantity >= 10}
                    >
                      +
                    </Button>
                  </div>
                  {(() => {
                    const currentTotal = 1 + deviceSlotSubs.reduce((sum, slot) => sum + slot.quantity, 0);
                    return (
                      <p className="text-sm text-primary mt-2 font-medium">
                        {t("devices.totalAfterOrder")}: {currentTotal + deviceSlotQuantity} {t("devices.locations")}
                      </p>
                    );
                  })()}
                </div>

                {/* Period selection */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDeviceSlotPeriod("monthly")}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      deviceSlotPeriod === "monthly"
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className="font-medium text-foreground text-sm">Monthly</div>
                    <div className="text-sm text-muted-foreground">
                      €{5 * deviceSlotQuantity}/month
                    </div>
                    <div className="text-xs text-muted-foreground/70">{t("pricing.exclVat")}</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeviceSlotPeriod("yearly")}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      deviceSlotPeriod === "yearly"
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className="font-medium text-foreground text-sm">Yearly</div>
                    <div className="text-sm text-muted-foreground">
                      €{50 * deviceSlotQuantity}/year
                    </div>
                    <div className="text-xs text-primary">Save €{10 * deviceSlotQuantity}</div>
                    <div className="text-xs text-muted-foreground/70">{t("pricing.exclVat")}</div>
                  </button>
                </div>

                {/* Pay by invoice option - only for yearly */}
                {deviceSlotPeriod === "yearly" && (
                  <div className="flex items-center gap-3 p-3 rounded-lg border border-border">
                    <input
                      type="checkbox"
                      id="payByInvoice"
                      checked={deviceSlotPayByInvoice}
                      onChange={(e) => setDeviceSlotPayByInvoice(e.target.checked)}
                      className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <label htmlFor="payByInvoice" className="flex-1 cursor-pointer">
                      <div className="font-medium text-foreground text-sm">
                        {t("devices.payByInvoice") || "Pay by invoice"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t("devices.payByInvoiceDesc") || "Receive an invoice with 14 days to pay"}
                      </div>
                    </label>
                  </div>
                )}
                
                <Button
                  onClick={handleAddDeviceSlotClick}
                  disabled={isLoadingDevice}
                  className="w-full"
                >
                  {isLoadingDevice ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Plus className="w-4 h-4 mr-2" />
                  )}
                  {deviceSlotPayByInvoice && deviceSlotPeriod === "yearly" 
                    ? (t("devices.requestInvoice") || "Request Invoice")
                    : t("devices.addBtn")}
                </Button>
              </div>
            )}
            {isLoadingSlots ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : deviceSlotSubs.length > 0 && (
              <div className="space-y-3">
                <p className="font-medium text-foreground">{t("devices.activeSlots") || "Your additional locations"}</p>
                {deviceSlotSubs.map((slot) => (
                  <div
                    key={slot.id}
                    className={`p-3 rounded-lg border ${
                      slot.cancelAtPeriodEnd 
                        ? "border-destructive/30 bg-destructive/5" 
                        : "border-border bg-secondary/50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-foreground text-sm">
                          {slot.quantity} {slot.quantity === 1 
                            ? (t("devices.location") || "location") 
                            : (t("devices.locations") || "locations")}
                          {" • "}
                          {slot.period === "yearly" ? t("subscription.yearly") : t("subscription.monthly")}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          €{slot.amount * slot.quantity}/{slot.period === "yearly" ? t("subscription.year") || "year" : t("subscription.month") || "month"}
                          {" • "}
                          {slot.cancelAtPeriodEnd 
                            ? (t("devices.endsOn") || "Ends") 
                            : (t("subscription.renewsOn") || "Renews")}: {new Date(slot.currentPeriodEnd).toLocaleDateString()}
                        </div>
                        {slot.cancelAtPeriodEnd && (
                          <div className="text-xs text-destructive mt-1">
                            {t("devices.willBeRemoved") || "Will be removed at end of billing period"}
                          </div>
                        )}
                      </div>
                      {!slot.cancelAtPeriodEnd && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCancelDeviceSlotConfirm(slot)}
                          disabled={cancellingSlotId === slot.id}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          {cancellingSlotId === slot.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <X className="w-4 h-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

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

            {/* Change Password Section - Show for users who have a password */}
            {hasPassword === true && (
            <div className="pt-6 border-t border-border space-y-4">
              <div className="flex items-center gap-2 text-foreground">
                <Lock className="w-4 h-4" />
                <span className="font-medium">{t("profile.changePassword")}</span>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="currentPassword">{t("auth.currentPassword")}</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-card"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="newPassword">{t("auth.newPassword")}</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-card"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">{t("auth.confirmPassword")}</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-card"
                />
              </div>

              <Button 
                onClick={handleChangePassword} 
                disabled={isChangingPassword || !currentPassword || !newPassword || !confirmPassword}
                variant="outline"
              >
                {isChangingPassword ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {t("auth.updatePassword")}
              </Button>
            </div>
            )}

            {/* Set Password Section - Only show for OAuth users who haven't set a password yet */}
            {hasPassword === false && (
            <div className="pt-6 border-t border-border space-y-4">
              <div className="flex items-center gap-2 text-foreground">
                <Lock className="w-4 h-4" />
                <span className="font-medium">{t("profile.setPassword")}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {t("profile.setPasswordDesc")}
              </p>

              <div className="space-y-2">
                <Label htmlFor="newPasswordOAuth">{t("auth.newPassword")}</Label>
                <Input
                  id="newPasswordOAuth"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-card"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPasswordOAuth">{t("auth.confirmPassword")}</Label>
                <Input
                  id="confirmPasswordOAuth"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-card"
                />
              </div>

              <Button 
                onClick={handleSetPassword} 
                disabled={isChangingPassword || !newPassword || !confirmPassword}
                variant="outline"
              >
                {isChangingPassword ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {t("profile.setPasswordBtn")}
              </Button>
            </div>
            )}
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



        {/* Sign Out */}
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <Button variant="destructive" onClick={handleSignOut}>
              {t("common.signOut")}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Invoice Billing Info Dialog */}
      <AlertDialog open={showInvoiceConfirm} onOpenChange={setShowInvoiceConfirm}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("devices.confirmInvoiceTitle") || "Request Invoice"}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                {/* Order summary */}
                <div className="p-3 rounded-lg border border-primary bg-primary/10">
                  <div className="font-medium text-foreground">
                    {deviceSlotQuantity} {deviceSlotQuantity === 1 ? t("devices.location") || "location" : t("devices.locations") || "locations"} ({t("subscription.yearly")})
                  </div>
                  <div className="text-sm text-muted-foreground">
                    €{50 * deviceSlotQuantity}/{t("subscription.year") || "year"} {t("pricing.exclVat")}
                  </div>
                </div>

                <p className="text-sm text-muted-foreground">
                  {t("devices.confirmInvoiceNote") || "An invoice will be sent to your email with 14 days to pay."}
                </p>

                {/* Billing info fields */}
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="deviceCompanyName" className="text-foreground">{t("billing.companyName") || "Company Name"} *</Label>
                    <Input
                      id="deviceCompanyName"
                      value={deviceCompanyName}
                      onChange={(e) => setDeviceCompanyName(e.target.value)}
                      placeholder={t("billing.companyNamePlaceholder") || "Your Company Ltd"}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="deviceAddressLine" className="text-foreground">{t("billing.streetAddress") || "Street Address"} *</Label>
                    <Input
                      id="deviceAddressLine"
                      value={deviceAddressLine}
                      onChange={(e) => setDeviceAddressLine(e.target.value)}
                      placeholder={t("billing.streetAddressPlaceholder") || "123 Business Street"}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="devicePostalCode" className="text-foreground">{t("billing.postalCode") || "Postal Code"} *</Label>
                      <Input
                        id="devicePostalCode"
                        value={devicePostalCode}
                        onChange={(e) => setDevicePostalCode(e.target.value)}
                        placeholder="00100"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="deviceCity" className="text-foreground">{t("billing.city") || "City"} *</Label>
                      <Input
                        id="deviceCity"
                        value={deviceCity}
                        onChange={(e) => setDeviceCity(e.target.value)}
                        placeholder={t("billing.cityPlaceholder") || "Helsinki"}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="deviceCountry" className="text-foreground">{t("billing.country") || "Country"} *</Label>
                    <select
                      id="deviceCountry"
                      value={deviceCountry}
                      onChange={(e) => setDeviceCountry(e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <option value="FI">Finland</option>
                      <option value="SE">Sweden</option>
                      <option value="DE">Germany</option>
                      <option value="FR">France</option>
                      <option value="NO">Norway</option>
                      <option value="DK">Denmark</option>
                      <option value="EE">Estonia</option>
                      <option value="NL">Netherlands</option>
                      <option value="BE">Belgium</option>
                      <option value="AT">Austria</option>
                      <option value="CH">Switzerland</option>
                      <option value="GB">United Kingdom</option>
                      <option value="US">United States</option>
                    </select>
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleAddDeviceSlot}>
              {t("devices.confirmInvoiceBtn") || "Send Invoice"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Device Slot Confirmation Dialog */}
      <AlertDialog open={!!slotToCancel} onOpenChange={(open) => !open && setSlotToCancel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("devices.confirmCancelTitle") || "Cancel Location?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {slotToCancel && (
                <>
                  <p className="mb-3">
                    {t("devices.confirmCancelDesc") || "Are you sure you want to cancel this location subscription?"}
                  </p>
                  <div className="p-3 rounded-lg border border-border bg-secondary/50 mb-3">
                    <div className="font-medium text-foreground">
                      {slotToCancel.quantity} {slotToCancel.quantity === 1 
                        ? (t("devices.location") || "location") 
                        : (t("devices.locations") || "locations")}
                      {" • "}
                      {slotToCancel.period === "yearly" ? t("subscription.yearly") : t("subscription.monthly")}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {t("subscription.renewsOn")}: {new Date(slotToCancel.currentPeriodEnd).toLocaleDateString()}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t("devices.confirmCancelNote") || "The location will remain active until the end of the current billing period."}
                  </p>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleCancelDeviceSlot}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("devices.confirmCancelBtn") || "Yes, Cancel Location"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Profile;
