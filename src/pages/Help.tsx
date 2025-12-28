import { ArrowLeft, Music, Play, Volume2, Clock, Heart, ListMusic, AlertTriangle, Wifi, RefreshCw, HelpCircle, Mail, Shield, CreditCard, MessageCircle, Shuffle, Building2, Pause, SkipForward, Disc3, Repeat, Speaker, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useLanguage } from "@/contexts/LanguageContext";
import { Input } from "@/components/ui/input";
import { useState, useMemo } from "react";

const Help = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");

  // Helper function to check if text matches search query
  const matchesSearch = (text: string) => {
    if (!searchQuery.trim()) return true;
    return text.toLowerCase().includes(searchQuery.toLowerCase());
  };

  // Check if a section should be visible based on search
  const sectionVisibility = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return { gettingStarted: true, playerControls: true, airplay: true, troubleshooting: true, faq: true, contact: true };

    const gettingStarted = [
      t("help.gettingStarted"), t("help.gettingStartedDesc"),
      t("help.playMusic"), t("help.playMusicDesc"),
      t("help.playlists"), t("help.playlistsDesc"),
      t("help.favorites"), t("help.favoritesDesc"),
      t("help.scheduling"), t("help.schedulingDesc"),
      t("help.quickMix"), t("help.quickMixDesc"),
      t("help.industryCollections"), t("help.industryCollectionsDesc")
    ].some(text => text.toLowerCase().includes(query));

    const playerControls = [
      t("help.playerControls"), t("help.playerControlsDesc"),
      t("help.playPause"), t("help.playPauseDesc"),
      t("help.skipTrack"), t("help.skipTrackDesc"),
      t("help.shuffle"), t("help.shuffleDesc"),
      t("help.repeat"), t("help.repeatDesc"),
      t("help.crossfade"), t("help.crossfadeDesc")
    ].some(text => text.toLowerCase().includes(query));

    const airplay = [
      t("help.airplay"), t("help.airplayDesc"),
      t("help.airplaySteps"), t("help.airplayStep1"),
      t("help.airplayStep2"), t("help.airplayStep3"),
      t("help.airplayStep4"), t("help.airplayTip"),
      t("help.airplayTipDesc"), "sonos", "airplay"
    ].some(text => text.toLowerCase().includes(query));

    const troubleshooting = [
      t("help.troubleshooting"), t("help.troubleshootingDesc"),
      t("help.noSound"), t("help.noSoundDesc"),
      t("help.buffering"), t("help.bufferingDesc"),
      t("help.notPlaying"), t("help.notPlayingDesc"),
      t("help.skipping"), t("help.skippingDesc")
    ].some(text => text.toLowerCase().includes(query));

    const faq = [
      t("help.faq"), t("help.faqDesc"),
      t("help.faqSubscription"), t("help.faqSubscriptionAnswer"),
      t("help.faqDevices"), t("help.faqDevicesAnswer"),
      t("help.faqLicense"), t("help.faqLicenseAnswer"),
      t("help.faqCancel"), t("help.faqCancelAnswer")
    ].some(text => text.toLowerCase().includes(query));

    const contact = [
      t("help.contact"), t("help.contactDesc"),
      t("help.emailSupport"), "email", "whatsapp", "support"
    ].some(text => text.toLowerCase().includes(query));

    return { gettingStarted, playerControls, airplay, troubleshooting, faq, contact };
  }, [searchQuery, t]);

  const showSection = (section: keyof typeof sectionVisibility) => {
    return sectionVisibility[section];
  };

  const hasResults = !searchQuery.trim() || Object.values(sectionVisibility).some(v => v === true);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border pt-2 md:pt-0">
        <div className="container max-w-4xl mx-auto px-4 py-4 flex items-center gap-4 pr-16 md:pr-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold">{t("help.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("help.subtitle")}</p>
          </div>
        </div>
        {/* Search Bar */}
        <div className="container max-w-4xl mx-auto px-4 pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder={t("help.searchPlaceholder") || "Search help topics..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10 bg-card border-border text-foreground placeholder:text-muted-foreground rounded-full text-sm"
            />
          </div>
        </div>
      </header>

      <main className="container max-w-4xl mx-auto px-4 py-8 pb-32 space-y-8">
        {/* No Results Message */}
        {!hasResults && (
          <div className="text-center py-12">
            <Search className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-lg font-medium text-foreground">{t("search.noResults")}</p>
            <p className="text-muted-foreground mt-2">{t("help.tryDifferentSearch") || "Try a different search term"}</p>
          </div>
        )}

        {/* Getting Started */}
        {showSection('gettingStarted') && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Music className="w-5 h-5 text-primary" />
              {t("help.gettingStarted")}
            </CardTitle>
            <CardDescription>{t("help.gettingStartedDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="p-4 rounded-lg bg-secondary/50">
                <div className="flex items-center gap-2 mb-2">
                  <Play className="w-4 h-4 text-primary" />
                  <span className="font-medium">{t("help.playMusic")}</span>
                </div>
                <p className="text-sm text-muted-foreground">{t("help.playMusicDesc")}</p>
              </div>
              <div className="p-4 rounded-lg bg-secondary/50">
                <div className="flex items-center gap-2 mb-2">
                  <ListMusic className="w-4 h-4 text-primary" />
                  <span className="font-medium">{t("help.playlists")}</span>
                </div>
                <p className="text-sm text-muted-foreground">{t("help.playlistsDesc")}</p>
              </div>
              <div className="p-4 rounded-lg bg-secondary/50">
                <div className="flex items-center gap-2 mb-2">
                  <Heart className="w-4 h-4 text-primary" />
                  <span className="font-medium">{t("help.favorites")}</span>
                </div>
                <p className="text-sm text-muted-foreground">{t("help.favoritesDesc")}</p>
              </div>
              <div className="p-4 rounded-lg bg-secondary/50">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-4 h-4 text-primary" />
                  <span className="font-medium">{t("help.scheduling")}</span>
                </div>
                <p className="text-sm text-muted-foreground">{t("help.schedulingDesc")}</p>
              </div>
              <div className="p-4 rounded-lg bg-secondary/50">
                <div className="flex items-center gap-2 mb-2">
                  <Shuffle className="w-4 h-4 text-primary" />
                  <span className="font-medium">{t("help.quickMix")}</span>
                </div>
                <p className="text-sm text-muted-foreground">{t("help.quickMixDesc")}</p>
              </div>
              <div className="p-4 rounded-lg bg-secondary/50">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="w-4 h-4 text-primary" />
                  <span className="font-medium">{t("help.industryCollections")}</span>
                </div>
                <p className="text-sm text-muted-foreground">{t("help.industryCollectionsDesc")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        )}

        {/* Player Controls */}
        {showSection('playerControls') && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Volume2 className="w-5 h-5 text-primary" />
              {t("help.playerControls")}
            </CardTitle>
            <CardDescription>{t("help.playerControlsDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30">
                <div className="flex items-center gap-2 min-w-[140px]">
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                    <Play className="w-4 h-4 text-primary-foreground ml-0.5" />
                  </div>
                  <span className="font-medium">{t("help.playPause")}</span>
                </div>
                <span className="text-muted-foreground">{t("help.playPauseDesc")}</span>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30">
                <div className="flex items-center gap-2 min-w-[140px]">
                  <SkipForward className="w-5 h-5 text-muted-foreground" />
                  <span className="font-medium">{t("help.skipTrack")}</span>
                </div>
                <span className="text-muted-foreground">{t("help.skipTrackDesc")}</span>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30">
                <div className="flex items-center gap-2 min-w-[140px]">
                  <Shuffle className="w-5 h-5 text-muted-foreground" />
                  <span className="font-medium">{t("help.shuffle")}</span>
                </div>
                <span className="text-muted-foreground">{t("help.shuffleDesc")}</span>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30">
                <div className="flex items-center gap-2 min-w-[140px]">
                  <Repeat className="w-5 h-5 text-muted-foreground" />
                  <span className="font-medium">{t("help.repeat")}</span>
                </div>
                <span className="text-muted-foreground">{t("help.repeatDesc")}</span>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30">
                <div className="flex items-center gap-2 min-w-[140px]">
                  <Disc3 className="w-5 h-5 text-muted-foreground" />
                  <span className="font-medium">{t("help.crossfade")}</span>
                </div>
                <span className="text-muted-foreground">{t("help.crossfadeDesc")}</span>
              </div>
            </div>
          </CardContent>
        </Card>
        )}

        {/* AirPlay & Sonos */}
        {showSection('airplay') && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Speaker className="w-5 h-5 text-primary" />
              {t("help.airplay")}
            </CardTitle>
            <CardDescription>{t("help.airplayDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded-lg bg-secondary/50 space-y-3">
              <h4 className="font-medium flex items-center gap-2">
                <Speaker className="w-4 h-4 text-primary" />
                {t("help.airplaySteps")}
              </h4>
              <ol className="list-decimal list-inside space-y-2 text-muted-foreground ml-2">
                <li>{t("help.airplayStep1")}</li>
                <li>{t("help.airplayStep2")}</li>
                <li>{t("help.airplayStep3")}</li>
                <li>{t("help.airplayStep4")}</li>
              </ol>
            </div>
            <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
              <p className="text-sm">
                <span className="font-medium text-primary">{t("help.airplayTip")}</span>{" "}
                <span className="text-muted-foreground">{t("help.airplayTipDesc")}</span>
              </p>
            </div>
          </CardContent>
        </Card>
        )}

        {/* Playback Troubleshooting */}
        {showSection('troubleshooting') && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              {t("help.troubleshooting")}
            </CardTitle>
            <CardDescription>{t("help.troubleshootingDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="no-sound">
                <AccordionTrigger className="text-left">
                  <div className="flex items-center gap-2">
                    <Volume2 className="w-4 h-4" />
                    {t("help.noSound")}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground space-y-2">
                  <p>{t("help.noSoundDesc")}</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>{t("help.noSoundTip1")}</li>
                    <li>{t("help.noSoundTip2")}</li>
                    <li>{t("help.noSoundTip3")}</li>
                    <li>{t("help.noSoundTip4")}</li>
                  </ul>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="buffering">
                <AccordionTrigger className="text-left">
                  <div className="flex items-center gap-2">
                    <Wifi className="w-4 h-4" />
                    {t("help.buffering")}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground space-y-2">
                  <p>{t("help.bufferingDesc")}</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>{t("help.bufferingTip1")}</li>
                    <li>{t("help.bufferingTip2")}</li>
                    <li>{t("help.bufferingTip3")}</li>
                  </ul>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="not-playing">
                <AccordionTrigger className="text-left">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4" />
                    {t("help.notPlaying")}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground space-y-2">
                  <p>{t("help.notPlayingDesc")}</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>{t("help.notPlayingTip1")}</li>
                    <li>{t("help.notPlayingTip2")}</li>
                    <li>{t("help.notPlayingTip3")}</li>
                    <li>{t("help.notPlayingTip4")}</li>
                  </ul>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="skipping">
                <AccordionTrigger className="text-left">
                  <div className="flex items-center gap-2">
                    <Music className="w-4 h-4" />
                    {t("help.skipping")}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground space-y-2">
                  <p>{t("help.skippingDesc")}</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>{t("help.skippingTip1")}</li>
                    <li>{t("help.skippingTip2")}</li>
                  </ul>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
        )}

        {/* Subscription & Account FAQ */}
        {showSection('faq') && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-primary" />
              {t("help.faq")}
            </CardTitle>
            <CardDescription>{t("help.faqDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="subscription">
                <AccordionTrigger className="text-left">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4" />
                    {t("help.faqSubscription")}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {t("help.faqSubscriptionAnswer")}
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="devices">
                <AccordionTrigger className="text-left">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    {t("help.faqDevices")}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {t("help.faqDevicesAnswer")}
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="license">
                <AccordionTrigger className="text-left">
                  <div className="flex items-center gap-2">
                    <Music className="w-4 h-4" />
                    {t("help.faqLicense")}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {t("help.faqLicenseAnswer")}
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="cancel">
                <AccordionTrigger className="text-left">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4" />
                    {t("help.faqCancel")}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {t("help.faqCancelAnswer")}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
        )}

        {/* Contact Support */}
        {showSection('contact') && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-primary" />
              {t("help.contact")}
            </CardTitle>
            <CardDescription>{t("help.contactDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <button 
                onClick={() => window.location.href = 'mailto:info@ambian.fi'}
                className="p-4 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors text-center cursor-pointer"
              >
                <Mail className="w-6 h-6 mx-auto mb-2 text-primary" />
                <p className="font-medium">{t("help.emailSupport")}</p>
                <p className="text-sm text-muted-foreground">info@ambian.fi</p>
              </button>
              <button 
                onClick={() => {
                  const phone = "358404666176";
                  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
                  const target = window.top ?? window;

                  if (isMobile) {
                    // Try to open the WhatsApp app first on mobile
                    target.location.href = `whatsapp://send?phone=${phone}`;
                    // Fallback to web after a short delay
                    setTimeout(() => {
                      target.open(`https://wa.me/${phone}`, "_blank", "noopener,noreferrer");
                    }, 600);
                    return;
                  }

                  target.open(`https://wa.me/${phone}`, "_blank", "noopener,noreferrer");
                }}
                className="p-4 rounded-lg bg-green-500/10 hover:bg-green-500/20 transition-colors text-center cursor-pointer"
              >
                <MessageCircle className="w-6 h-6 mx-auto mb-2 text-green-500" />
                <p className="font-medium">WhatsApp</p>
                <p className="text-sm text-muted-foreground">+358 40 466 6176</p>
              </button>
            </div>
          </CardContent>
        </Card>
        )}
      </main>
    </div>
  );
};

export default Help;
