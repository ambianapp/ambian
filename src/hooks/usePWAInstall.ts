import { useState, useEffect } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export const usePWAInstall = () => {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isMacOS, setIsMacOS] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      console.log("[PWA] App is already installed (standalone mode)");
    }

    // Check if iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(isIOSDevice);

    // Check if macOS
    const isMac = /Macintosh|MacIntel|MacPPC|Mac68K/.test(navigator.userAgent);
    setIsMacOS(isMac);

    console.log("[PWA] Device info:", { isIOSDevice, isMac, userAgent: navigator.userAgent });

    // Listen for install prompt (works on Android/Chrome, Mac/Chrome, Windows/Chrome/Edge)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      console.log("[PWA] beforeinstallprompt event fired - install is available!");
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    // Listen for successful installation
    const handleAppInstalled = () => {
      console.log("[PWA] App was installed successfully");
      setIsInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    console.log("[PWA] Listeners registered, waiting for beforeinstallprompt event...");

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const promptInstall = async () => {
    if (!installPrompt) {
      console.log("[PWA] No install prompt available");
      return false;
    }

    console.log("[PWA] Triggering install prompt...");
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    console.log("[PWA] User choice:", outcome);
    
    if (outcome === "accepted") {
      setIsInstalled(true);
      setInstallPrompt(null);
    }
    
    return outcome === "accepted";
  };

  return {
    canInstall: !!installPrompt,
    isInstalled,
    isIOS,
    isMacOS,
    promptInstall,
  };
};
