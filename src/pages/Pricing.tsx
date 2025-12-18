import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Check, Loader2, Music2, Clock, CreditCard, FileText, Calendar } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const PLANS = {
  monthly: {
    priceId: "price_1SfhOOJrU52a7SNLPPopAVyb",
    price: "€8.90",
    interval: "month",
    duration: "1 month",
  },
  yearly: {
    priceId: "price_1SfhOZJrU52a7SNLIejHHUh4",
    price: "€89",
    interval: "year",
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
  "Buy more time anytime",
];

const Pricing = () => {
  const { user, subscription, checkSubscription } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "yearly">("yearly");
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
      
      if (checkoutStatus === "success" && sessionId && user) {
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
          
          // Refresh subscription status
          await checkSubscription();
          
          // Clear URL params
          navigate("/", { replace: true });
        } catch (error: any) {
          console.error("Payment verification error:", error);
          toast({
            title: "Verification Issue",
            description: "Payment received. Your access will be activated shortly.",
          });
          navigate("/", { replace: true });
        } finally {
          setIsVerifying(false);
        }
      }
    };

    verifyPayment();
  }, [searchParams, user, checkSubscription, navigate, toast]);

  const handleSubscribe = async () => {
    if (!user) {
      navigate("/auth");
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { priceId: PLANS[selectedPlan].priceId },
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
      const { data, error } = await supabase.functions.invoke("create-invoice", {
        body: { 
          priceId: PLANS[selectedPlan].priceId,
          companyName: companyName.trim(),
          companyAddress: companyAddress.trim(),
        },
      });

      if (error) throw error;

      toast({
        title: "Invoice Sent!",
        description: data.message || "Check your email for the invoice. You have 14 days to pay.",
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

  // Format access end date
  const formatAccessEnd = (dateStr: string | null) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

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
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Buy Access Time</h1>
            <p className="text-muted-foreground">
              Prepay for unlimited music access
            </p>
          </div>
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
              Buy access now to continue after your trial ends.
            </p>
          </div>
        )}

        {/* Active access message */}
        {subscription.subscribed && !subscription.isTrial && subscription.subscriptionEnd && (
          <div className="p-4 rounded-lg bg-primary/10 border border-primary/20 text-center">
            <div className="flex items-center justify-center gap-2 text-primary mb-2">
              <Calendar className="w-5 h-5" />
              <span className="font-semibold">Access Active</span>
            </div>
            <p className="text-muted-foreground">
              Your access is valid until <span className="font-medium text-foreground">{formatAccessEnd(subscription.subscriptionEnd)}</span>.
              <br />
              Buy more time to extend your access.
            </p>
          </div>
        )}

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
              <CardTitle>1 Month Access</CardTitle>
              <CardDescription>Pay for one month</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-foreground mb-2">
                {PLANS.monthly.price}
              </div>
              <p className="text-sm text-muted-foreground">One-time payment</p>
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
              <CardTitle>1 Year Access</CardTitle>
              <CardDescription>{PLANS.yearly.savings}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-foreground mb-2">
                {PLANS.yearly.price}
              </div>
              <p className="text-sm text-muted-foreground">≈ €7.40/month • One-time payment</p>
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
                      onClick={handleSubscribe}
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : null}
                      Buy {PLANS[selectedPlan].duration} Access
                    </Button>
                  </CardContent>
                </Card>

                {/* Invoice Option */}
                <Card className="border-border hover:border-primary/50 transition-all">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <FileText className="w-5 h-5 text-primary" />
                      Pay by Invoice
                    </CardTitle>
                    <CardDescription>
                      Receive invoice with 14 days payment terms
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

              <p className="text-xs text-muted-foreground/70 text-center">
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
                Enter your company details for the invoice. You'll have 14 days to pay.
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
                  Selected plan: <span className="font-medium text-foreground">{selectedPlan === "yearly" ? "1 Year" : "1 Month"}</span> ({PLANS[selectedPlan].price})
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
