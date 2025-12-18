import { usePWAInstall } from "@/hooks/usePWAInstall";
import { Button } from "@/components/ui/button";
import { Download, Check, Share, Plus, Smartphone } from "lucide-react";
import ambianLogo from "@/assets/ambian-logo.png";

const Install = () => {
  const { canInstall, isInstalled, isIOS, promptInstall } = usePWAInstall();

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md text-center space-y-8">
        {/* Logo */}
        <div className="flex flex-col items-center gap-4">
          <img src={ambianLogo} alt="Ambian" className="h-24" />
          <h1 className="text-3xl font-bold text-foreground">Install Ambian</h1>
          <p className="text-muted-foreground">
            Get the app for the best experience
          </p>
        </div>

        {/* Install Section */}
        <div className="bg-card border border-border rounded-2xl p-6 space-y-6">
          {isInstalled ? (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
                <Check className="w-8 h-8 text-primary" />
              </div>
              <div>
                <p className="text-xl font-semibold text-foreground">Already Installed!</p>
                <p className="text-muted-foreground mt-1">You're using the Ambian app</p>
              </div>
              <Button onClick={() => window.location.href = "/"} className="mt-2">
                Open App
              </Button>
            </div>
          ) : isIOS ? (
            <div className="space-y-6">
              <div className="flex items-center justify-center">
                <Smartphone className="w-12 h-12 text-primary" />
              </div>
              <p className="text-lg font-medium text-foreground">Install on iPhone/iPad</p>
              
              <div className="space-y-4 text-left">
                <div className="flex items-start gap-4 p-3 rounded-lg bg-secondary">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-primary font-bold">1</span>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Tap Share</p>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      Tap the <Share className="w-4 h-4 inline" /> button in Safari
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-3 rounded-lg bg-secondary">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-primary font-bold">2</span>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Add to Home Screen</p>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      Scroll and tap <Plus className="w-4 h-4 inline" /> "Add to Home Screen"
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-3 rounded-lg bg-secondary">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-primary font-bold">3</span>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Tap Add</p>
                    <p className="text-sm text-muted-foreground">Confirm to install the app</p>
                  </div>
                </div>
              </div>
            </div>
          ) : canInstall ? (
            <div className="space-y-6 py-4">
              <div className="flex items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
                  <Download className="w-8 h-8 text-primary" />
                </div>
              </div>
              <div>
                <p className="text-lg font-medium text-foreground">Ready to Install</p>
                <p className="text-muted-foreground mt-1">Add Ambian to your home screen</p>
              </div>
              <Button onClick={promptInstall} size="lg" className="w-full text-lg py-6">
                <Download className="w-5 h-5 mr-2" />
                Install Ambian
              </Button>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <Smartphone className="w-12 h-12 text-muted-foreground mx-auto" />
              <div>
                <p className="text-lg font-medium text-foreground">Install from Browser</p>
                <p className="text-muted-foreground mt-2 text-sm">
                  Open this page in <strong>Chrome</strong> (Android) or <strong>Safari</strong> (iOS), 
                  then use your browser menu to install.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Features */}
        <div className="text-sm text-muted-foreground space-y-2">
          <p>✓ Quick access from home screen</p>
          <p>✓ Lock screen music controls</p>
          <p>✓ Full screen experience</p>
        </div>
      </div>
    </div>
  );
};

export default Install;
