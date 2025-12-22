import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Check, Loader2, Music2, Clock, CreditCard, FileText, Calendar, RefreshCw, HelpCircle } from "lucide-react";
import ambianLogo from "@/assets/ambian-logo-new.png";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
    savings: "Save €17.80/year",
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
    savings: "Save €17.80",
  },
};

const features = [
  "Unlimited access to all music",
  "Create custom playlists",
  "No music license required",
  "100+ new songs every week",
  "Perfect for business premises",
];

const Pricing = () => {
  const { user, subscription, checkSubscription } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "yearly">("yearly");
  const [paymentType, setPaymentType] = useState<"subscription" | "prepaid">("subscription");
  const [isLoading, setIsLoading] = useState(false);
  const [isInvoiceLoading, setIsInvoiceLoading] = useState(false);
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
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
              title: "Payment Successful!",
              description: `Your access has been activated until ${new Date(data.access_until).toLocaleDateString()}.`,
            });
          } catch (error: any) {
            console.error("Payment verification error:", error);
            toast({
              title: "Verification Issue",
              description: "Payment received. Your access will be activated shortly.",
            });
          } finally {
            setIsVerifying(false);
          }
        } else {
          // For subscriptions, just show success message
          toast({
            title: "Subscription Activated!",
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
  }, [searchParams, user, checkSubscription, navigate, toast]);

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
        title: "Error",
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

    if (!companyName.trim()) {
      toast({
        title: "Company name required",
        description: "Please enter your company name for the invoice.",
        variant: "destructive",
      });
      return;
    }

    setIsInvoiceLoading(true);
    try {
      const plans = paymentType === "subscription" ? SUBSCRIPTION_PLANS : PREPAID_PLANS;
      const { data, error } = await supabase.functions.invoke("create-invoice", {
        body: { 
          priceId: plans[selectedPlan].priceId,
          companyName: companyName.trim(),
          companyAddress: companyAddress.trim(),
        },
      });

      if (error) throw error;

      toast({
        title: "Invoice Sent!",
        description: data.message || "Check your email for the invoice. You have 7 days to pay.",
      });
      setShowInvoiceDialog(false);
      setCompanyName("");
      setCompanyAddress("");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
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
          <p className="text-foreground text-lg">Activating your access...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 pb-48 md:p-8 md:pb-32">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Logo */}
        <div className="flex justify-center pt-4">
          <img src={ambianLogo} alt="Ambian" className="h-16 md:h-20" />
        </div>

        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-foreground">Subscribe to Listen</h1>
          <p className="text-muted-foreground mt-2">
            Get unlimited access to our entire music library for your business.
          </p>
        </div>

        {/* Trial active message */}
        {subscription.isTrial && (
          <div className="p-4 rounded-lg bg-primary/10 border border-primary/20 text-center">
            <div className="flex items-center justify-center gap-2 text-primary mb-2">
              <Clock className="w-5 h-5" />
              <span className="font-semibold">Free Trial Active</span>
            </div>
            <p className="text-muted-foreground">
              {subscription.trialDaysRemaining} day{subscription.trialDaysRemaining !== 1 ? 's' : ''} remaining. 
              Subscribe now to continue after your trial ends.
            </p>
          </div>
        )}

        {/* Active subscription/access message */}
        {subscription.subscribed && !subscription.isTrial && subscription.subscriptionEnd && (
          <div className="p-4 rounded-lg bg-primary/10 border border-primary/20 text-center">
            <div className="flex items-center justify-center gap-2 text-primary mb-2">
              <Calendar className="w-5 h-5" />
              <span className="font-semibold">Access Active</span>
            </div>
            <p className="text-muted-foreground">
              Your access is valid until <span className="font-medium text-foreground">{formatAccessEnd(subscription.subscriptionEnd)}</span>.
              {subscription.isRecurring ? " Your subscription will auto-renew." : " Buy more time to extend."}
            </p>
            {subscription.isRecurring && (
              <Button variant="link" onClick={() => navigate("/profile")} className="mt-2">
                Manage Subscription
              </Button>
            )}
          </div>
        )}

        {/* Payment Type Tabs */}
        <Tabs value={paymentType} onValueChange={(v) => setPaymentType(v as "subscription" | "prepaid")} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="subscription" className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />
              Subscription
            </TabsTrigger>
            <TabsTrigger value="prepaid" className="flex items-center gap-2">
              <CreditCard className="w-4 h-4" />
              One-Time Payment
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="subscription" className="mt-4">
            <p className="text-sm text-muted-foreground mb-4">
              Auto-renews each billing period. Cancel anytime.
            </p>
          </TabsContent>
          
          <TabsContent value="prepaid" className="mt-4">
            <p className="text-sm text-muted-foreground mb-4">
              Pay once for a set period. No auto-renewal. Buy more time when needed.
            </p>
          </TabsContent>
        </Tabs>

        {/* Plan Selection */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Monthly Plan */}
          <Card
            className={`cursor-pointer transition-all ${
              selectedPlan === "monthly"
                ? "border-primary ring-2 ring-primary/20"
                : "border-border hover:border-primary/50"
            }`}
            onClick={() => setSelectedPlan("monthly")}
          >
            <CardHeader>
              <CardTitle>{paymentType === "subscription" ? "Monthly" : "1 Month Access"}</CardTitle>
              <CardDescription>
                {paymentType === "subscription" ? "Billed monthly" : "One-time payment"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-foreground mb-1">
                {currentPlans.monthly.price}
                {paymentType === "subscription" && (
                  <span className="text-lg font-normal text-muted-foreground">/month</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">excl. VAT</p>
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
            <div className="absolute -top-3 right-4 px-3 py-1 bg-primary text-primary-foreground text-xs font-semibold rounded-full">
              Best Value
            </div>
            <CardHeader>
              <CardTitle>{paymentType === "subscription" ? "Yearly" : "1 Year Access"}</CardTitle>
              <CardDescription>{currentPlans.yearly.savings}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-foreground mb-1">
                {currentPlans.yearly.price}
                {paymentType === "subscription" && (
                  <span className="text-lg font-normal text-muted-foreground">/year</span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">≈ €7.40/month</p>
              <p className="text-xs text-muted-foreground">excl. VAT</p>
            </CardContent>
          </Card>
        </div>

        {/* Features */}
        <Card className="bg-card/50 border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Music2 className="w-5 h-5 text-primary" />
              What's Included
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid md:grid-cols-2 gap-3">
              {features.map((feature, index) => (
                <li key={index} className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                    <Check className="w-3 h-3 text-primary" />
                  </div>
                  <span className="text-foreground">{feature}</span>
                </li>
              ))}
              <li className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                  <Check className="w-3 h-3 text-primary" />
                </div>
                <span className="text-foreground">
                  {paymentType === "subscription" ? "Cancel anytime" : "No auto-renewal"}
                </span>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* Payment Options */}
        <div className="space-y-6">
          {!user ? (
            <div className="text-center">
              <Button
                size="lg"
                className="px-12 h-14 text-lg"
                onClick={() => navigate("/auth")}
              >
                Start Free Trial
              </Button>
              <p className="text-sm text-muted-foreground mt-4">
                3 days free • No credit card required
              </p>
            </div>
          ) : (
            <>
              {/* Payment Method Selection */}
              <div className="grid md:grid-cols-2 gap-4">
                {/* Pay Now Option */}
                <Card className="border-border hover:border-primary/50 transition-all">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <CreditCard className="w-5 h-5 text-primary" />
                      Pay Now
                    </CardTitle>
                    <CardDescription>
                      Pay immediately with card and receive invoice
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button
                      className="w-full"
                      onClick={handleCheckout}
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : null}
                      {paymentType === "subscription" ? "Subscribe" : "Buy"} {selectedPlan === "yearly" ? "Yearly" : "Monthly"}
                    </Button>
                  </CardContent>
                </Card>

                {/* Invoice Option */}
                <Card className="border-border hover:border-primary/50 transition-all">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <FileText className="w-5 h-5 text-primary" />
                      Pay by Invoice
                      <div className="relative group">
                        <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-popover border border-border rounded-lg shadow-lg text-sm text-popover-foreground w-64 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                          <p className="font-normal">Your subscription starts immediately. We'll send an invoice to your email with 7 days to complete the payment.</p>
                        </div>
                      </div>
                    </CardTitle>
                    <CardDescription>
                      Receive invoice with 7 days payment terms
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => setShowInvoiceDialog(true)}
                    >
                      Request Invoice
                    </Button>
                  </CardContent>
                </Card>
              </div>

              <p className="text-sm text-muted-foreground text-center">
                Prices shown exclude VAT. VAT will be calculated based on your location.
              </p>
            </>
          )}
        </div>

        {/* Invoice Request Dialog */}
        <Dialog open={showInvoiceDialog} onOpenChange={setShowInvoiceDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Request Invoice</DialogTitle>
              <DialogDescription>
                Enter your company details for the invoice. You'll have 7 days to pay.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="companyName">Company Name *</Label>
                <Input
                  id="companyName"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Your Company Ltd"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="companyAddress">Company Address</Label>
                <Input
                  id="companyAddress"
                  value={companyAddress}
                  onChange={(e) => setCompanyAddress(e.target.value)}
                  placeholder="123 Business Street, City"
                />
              </div>
              <div className="pt-2">
                <p className="text-sm text-muted-foreground mb-4">
                  Selected: <span className="font-medium text-foreground">
                    {selectedPlan === "yearly" ? "Yearly" : "Monthly"} ({paymentType === "subscription" ? "Subscription" : "One-time"})
                  </span> ({currentPlans[selectedPlan].price})
                </p>
                <Button
                  className="w-full"
                  onClick={handleInvoiceRequest}
                  disabled={isInvoiceLoading}
                >
                  {isInvoiceLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : null}
                  Send Invoice to My Email
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default Pricing;
