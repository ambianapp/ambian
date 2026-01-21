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

interface DeviceSlotItem {
  id: string; // Subscription item ID
  subscriptionId: string;
  quantity: number;
  period: "monthly" | "yearly";
  amount: number;
  currency: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  scheduledQuantityReduction?: number; // If only some slots are being cancelled
  isLineItem: boolean;
}

// Expanded representation for individual location rows
interface ExpandedDeviceSlot {
  id: string; // Subscription item ID
  subscriptionId: string;
  index: number; // 0-based index within this item's quantity
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
  const [deviceSlotQuantity, setDeviceSlotQuantity] = useState(1);
  const [isChangingPlan, setIsChangingPlan] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(false);
  const [deviceSlotSubs, setDeviceSlotSubs] = useState<DeviceSlotItem[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [cancellingSlotId, setCancellingSlotId] = useState<string | null>(null);
  const [slotToCancel, setSlotToCancel] = useState<ExpandedDeviceSlot | null>(null);
  const [showAddConfirmDialog, setShowAddConfirmDialog] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [trialTimeRemaining, setTrialTimeRemaining] = useState<TimeRemaining | null>(null);
  const [prepaidProration, setPrepaidProration] = useState<{
    remainingDays: number;
    proratedPrice: number;
    periodEnd: string;
  } | null>(null);
  const [recurringProration, setRecurringProration] = useState<{
    proratedPrice: number;
    proratedTax: number;
    proratedTotal: number;
    fullPrice: number;
    remainingDays: number;
    periodEnd: string;
    interval: string;
    currency: string;
    isSendInvoice: boolean;
  } | null>(null);
  const [isLoadingProration, setIsLoadingProration] = useState(false);
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
    
    // Check if returning from prepaid device slot checkout
    const deviceSlotAdded = searchParams.get("device_slot_added");
    const sessionId = searchParams.get("session_id");
    
    if (deviceSlotAdded === "true" && sessionId) {
      // Verify the payment and update device slots
      const verifyPayment = async () => {
        try {
          const { data, error } = await supabase.functions.invoke("verify-device-slot-payment", {
            body: { sessionId },
          });
          
          if (error) throw error;
          
          if (data?.success) {
            toast({
              title: t("devices.addSuccess") || "Device added",
              description: t("devices.addSuccessDesc") || "Your additional device has been added.",
            });
            
            // Refresh subscription data
            await checkSubscription();
          }
        } catch (error: any) {
          console.error("Failed to verify device slot payment:", error);
          toast({
            title: t("common.error"),
            description: error.message,
            variant: "destructive",
          });
        }
        
        navigate("/profile", { replace: true });
      };
      
      verifyPayment();
    }
    
    // Check if device slot checkout was cancelled
    if (searchParams.get("device_slot_cancelled") === "true") {
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

  // Load proration info for prepaid users
  const loadPrepaidProration = async () => {
    if (!user || subscription.isRecurring || !subscription.subscribed || subscription.isTrial) {
      setPrepaidProration(null);
      return;
    }
    
    setIsLoadingProration(true);
    try {
      const { data, error } = await supabase.functions.invoke("add-device-slot-prepaid", {
        body: { mode: "calculate" },
      });
      
      if (error) throw error;
      
      if (data?.success) {
        setPrepaidProration({
          remainingDays: data.remainingDays,
          proratedPrice: data.proratedPrice,
          periodEnd: data.periodEnd,
        });
      }
    } catch (error: any) {
      console.error("Failed to load prepaid proration:", error);
      setPrepaidProration(null);
    } finally {
      setIsLoadingProration(false);
    }
  };

  useEffect(() => {
    loadPrepaidProration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, subscription.isRecurring, subscription.subscribed, subscription.isTrial]);

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

      toast({ title: t("toast.profileUpdated"), description: t("toast.profileUpdatedDesc") });
    } catch (error: any) {
      toast({
        title: t("common.error"),
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

  const handleAddDeviceSlotClick = async () => {
    // For recurring subscriptions, fetch the prorated amount first
    if (subscription.isRecurring) {
      setIsLoadingProration(true);
      try {
        const { data, error } = await supabase.functions.invoke("add-device-slot", {
          body: { mode: "calculate", quantity: deviceSlotQuantity },
        });
        
        if (error) throw error;
        
        if (data?.success) {
          setRecurringProration({
            proratedPrice: data.proratedPrice,
            proratedTax: data.proratedTax || 0,
            proratedTotal: data.proratedTotal || data.proratedPrice,
            fullPrice: data.fullPrice,
            remainingDays: data.remainingDays,
            periodEnd: data.periodEnd,
            interval: data.interval,
            currency: data.currency,
            isSendInvoice: data.isSendInvoice,
          });
        }
      } catch (error: any) {
        console.error("Failed to calculate proration:", error);
        // Still show dialog but without proration info
        setRecurringProration(null);
      } finally {
        setIsLoadingProration(false);
      }
    }
    setShowAddConfirmDialog(true);
  };

  const handleConfirmAddDeviceSlot = () => {
    setShowAddConfirmDialog(false);
    handleAddDeviceSlot();
  };

  const handleAddDeviceSlot = async () => {
    setIsLoadingDevice(true);
    try {
      const { data, error } = await supabase.functions.invoke("add-device-slot", { 
        body: { quantity: deviceSlotQuantity }
      });
      if (error) throw error;
      
      if (data?.success) {
        toast({
          title: t("devices.addSuccess") || "Location added",
          description: data.message || t("devices.addSuccessDesc") || "Your additional locations have been added.",
        });
        
        // Refresh device slots and subscription
        await Promise.all([
          loadDeviceSlots(),
          checkSubscription(),
        ]);
        
        // Reset quantity
        setDeviceSlotQuantity(1);
      } else if (data?.url) {
        // Fallback to checkout if needed
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

  const handleAddPrepaidDeviceSlot = async () => {
    setIsLoadingDevice(true);
    try {
      const { data, error } = await supabase.functions.invoke("add-device-slot-prepaid", {
        body: { mode: "checkout", quantity: deviceSlotQuantity },
      });
      
      if (error) throw error;
      
      if (data?.url) {
        // Redirect to Stripe checkout
        window.location.href = data.url;
      }
    } catch (error: any) {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoadingDevice(false);
    }
  };

  const handleCancelDeviceSlotConfirm = (slot: ExpandedDeviceSlot) => {
    setSlotToCancel(slot);
  };

  const handleCancelDeviceSlot = async () => {
    if (!slotToCancel) return;
    
    const { id: itemId, subscriptionId } = slotToCancel;
    setSlotToCancel(null);
    setCancellingSlotId(itemId);
    try {
      const { data, error } = await supabase.functions.invoke("cancel-device-slot", {
        body: { itemId, subscriptionId, quantityToRemove: 1 },
      });
      if (error) throw error;
      
      // Show appropriate message based on whether it's scheduled or immediate
      if (data?.scheduledForRemoval) {
        const removalDate = data.removalDate 
          ? new Date(data.removalDate).toLocaleDateString()
          : "";
        toast({
          title: t("devices.cancelScheduled") || "Device scheduled for removal",
          description: t("devices.cancelScheduledDesc")?.replace("{date}", removalDate) || 
            `The device will be removed on ${removalDate}. You can continue using it until then.`,
        });
      } else {
        toast({
          title: t("devices.cancelSuccess") || "Device removed",
          description: t("devices.cancelSuccessDesc") || "The device has been removed. A prorated credit will be applied.",
        });
      }
      
      // Reload device slots
      await Promise.all([
        loadDeviceSlots(),
        checkSubscription(),
      ]);
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
                          {openInvoices.length > 1 && (
                            <span className="font-medium">{openInvoices.length} {t("invoices.openInvoices") || "open invoices"}</span>
                          )}
                          {openInvoices.length > 1 ? " · " : ""}
                          {t("invoices.total") || "Total"}: {formatCurrency(totalAmount, currency)}
                          {earliestDueDate && (
                            <>
                              <br className="sm:hidden" />
                              <span className="hidden sm:inline"> · </span>
                              {t("invoices.dueBy")}: {earliestDueDate.toLocaleDateString()}
                            </>
                          )}
                        </p>
                      );
                    })()}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2 sm:mt-0">
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
                {/* Show valid until for cancelled subscriptions */}
                {subscription.cancelAtPeriodEnd && subscription.subscriptionEnd && (
                  <p className="text-sm text-muted-foreground">
                    {t("subscription.validUntil")} {new Date(subscription.subscriptionEnd).toLocaleDateString()}
                  </p>
                )}
              </div>
              
              {/* Reactivate button - between valid until and cancelled badge */}
              {subscription.cancelAtPeriodEnd && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => navigate("/pricing")}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  {t("subscription.reactivate")}
                </Button>
              )}
              
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

            {/* Plan Change Options - only show for recurring subscriptions */}
            {subscription.subscribed && !subscription.isTrial && !subscription.cancelAtPeriodEnd && subscription.isRecurring && (
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
            {/* Device List - show all devices including base */}
            <div className="space-y-2">
              {/* Base subscription device (only show when user has active subscription) */}
              {subscription.subscribed && !subscription.isTrial && (
                <div className="p-3 rounded-lg border border-primary/30 bg-primary/5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                        1
                      </div>
                      <div>
                        <div className="font-medium text-foreground text-sm">
                          {t("devices.location") || "Device"} 1
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {t("devices.includedInSubscription") || "Included in subscription"}
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-primary font-medium px-2 py-1 rounded bg-primary/10">
                      {t("devices.included") || "Included"}
                    </div>
                  </div>
                </div>
              )}

              {/* Additional locations */}
              {isLoadingSlots ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                deviceSlotSubs.flatMap((slot) => {
                  // Calculate how many slots are cancelled vs active
                  const scheduledReduction = slot.scheduledQuantityReduction;
                  const cancelledCount = slot.cancelAtPeriodEnd 
                    ? slot.quantity // All cancelled
                    : scheduledReduction !== undefined 
                      ? slot.quantity - scheduledReduction // Some cancelled
                      : 0; // None cancelled
                  
                  return Array.from({ length: slot.quantity }, (_, idx) => {
                    // Later indices are cancelled first (most recently added)
                    const isCancelled = idx >= (slot.quantity - cancelledCount);
                    return {
                      id: slot.id,
                      subscriptionId: slot.subscriptionId,
                      index: idx,
                      period: slot.period,
                      amount: slot.amount,
                      currency: slot.currency,
                      currentPeriodEnd: slot.currentPeriodEnd,
                      cancelAtPeriodEnd: isCancelled,
                    } as ExpandedDeviceSlot;
                  });
                }).map((expandedSlot, rowIndex) => (
                  <div
                    key={`${expandedSlot.id}-${expandedSlot.index}`}
                    className={`p-3 rounded-lg border ${
                      expandedSlot.cancelAtPeriodEnd 
                        ? "border-destructive/30 bg-destructive/5" 
                        : "border-border bg-secondary/50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                          expandedSlot.cancelAtPeriodEnd 
                            ? "bg-destructive/20 text-destructive" 
                            : "bg-secondary text-foreground"
                        }`}>
                          {rowIndex + 2}
                        </div>
                        <div>
                          <div className="font-medium text-foreground text-sm">
                            {t("devices.location") || "Location"} {rowIndex + 2}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            €{expandedSlot.amount}/{expandedSlot.period === "yearly" ? t("subscription.year") || "year" : t("subscription.month") || "month"}
                            {" • "}
                            {expandedSlot.cancelAtPeriodEnd 
                              ? (t("devices.endsOn") || "Ends") 
                              : (t("subscription.renewsOn") || "Renews")}: {new Date(expandedSlot.currentPeriodEnd).toLocaleDateString()}
                          </div>
                          {expandedSlot.cancelAtPeriodEnd && (
                            <div className="text-xs text-destructive mt-1">
                              {t("devices.willBeRemoved") || "Will be removed at end of billing period"}
                            </div>
                          )}
                        </div>
                      </div>
                      {!expandedSlot.cancelAtPeriodEnd && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCancelDeviceSlotConfirm(expandedSlot)}
                          disabled={cancellingSlotId === expandedSlot.id}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          {cancellingSlotId === expandedSlot.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <X className="w-4 h-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Add Location Button */}
            {(!subscription.subscribed || subscription.isTrial || subscription.cancelAtPeriodEnd) ? (
              <div className="p-4 rounded-lg border border-border bg-muted/30 space-y-3">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Plus className="w-5 h-5" />
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
            ) : !subscription.isRecurring ? (
              // Prepaid users can add devices with prorated pricing
              <div className="p-4 rounded-lg border border-dashed border-border hover:border-primary/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                      <Plus className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{t("devices.addLocation") || "Add another device"}</p>
                      {isLoadingProration ? (
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          {t("common.loading") || "Loading..."}
                        </p>
                      ) : prepaidProration ? (
                        <p className="text-sm text-muted-foreground">
                          €{prepaidProration.proratedPrice.toFixed(2)} {t("devices.proratedUntil") || "prorated until"}{" "}
                          {new Date(prepaidProration.periodEnd).toLocaleDateString()}
                          <span className="text-xs ml-1">({prepaidProration.remainingDays} {t("devices.daysRemaining") || "days"})</span>
                          {" • "}{t("pricing.exclVat")}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          {t("devices.proratedPricing") || "Prorated for remaining subscription period"}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground/70 mt-1">
                        {t("devices.prepaidNotice") || "This is a one-time purchase. You'll need to renew when your subscription expires."}
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={() => {
                      setDeviceSlotQuantity(1);
                      handleAddPrepaidDeviceSlot();
                    }}
                    disabled={isLoadingDevice || isLoadingProration || !prepaidProration}
                    size="sm"
                  >
                    {isLoadingDevice ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Plus className="w-4 h-4 mr-1" />
                        {t("devices.add") || "Add"}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-lg border border-dashed border-border hover:border-primary/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                      <Plus className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{t("devices.addLocation") || "Add another location"}</p>
                      <p className="text-sm text-muted-foreground">
                        {subscription.planType === "yearly" 
                          ? `€50/${t("subscription.year") || "year"}`
                          : `€5/${t("subscription.month") || "month"}`}
                        {" • "}{t("pricing.exclVat")}
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={() => {
                      setDeviceSlotQuantity(1);
                      handleAddDeviceSlotClick();
                    }}
                    disabled={isLoadingDevice}
                    size="sm"
                  >
                    {isLoadingDevice ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Plus className="w-4 h-4 mr-1" />
                        {t("devices.add") || "Add"}
                      </>
                    )}
                  </Button>
                </div>
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
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(invoice.hostedUrl!, "_blank")}
                            className="gap-1.5"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            {t("invoices.show")}
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
                      1 {t("devices.location") || "location"}
                      {" • "}
                      {slotToCancel.period === "yearly" ? t("subscription.yearly") : t("subscription.monthly")}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {t("subscription.renewsOn")}: {new Date(slotToCancel.currentPeriodEnd).toLocaleDateString()}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t("devices.confirmCancelNote") || "A prorated credit will be applied to your account."}
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

      {/* Add Device Slot Confirmation Dialog */}
      <AlertDialog open={showAddConfirmDialog} onOpenChange={setShowAddConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("devices.confirmAddTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              <p className="mb-3">{t("devices.confirmAddDesc")}</p>
              <div className="p-3 rounded-lg border border-border bg-secondary/50 mb-3">
                <div className="font-medium text-foreground mb-2">
                  {deviceSlotQuantity} {t("devices.additionalDevice") || "Additional device"}{deviceSlotQuantity > 1 ? "s" : ""}
                </div>
                
                {/* Show prorated amount for recurring subscriptions */}
                {subscription.isRecurring && recurringProration ? (
                  <div className="space-y-1.5">
                    <div className="text-sm">
                      <span className="text-muted-foreground">{t("devices.chargedNow") || "Charged now"}: </span>
                      <span className="font-medium text-foreground">€{recurringProration.proratedTotal.toFixed(2)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground pl-4">
                      (€{recurringProration.proratedPrice.toFixed(2)} + €{recurringProration.proratedTax.toFixed(2)} {t("pricing.vat") || "VAT"})
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {t("devices.validUntil") || "Valid until subscription renewal"} {new Date(recurringProration.periodEnd).toLocaleDateString(language === "fi" ? "fi-FI" : language === "sv" ? "sv-SE" : "en-GB", { day: 'numeric', month: 'numeric', year: 'numeric' })}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {t("devices.thenRegular") || "Then"} €{recurringProration.fullPrice}/{recurringProration.interval === "year" ? t("subscription.year") : t("subscription.month")} {t("pricing.plusVat") || "+ VAT"}
                    </div>
                    {recurringProration.isSendInvoice && (
                      <div className="text-xs text-primary/80 mt-1">
                        {t("devices.invoiceNote") || "An invoice will be sent for payment"}
                      </div>
                    )}
                  </div>
                ) : subscription.isRecurring && isLoadingProration ? (
                  <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {t("common.loading") || "Loading..."}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    {subscription.planType === "yearly" 
                      ? `€${50 * deviceSlotQuantity}/${t("subscription.year")}` 
                      : `€${5 * deviceSlotQuantity}/${t("subscription.month")}`}
                    {" "}({t("pricing.exclVat")})
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmAddDeviceSlot}
              disabled={isLoadingDevice || isLoadingProration}
            >
              {isLoadingDevice ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              {t("devices.confirmAddBtn")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Profile;
