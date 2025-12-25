import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Mail, Lock, Loader2, Music, Calendar, Shield, Building2, Coffee, Store, Hotel, Dumbbell, Sparkles } from "lucide-react";
import ambianLogo from "@/assets/ambian-logo-original.png";
import { z } from "zod";
import { useLanguage } from "@/contexts/LanguageContext";

const Auth = () => {
  const { t } = useLanguage();
  const [isLogin, setIsLogin] = useState(false); // Default to register for new customers
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedMarketing, setAcceptedMarketing] = useState(false);
  
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; terms?: string }>({});
  const navigate = useNavigate();
  const { toast } = useToast();

  const authSchema = z.object({
    email: z.string().email(t("auth.validEmail")),
    password: z.string().min(6, t("auth.passwordMin")),
  });

  const validateForm = () => {
    try {
      authSchema.parse({ email, password });
      const fieldErrors: { email?: string; password?: string; terms?: string } = {};
      
      // Check terms acceptance for signup
      if (!isLogin && !acceptedTerms) {
        fieldErrors.terms = t("auth.mustAcceptTerms");
      }
      
      if (Object.keys(fieldErrors).length > 0) {
        setErrors(fieldErrors);
        return false;
      }
      
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: { email?: string; password?: string; terms?: string } = {};
        error.errors.forEach((err) => {
          if (err.path[0] === "email") fieldErrors.email = err.message;
          if (err.path[0] === "password") fieldErrors.password = err.message;
        });
        if (!isLogin && !acceptedTerms) {
          fieldErrors.terms = t("auth.mustAcceptTerms");
        }
        setErrors(fieldErrors);
      }
      return false;
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    
    setIsLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        navigate("/");
      } else {
        const redirectUrl = `${window.location.origin}/`;
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirectUrl,
          },
        });
        if (error) throw error;
        
        // Add user to Resend audiences
        try {
          await supabase.functions.invoke('add-to-audience', {
            body: { 
              email,
              audienceType: acceptedMarketing ? "both" : "all"
            }
          });
        } catch (audienceError) {
          console.error('Failed to add to audience:', audienceError);
        }
        
        // Send welcome email
        try {
          await supabase.functions.invoke('send-welcome-email', {
            body: { email }
          });
        } catch (welcomeError) {
          console.error('Failed to send welcome email:', welcomeError);
        }
        
        toast({ title: t("auth.accountCreated"), description: t("auth.welcomeToAmbian") });
        navigate("/");
      }
    } catch (error: any) {
      let message = error.message;
      if (message.includes("User already registered")) {
        message = t("auth.emailRegistered");
      }
      toast({
        title: t("common.error"),
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    // If in signup mode, require terms acceptance
    if (!isLogin && !acceptedTerms) {
      setErrors({ terms: t("auth.mustAcceptTerms") });
      toast({
        title: t("common.error"),
        description: t("auth.mustAcceptTerms"),
        variant: "destructive",
      });
      return;
    }
    
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/`,
        },
      });
      if (error) throw error;
      
      // If user opted in for marketing emails, store in localStorage to handle after OAuth callback
      if (!isLogin && acceptedMarketing) {
        localStorage.setItem('ambian_marketing_optin', 'true');
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

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setErrors({ email: t("auth.validEmail") });
      return;
    }
    
    setIsLoading(true);
    try {
      // Call our custom edge function to send branded email with reset link
      const response = await supabase.functions.invoke('send-auth-email', {
        body: { email, type: 'recovery' }
      });
      
      if (response.error) throw response.error;
      if (response.data?.error) throw new Error(response.data.error);
      
      setResetEmailSent(true);
      toast({
        title: t("auth.resetLinkSent") || "Reset link sent",
        description: t("auth.resetLinkSentDesc") || "Check your email for a link to reset your password.",
      });
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


  // Forgot Password View
  if (isForgotPassword) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6 animate-fade-in">
          <div className="text-center">
            <img src={ambianLogo} alt="Ambian" className="h-16 mx-auto mb-6" />
            {resetEmailSent ? (
              <>
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/20 flex items-center justify-center">
                  <Mail className="w-8 h-8 text-primary" />
                </div>
                <h1 className="text-2xl font-bold text-foreground mb-2">
                  {t("auth.checkEmail") || "Check your email"}
                </h1>
                <p className="text-muted-foreground">
                  {t("auth.resetLinkSentDesc") || "We've sent a password reset link to your email. Click the link to set a new password."}
                </p>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-foreground mb-2">
                  {t("auth.forgotPassword")}
                </h1>
                <p className="text-muted-foreground">
                  {t("auth.forgotPasswordDescLink") || "Enter your email and we'll send you a link to reset your password."}
                </p>
              </>
            )}
          </div>

          {resetEmailSent ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                {t("auth.didntReceive") || "Didn't receive the email? Check your spam folder or"}
              </p>
              <Button
                variant="outline"
                className="w-full h-12"
                onClick={() => setResetEmailSent(false)}
              >
                {t("auth.tryAgain") || "Try again"}
              </Button>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-email">{t("auth.email")}</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="reset-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 h-12 bg-card border-border"
                    required
                  />
                </div>
                {errors.email && (
                  <p className="text-sm text-destructive">{errors.email}</p>
                )}
              </div>

              <Button type="submit" className="w-full h-12" disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  t("auth.sendResetLink") || "Send Reset Link"
                )}
              </Button>
            </form>
          )}

          <div className="text-center">
            <button
              type="button"
              onClick={() => {
                setIsForgotPassword(false);
                setResetEmailSent(false);
                setErrors({});
              }}
              className="text-sm text-primary hover:underline"
            >
              {t("auth.backToLogin") || "Back to login"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex relative overflow-hidden">
      {/* Mobile Background Effects - Top Only */}
      <div className="lg:hidden absolute inset-x-0 top-0 h-[50vh] overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[80%] h-[80%] bg-primary/25 rounded-full blur-[100px] animate-drift" />
        <div className="absolute top-[10%] right-[-10%] w-[60%] h-[60%] bg-primary/15 rounded-full blur-[80px] animate-drift-slow" />
        {/* Fade to background */}
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background to-transparent" />
      </div>

      {/* Left Side - Brand Info */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-primary/20 via-primary/10 to-background overflow-hidden">
        {/* Slow Moving Gradient Background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {/* Large soft color blobs that drift slowly */}
          <div className="absolute top-[-10%] left-[-5%] w-[70%] h-[70%] bg-primary/20 rounded-full blur-[120px] animate-drift" />
          <div className="absolute bottom-[-10%] right-[-5%] w-[60%] h-[60%] bg-primary/15 rounded-full blur-[100px] animate-drift-slow" />
          <div className="absolute top-[30%] left-[20%] w-[50%] h-[50%] bg-primary/12 rounded-full blur-[80px] animate-drift-delayed" />
        </div>
        
        <div className="relative z-10 flex flex-col justify-center p-12 xl:p-16">
          {/* Logo */}
          <img src={ambianLogo} alt="Ambian" className="h-24 w-auto mb-8 self-start" />
          
          {/* Main Headline */}
          <div className="mb-6">
            <h1 className="text-4xl xl:text-5xl font-bold text-foreground mb-4 leading-tight">
              {t("auth.noLicenses")}
            </h1>
            <p className="text-lg text-muted-foreground max-w-lg">
              {t("auth.noLicensesDesc")}
            </p>
          </div>

          {/* Free Trial & Pricing */}
          <div className="mb-8 p-6 bg-card/50 backdrop-blur-sm rounded-2xl border border-border/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                <span className="text-2xl">🎉</span>
              </div>
              <div>
                <h3 className="font-bold text-foreground text-lg">{t("auth.freeTrialDays")}</h3>
                <p className="text-sm text-muted-foreground">{t("auth.noCardRequired")}</p>
              </div>
            </div>
            
            <div className="mt-4 p-4 bg-primary/10 rounded-xl text-center border border-primary/30">
              <div className="text-sm text-muted-foreground mb-1">{t("auth.startingAt")}</div>
              <div className="text-3xl font-bold text-foreground">€7.40<span className="text-lg font-normal text-muted-foreground">{t("auth.perMonth")}</span></div>
            </div>
          </div>
          
          {/* Who it's for */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wider mb-4">
              {t("auth.perfectFor")}
            </h3>
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center gap-2 bg-card/50 backdrop-blur-sm px-3 py-1.5 rounded-full border border-border/50 text-sm">
                <Coffee className="w-3.5 h-3.5 text-primary" />
                <span>{t("auth.restaurants")}</span>
              </div>
              <div className="flex items-center gap-2 bg-card/50 backdrop-blur-sm px-3 py-1.5 rounded-full border border-border/50 text-sm">
                <Hotel className="w-3.5 h-3.5 text-primary" />
                <span>{t("auth.hotels")}</span>
              </div>
              <div className="flex items-center gap-2 bg-card/50 backdrop-blur-sm px-3 py-1.5 rounded-full border border-border/50 text-sm">
                <Store className="w-3.5 h-3.5 text-primary" />
                <span>{t("auth.retail")}</span>
              </div>
              <div className="flex items-center gap-2 bg-card/50 backdrop-blur-sm px-3 py-1.5 rounded-full border border-border/50 text-sm">
                <Building2 className="w-3.5 h-3.5 text-primary" />
                <span>{t("auth.offices")}</span>
              </div>
              <div className="flex items-center gap-2 bg-card/50 backdrop-blur-sm px-3 py-1.5 rounded-full border border-border/50 text-sm">
                <Dumbbell className="w-3.5 h-3.5 text-primary" />
                <span>{t("auth.gyms")}</span>
              </div>
              <div className="flex items-center gap-2 bg-card/50 backdrop-blur-sm px-3 py-1.5 rounded-full border border-border/50 text-sm">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span>{t("auth.beautySalons")}</span>
              </div>
            </div>
          </div>
          
          {/* Features */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Music className="w-4 h-4 text-primary" />
              </div>
              <span className="text-sm text-foreground">{t("auth.curatedPlaylists")}</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Calendar className="w-4 h-4 text-primary" />
              </div>
              <span className="text-sm text-foreground">{t("auth.smartScheduling")}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Auth Form */}
      <div className="w-full lg:w-1/2 flex items-start md:items-center justify-center p-4 pt-4 md:pt-4 overflow-auto relative z-10">
        <div className="w-full max-w-md space-y-3 md:space-y-6 animate-fade-in">
          {/* Mobile/Tablet Logo */}
          <div className="lg:hidden">
            <img src={ambianLogo} alt="Ambian" className="h-12 mx-auto mb-1" />
            <p className="text-xs text-muted-foreground text-center mb-2">
              {t("auth.noLicensesShort")}
            </p>
          </div>
          
          {/* Header */}
          <div className="text-center lg:text-left">
            <h1 className="text-2xl font-bold text-foreground">
              {isLogin ? t("auth.welcomeBack") : t("auth.startTrial")}
            </h1>
            <p className="text-muted-foreground mt-2 hidden lg:block">
              {isLogin
                ? t("auth.signInToAccess")
                : t("auth.trialInfo")}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleAuth} className="space-y-3 md:space-y-4">

            <div className="space-y-2">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 h-12 bg-card border-border"
                  required
                />
              </div>
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email}</p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">{t("auth.password")}</Label>
                {isLogin && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsForgotPassword(true);
                      setResetEmailSent(false);
                    }}
                    className="text-xs text-primary hover:underline"
                  >
                    {t("auth.forgotPassword")}
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 h-12 bg-card border-border"
                  required
                />
              </div>
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password}</p>
              )}
            </div>

            {/* Terms Checkbox - Only show for signup */}
            {!isLogin && (
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="terms"
                    checked={acceptedTerms}
                    onCheckedChange={(checked) => setAcceptedTerms(checked === true)}
                    className="mt-1"
                  />
                  <Label htmlFor="terms" className="text-sm text-muted-foreground leading-relaxed cursor-pointer">
                    {t("auth.iAccept")}{" "}
                    <Link to="/terms" className="text-primary hover:underline" target="_blank">
                      {t("auth.termsAndConditions")}
                    </Link>
                  </Label>
                </div>
                {errors.terms && (
                  <p className="text-sm text-destructive">{errors.terms}</p>
                )}
                
                {/* Marketing opt-in checkbox */}
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="marketing"
                    checked={acceptedMarketing}
                    onCheckedChange={(checked) => setAcceptedMarketing(checked === true)}
                    className="mt-1"
                  />
                  <Label htmlFor="marketing" className="text-sm text-muted-foreground leading-relaxed cursor-pointer">
                    {t("auth.marketingOptIn")}
                  </Label>
                </div>
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-12"
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : isLogin ? (
                t("auth.signIn")
              ) : (
                t("auth.startFreeTrial")
              )}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                {t("auth.orContinueWith")}
              </span>
            </div>
          </div>

          <Button
            variant="outline"
            className="w-full h-12"
            onClick={handleGoogleLogin}
            disabled={isLoading}
          >
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Google
          </Button>

          <div className="text-center space-y-2">
            <p className="text-base text-muted-foreground">
              {isLogin ? t("auth.noAccount") : t("auth.haveAccount")}{" "}
              <button
                type="button"
                onClick={() => setIsLogin(!isLogin)}
                className="text-primary hover:underline font-semibold text-base"
              >
                {isLogin ? t("auth.signUp") : t("auth.signIn")}
              </button>
            </p>
            {isLogin && (
              <p className="text-xs text-muted-foreground hidden lg:block">
                {t("auth.trialInfo")}
              </p>
            )}
          </div>

          {/* Mobile Pricing Info - Bottom */}
          <div className="lg:hidden mt-4 pt-4 border-t border-border/50">
            <div className="flex items-center justify-center gap-4">
              <div className="text-center">
                <div className="text-sm font-semibold text-primary">{t("auth.threeDaysFree")}</div>
                <div className="text-xs text-muted-foreground">{t("auth.noCardNeeded")}</div>
              </div>
              <div className="h-8 w-px bg-border/50" />
              <div className="text-center">
                <div className="text-xs text-muted-foreground">{t("auth.startingAt")}</div>
                <div className="text-base font-bold text-foreground">€7.40<span className="text-xs font-normal text-muted-foreground">{t("auth.perMonth")}</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
