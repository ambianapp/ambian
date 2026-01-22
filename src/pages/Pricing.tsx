import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Clock, CreditCard, FileText, Calendar, RefreshCw, Mail, ExternalLink, Info } from "lucide-react";

import LanguageSelector from "@/components/LanguageSelector";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// Subscription prices (recurring)
const SUBSCRIPTION_PLANS = {
  monthly: {
    priceId: "price_1S2BhCJrU52a7SNLtRRpyoCl",
    price: "€8.90",
    interval: "month",
  },
  yearly: {
    priceId: "price_1S2BqdJrU52a7SNLAnOR8Nhf",
    price: "€89",
    interval: "year",
    savingsKey: "pricing.saveYearly",
  },
};

// Prepaid prices (one-time)
const PREPAID_PLANS = {
  monthly: {
    priceId: "price_1SfhOOJrU52a7SNLPPopAVyb",
    price: "€8.90",
    duration: "1 month",
  },
  yearly: {
    priceId: "price_1SfhOZJrU52a7SNLIejHHUh4",
    price: "€89",
    duration: "1 year",
    savingsKey: "pricing.saveOneTime",
  },
};


const Pricing = () => {
  const { user, subscription, checkSubscription } = useAuth();
  const { t } = useLanguage();
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "yearly">("yearly");
  const [paymentType, setPaymentType] = useState<"subscription" | "prepaid">("subscription");
  const [isLoading, setIsLoading] = useState(false);
  const [isInvoiceLoading, setIsInvoiceLoading] = useState(false);
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("FI");
  const [vatId, setVatId] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [hasOpenInvoices, setHasOpenInvoices] = useState(false);
  const [isCheckingInvoices, setIsCheckingInvoices] = useState(false);
  
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();


  // Handle payment verification on return from Stripe
  useEffect(() => {
    const verifyPayment = async () => {
      const sessionId = searchParams.get("session_id");
      const checkoutStatus = searchParams.get("checkout");
      const mode = searchParams.get("mode");
      
      if (checkoutStatus === "success" && user) {
        // For prepaid payments, verify and activate access
        if (mode === "prepaid" && sessionId) {
          setIsVerifying(true);
          try {
            const { data, error } = await supabase.functions.invoke("verify-payment", {
              body: { sessionId },
            });

            if (error) throw error;

            toast({
              title: t("common.success"),
              description: `Your access has been activated until ${new Date(data.access_until).toLocaleDateString()}.`,
            });
          } catch (error: any) {
            console.error("Payment verification error:", error);
            toast({
              title: t("common.success"),
              description: "Payment received. Your access will be activated shortly.",
            });
          } finally {
            setIsVerifying(false);
          }
        } else {
          // For subscriptions, just show success message
          toast({
            title: t("common.success"),
            description: "Your subscription is now active. Enjoy unlimited music!",
          });
        }
        
        // Refresh subscription status
        await checkSubscription();
        
        // Clear URL params
        navigate("/", { replace: true });
      }
    };

    verifyPayment();
  }, [searchParams, user, checkSubscription, navigate, toast, t]);

  // Check if user has open invoices (to block invoice requests upfront)
  useEffect(() => {
    const checkOpenInvoices = async () => {
      if (!user) {
        setHasOpenInvoices(false);
        return;
      }
      
      setIsCheckingInvoices(true);
      try {
        const { data, error } = await supabase.functions.invoke("get-invoices");
        if (error) throw error;

        const invoices = Array.isArray(data?.invoices) ? data.invoices : [];

        // We only need to know if there's anything unpaid/open right now.
        // (The backend function already filters out draft in UI results, but keep it safe.)
        const openInvoices = invoices.filter(
          (inv: any) => inv?.status === "open" || inv?.status === "draft"
        );

        setHasOpenInvoices(openInvoices.length > 0);
      } catch (error) {
        console.error("Error checking invoices:", error);
        setHasOpenInvoices(false);
      } finally {
        setIsCheckingInvoices(false);
      }
    };

    checkOpenInvoices();
  }, [user]);

  const handleCheckout = async () => {
    if (!user) {
      navigate("/auth");
      return;
    }

    setIsLoading(true);
    try {
      const plans = paymentType === "subscription" ? SUBSCRIPTION_PLANS : PREPAID_PLANS;
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { 
          priceId: plans[selectedPlan].priceId,
          paymentMode: paymentType === "subscription" ? "subscription" : "payment",
        },
      });

      if (error) throw error;

      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error("Checkout could not be started. Please try again.");
      }
    } catch (error: any) {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  const handleInvoiceRequest = async () => {
    if (!user) {
      navigate("/auth");
      return;
    }

    if (!companyName.trim() || !addressLine.trim() || !city.trim() || !postalCode.trim()) {
      toast({
        title: t("common.error"),
        description: "Please fill in all company and address fields for the invoice.",
        variant: "destructive",
      });
      return;
    }

    setIsInvoiceLoading(true);
    try {
      // Invoice payment is yearly one-time only, use prepaid price
      const yearlyPriceId = PREPAID_PLANS.yearly.priceId;
      const { data, error } = await supabase.functions.invoke("create-invoice", {
        body: { 
          priceId: yearlyPriceId,
          companyName: companyName.trim(),
          address: {
            line1: addressLine.trim(),
            city: city.trim(),
            postal_code: postalCode.trim(),
            country: country,
          },
          vatId: vatId.trim() || undefined,
        },
      });

      if (error) throw error;

      toast({
        title: t("common.success"),
        description: data.message || "Check your email for the invoice. You have 7 days to pay.",
      });
      setShowInvoiceDialog(false);
      setCompanyName("");
      setAddressLine("");
      setCity("");
      setPostalCode("");
      setCountry("FI");
      setVatId("");
    } catch (error: any) {
      console.error("Invoice creation error:", error);
      let errorMessage = "Failed to create invoice";

      // Try multiple paths to extract the actual error message
      if (error?.message) {
        // Check if the message itself contains JSON
        try {
          const parsed = JSON.parse(error.message);
          if (parsed?.error) errorMessage = parsed.error;
          else if (parsed?.message) errorMessage = parsed.message;
          else errorMessage = error.message;
        } catch {
          errorMessage = error.message;
        }
      }

      // Check context.body (Supabase functions error structure)
      const maybeBody = error?.context?.body;
      if (typeof maybeBody === "string") {
        try {
          const parsed = JSON.parse(maybeBody);
          if (parsed?.error) errorMessage = parsed.error;
          else if (parsed?.message) errorMessage = parsed.message;
        } catch {
          // ignore
        }
      } else if (maybeBody && typeof maybeBody === "object") {
        if (maybeBody.error) errorMessage = maybeBody.error;
        else if (maybeBody.message) errorMessage = maybeBody.message;
      }

      // Check error.error (direct object structure)
      if (error?.error && typeof error.error === "string") {
        errorMessage = error.error;
      }

      // If Supabase only gives a generic non-2xx message, provide a more helpful fallback.
      if (
        typeof errorMessage === "string" &&
        /non-2xx|non 2xx|returned a non/i.test(errorMessage)
      ) {
        errorMessage =
          "Invoice request was blocked. If you already have an unpaid invoice, please pay it before requesting a new one.";
      }

      toast({
        title: t("common.error"),
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsInvoiceLoading(false);
    }
  };

  const formatAccessEnd = (dateStr: string | null) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const currentPlans = paymentType === "subscription" ? SUBSCRIPTION_PLANS : PREPAID_PLANS;

  if (isVerifying) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto" />
          <p className="text-foreground text-lg">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 pb-48 md:p-8 md:pb-32 relative overflow-hidden">
      {/* Background Gradients (static) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-5%] w-[50%] h-[50%] bg-primary/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[5%] right-[-10%] w-[55%] h-[55%] bg-primary/10 rounded-full blur-[120px]" />
        <div className="absolute top-[40%] left-[30%] w-[30%] h-[30%] bg-primary/6 rounded-full blur-[80px]" />
      </div>
      
      <div className="max-w-4xl mx-auto space-y-8 relative z-10">
        {/* Back button */}
        <div className="flex items-center justify-between pt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t("common.back")}
          </Button>
          <div className="mr-12 md:mr-0">
            <LanguageSelector />
          </div>
        </div>

        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground">
            {t("pricing.titlePrefix")} <span className="text-white">Ambian</span>
          </h1>
        </div>

        {/* Trial active message */}
        {subscription.isTrial && (
          <div className="p-4 rounded-lg bg-primary/10 border border-primary/20 text-center">
            <div className="flex items-center justify-center gap-2 text-primary mb-2">
              <Clock className="w-5 h-5" />
              <span className="font-semibold">{t("pricing.trialActive")}</span>
            </div>
            <p className="text-muted-foreground">
              {t("pricing.daysRemaining").replace("{days}", String(subscription.trialDaysRemaining))}
            </p>
          </div>
        )}

        {/* Pending invoice message */}
        {subscription.subscribed && subscription.isPendingPayment && subscription.subscriptionEnd && (
          <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-center">
            <div className="flex items-center justify-center gap-2 text-yellow-500 mb-2">
              <Mail className="w-5 h-5" />
              <span className="font-semibold">{t("subscription.paymentDue")}</span>
            </div>
            <p className="text-muted-foreground">
              {t("pricing.validUntil")}{" "}
              <span className="font-medium text-foreground">{formatAccessEnd(subscription.subscriptionEnd)}</span>
            </p>
            <p className="text-xs text-yellow-600 mt-2">
              <Clock className="w-3 h-3 inline mr-1" />
              {t("subscription.ibanNote")}
            </p>
          </div>
        )}

        {/* Active subscription/access message */}
        {subscription.subscribed && !subscription.isTrial && !subscription.isPendingPayment && subscription.subscriptionEnd && (
          <div className={`p-4 rounded-lg text-center ${subscription.cancelAtPeriodEnd ? 'bg-orange-500/10 border border-orange-500/20' : 'bg-primary/10 border border-primary/20'}`}>
            <div className={`flex items-center justify-center gap-2 mb-2 ${subscription.cancelAtPeriodEnd ? 'text-orange-500' : 'text-primary'}`}>
              <Calendar className="w-5 h-5" />
              <span className="font-semibold">
                {subscription.cancelAtPeriodEnd ? t("pricing.subscriptionCancelled") : t("pricing.accessActive")}
              </span>
            </div>
            <p className="text-muted-foreground">
              {subscription.cancelAtPeriodEnd 
                ? <>{t("pricing.validUntil")} <span className="font-medium text-foreground">{formatAccessEnd(subscription.subscriptionEnd)}</span>. {t("pricing.cancelled")}</>
                : <>{t("pricing.validUntil")} <span className="font-medium text-foreground">{formatAccessEnd(subscription.subscriptionEnd)}</span>. {subscription.isRecurring ? t("pricing.autoRenew") : t("pricing.buyMore")}</>
              }
            </p>
            {subscription.isRecurring && !subscription.cancelAtPeriodEnd && (
              <Button variant="link" onClick={() => navigate("/profile")} className="mt-2">
                {t("subscription.manageBtn")}
              </Button>
            )}
          </div>
        )}

        {/* Payment Type Tabs */}
        <Tabs value={paymentType} onValueChange={(v) => setPaymentType(v as "subscription" | "prepaid")} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="subscription" className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />
              {t("pricing.subscription")}
            </TabsTrigger>
            <TabsTrigger value="prepaid" className="flex items-center gap-2">
              <CreditCard className="w-4 h-4" />
              {t("pricing.oneTimeOrInvoice")}
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="subscription" className="mt-4">
            <p className="text-sm text-muted-foreground mb-4 text-center">
              {t("pricing.autoRenews")}
            </p>
          </TabsContent>
          
          <TabsContent value="prepaid" className="mt-4">
            <p className="text-sm text-muted-foreground mb-4 text-center">
              {t("pricing.payOnce")}
            </p>
          </TabsContent>
        </Tabs>

        {/* Plan Selection */}
        <div className="grid grid-cols-2 gap-3 md:gap-6">
          {/* Monthly Plan */}
          <Card
            className={`cursor-pointer transition-all ${
              selectedPlan === "monthly"
                ? "border-primary ring-2 ring-primary/20"
                : "border-border hover:border-primary/50"
            }`}
            onClick={() => setSelectedPlan("monthly")}
          >
            <CardHeader className="p-3 md:p-6 pb-2 md:pb-2">
              <CardTitle className="text-sm md:text-xl">{paymentType === "subscription" ? t("pricing.monthly") : t("pricing.monthAccess")}</CardTitle>
              <CardDescription className="text-xs md:text-sm">
                {paymentType === "subscription" ? t("pricing.billedMonthly") : t("pricing.billedYearly")}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-3 md:p-6 pt-2 md:pt-4 space-y-3 md:space-y-4">
              <div className="min-h-[60px] md:min-h-[88px]">
                <div className="text-2xl md:text-4xl font-bold text-foreground mb-1">
                  {currentPlans.monthly.price}
                  {paymentType === "subscription" && (
                    <span className="text-xs md:text-lg font-normal text-muted-foreground">/{t("subscription.month")}</span>
                  )}
                </div>
                <p className="text-[10px] md:text-xs text-muted-foreground">{t("pricing.exclVat")}</p>
              </div>
              {selectedPlan === "monthly" && user && (
                <Button
                  className="w-full text-xs md:text-sm h-9 md:h-10"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCheckout();
                  }}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : null}
                  {t("pricing.payNow")}
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Yearly Plan */}
          <Card
            className={`cursor-pointer transition-all relative ${
              selectedPlan === "yearly"
                ? "border-primary ring-2 ring-primary/20"
                : "border-border hover:border-primary/50"
            }`}
            onClick={() => setSelectedPlan("yearly")}
          >
            <div className="absolute -top-2.5 md:-top-3 right-2 md:right-4 px-2 md:px-3 py-0.5 md:py-1 bg-primary text-primary-foreground text-[10px] md:text-xs font-semibold rounded-full">
              {t("pricing.bestValue")}
            </div>
            <CardHeader className="p-3 md:p-6 pb-2 md:pb-2">
              <CardTitle className="text-sm md:text-xl">{paymentType === "subscription" ? t("pricing.yearly") : t("pricing.yearAccess")}</CardTitle>
              <CardDescription className="text-xs md:text-sm">{t(currentPlans.yearly.savingsKey)}</CardDescription>
            </CardHeader>
            <CardContent className="p-3 md:p-6 pt-2 md:pt-4 space-y-3 md:space-y-4">
              <div className="min-h-[60px] md:min-h-[88px]">
                <div className="text-2xl md:text-4xl font-bold text-foreground mb-1">
                  {currentPlans.yearly.price}
                  {paymentType === "subscription" && (
                    <span className="text-xs md:text-lg font-normal text-muted-foreground">/{t("subscription.year")}</span>
                  )}
                </div>
                <p className="text-[10px] md:text-xs text-muted-foreground">{t("pricing.exclVat")}</p>
              </div>
              {selectedPlan === "yearly" && user && (
                <div className="space-y-2">
                  <Button
                    className="w-full text-xs md:text-sm h-9 md:h-10"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCheckout();
                    }}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <CreditCard className="w-4 h-4 mr-2" />
                    )}
                    <span className="hidden md:inline">{t("pricing.payNow")}</span>
                    <span className="md:hidden">{t("pricing.pay")}</span>
                  </Button>
                  {paymentType === "prepaid" && (
                    <>
                      {hasOpenInvoices ? (
                        <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-center space-y-2">
                          <p className="text-xs text-amber-600 dark:text-amber-400">
                            {t("pricing.unpaidInvoiceWarning") || "You have an unpaid invoice. Please pay it first."}
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full border-amber-500/50 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate("/profile?tab=billing");
                            }}
                          >
                            <ExternalLink className="w-4 h-4 mr-2" />
                            {t("pricing.viewUnpaidInvoice") || "View & Pay Invoice"}
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          className="w-full text-xs md:text-sm h-9 md:h-10 justify-between"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!subscription.isPendingPayment) {
                              setShowInvoiceDialog(true);
                            }
                          }}
                          disabled={subscription.isPendingPayment || isCheckingInvoices}
                        >
                          <span className="flex items-center">
                            {isCheckingInvoices ? (
                              <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            ) : (
                              <FileText className="w-4 h-4 mr-2" />
                            )}
                            <span className="hidden md:inline">{t("pricing.payByInvoice")}</span>
                            <span className="md:hidden">{t("pricing.invoice")}</span>
                          </span>
                          <Popover>
                            <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <span className="p-1 hover:bg-muted rounded">
                                <Info className="w-4 h-4 text-muted-foreground" />
                              </span>
                            </PopoverTrigger>
                            <PopoverContent className="w-72 text-sm" align="end">
                              <div className="space-y-2">
                                <h4 className="font-medium">{t("pricing.invoiceInfoTitle")}</h4>
                                <ul className="text-muted-foreground space-y-1 text-xs">
                                  <li>• {t("pricing.invoiceInfo1")}</li>
                                  <li>• {t("pricing.invoiceInfo2")}</li>
                                  <li>• {t("pricing.invoiceInfo3")}</li>
                                </ul>
                              </div>
                            </PopoverContent>
                          </Popover>
                        </Button>
                      )}
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Payment Options */}
        <div className="space-y-6">
          {!user && (
            <div className="text-center">
              <Button
                size="lg"
                className="px-12 h-14 text-lg"
                onClick={() => navigate("/auth")}
              >
                {t("pricing.startTrial")}
              </Button>
              <p className="text-sm text-muted-foreground mt-4">
                {t("auth.trialInfo")}
              </p>
            </div>
          )}
          {user && (
            <p className="text-sm text-muted-foreground text-center">
              {t("pricing.vatExcluded")}
            </p>
          )}
        </div>



        {/* Invoice Request Dialog */}
        <Dialog open={showInvoiceDialog} onOpenChange={setShowInvoiceDialog}>
          <DialogContent className="sm:max-w-md max-h-[85dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("pricing.requestInvoice")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              {/* Show selected yearly plan info */}
              <div className="p-2.5 rounded-lg border border-primary bg-primary/10">
                <div className="font-medium text-foreground text-sm">{t("pricing.yearAccess")}</div>
                <div className="text-xs text-muted-foreground">{currentPlans.yearly.price}/{t("subscription.year")} {t("pricing.plusVat")}</div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="companyName" className="text-sm">{t("billing.companyName")} *</Label>
                <Input
                  id="companyName"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder={t("billing.companyNamePlaceholder")}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="addressLine" className="text-sm">{t("billing.streetAddress")} *</Label>
                <Input
                  id="addressLine"
                  value={addressLine}
                  onChange={(e) => setAddressLine(e.target.value)}
                  placeholder={t("billing.streetAddressPlaceholder")}
                  className="h-9"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="postalCode" className="text-sm">{t("billing.postalCode")} *</Label>
                  <Input
                    id="postalCode"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    placeholder="00100"
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="city" className="text-sm">{t("billing.city")} *</Label>
                  <Input
                    id="city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder={t("billing.cityPlaceholder")}
                    className="h-9"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="country" className="text-sm">{t("billing.country")} *</Label>
                <select
                  id="country"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="FI">{t("countries.finland")}</option>
                  <option value="SE">{t("countries.sweden")}</option>
                  <option value="DE">{t("countries.germany")}</option>
                  <option value="FR">{t("countries.france")}</option>
                  <option value="NL">{t("countries.netherlands")}</option>
                  <option value="BE">{t("countries.belgium")}</option>
                  <option value="AT">{t("countries.austria")}</option>
                  <option value="ES">{t("countries.spain")}</option>
                  <option value="IT">{t("countries.italy")}</option>
                  <option value="PT">{t("countries.portugal")}</option>
                  <option value="NO">{t("countries.norway")}</option>
                  <option value="DK">{t("countries.denmark")}</option>
                  <option value="PL">{t("countries.poland")}</option>
                  <option value="IE">{t("countries.ireland")}</option>
                  <option value="GB">{t("countries.uk")}</option>
                  <option value="US">{t("countries.usa")}</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vatId" className="text-sm">{t("billing.vatId")}</Label>
                <Input
                  id="vatId"
                  value={vatId}
                  onChange={(e) => setVatId(e.target.value.toUpperCase())}
                  placeholder={t("billing.vatIdPlaceholder")}
                  className="h-9"
                />
                <p className="text-xs text-muted-foreground">
                  {t("billing.vatIdHint")}
                </p>
              </div>
              <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                <Clock className="w-3 h-3 inline mr-1" />
                {t("subscription.ibanNote")}
              </p>
              <Button
                className="w-full"
                onClick={handleInvoiceRequest}
                disabled={isInvoiceLoading}
              >
                {isInvoiceLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                {t("pricing.requestInvoice")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default Pricing;
