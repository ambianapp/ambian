import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Check, Loader2, Music2, Clock } from "lucide-react";

const PLANS = {
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

const features = [
  "3 days free trial",
  "Unlimited access to all music",
  "Create custom playlists",
  "No music license required",
  "100+ new songs every week",
  "Perfect for business premises",
  "Cancel anytime",
];

const Pricing = () => {
  const { user, subscription } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "yearly">("yearly");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

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
      }
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

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Choose Your Plan</h1>
            <p className="text-muted-foreground">
              Unlock unlimited music for your business
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
            <p className="text-muted-foreground mb-3">
              {subscription.trialDaysRemaining} day{subscription.trialDaysRemaining !== 1 ? 's' : ''} remaining. 
              Enjoy full access - no payment needed yet!
            </p>
            <Button onClick={() => navigate("/")} variant="default">
              Continue to App
            </Button>
          </div>
        )}

        {/* Already subscribed message */}
        {subscription.subscribed && !subscription.isTrial && (
          <div className="p-4 rounded-lg bg-primary/10 border border-primary/20 text-center">
            <p className="text-primary font-medium">
              You're subscribed! Manage your subscription in your profile.
            </p>
            <Button variant="link" onClick={() => navigate("/profile")} className="mt-2">
              Go to Profile
            </Button>
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
              <CardTitle>Monthly</CardTitle>
              <CardDescription>Pay month to month</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-foreground mb-2">
                {PLANS.monthly.price}
                <span className="text-lg font-normal text-muted-foreground">/month</span>
              </div>
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
              <CardTitle>Yearly</CardTitle>
              <CardDescription>{PLANS.yearly.savings}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-foreground mb-2">
                {PLANS.yearly.price}
                <span className="text-lg font-normal text-muted-foreground">/year</span>
              </div>
              <p className="text-sm text-muted-foreground">≈ €7.40/month</p>
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

        {/* CTA Button - only show if not subscribed and not in trial */}
        {!subscription.subscribed && !subscription.isTrial && (
          <div className="text-center">
            {!user ? (
              <>
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
              </>
            ) : (
              <>
                <Button
                  size="lg"
                  className="px-12 h-14 text-lg"
                  onClick={handleSubscribe}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  ) : null}
                  Subscribe Now
                </Button>
                <p className="text-sm text-muted-foreground mt-4">
                  No music license required. Cancel anytime.
                </p>
                <p className="text-xs text-muted-foreground/70 mt-2">
                  Prices shown exclude VAT. VAT will be calculated at checkout based on your location.
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Pricing;
