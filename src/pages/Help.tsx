import { ArrowLeft, Music, Play, Volume2, Clock, Heart, ListMusic, AlertTriangle, Wifi, RefreshCw, HelpCircle, Mail, Shield, CreditCard, MessageCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useLanguage } from "@/contexts/LanguageContext";

const Help = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border">
        <div className="container max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">{t("help.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("help.subtitle")}</p>
          </div>
        </div>
      </header>

      <main className="container max-w-4xl mx-auto px-4 py-8 pb-32 space-y-8">
        {/* Getting Started */}
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
            </div>
          </CardContent>
        </Card>

        {/* Player Controls */}
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
                <span className="font-medium min-w-[100px]">{t("help.playPause")}</span>
                <span className="text-muted-foreground">{t("help.playPauseDesc")}</span>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30">
                <span className="font-medium min-w-[100px]">{t("help.skipTrack")}</span>
                <span className="text-muted-foreground">{t("help.skipTrackDesc")}</span>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30">
                <span className="font-medium min-w-[100px]">{t("help.shuffle")}</span>
                <span className="text-muted-foreground">{t("help.shuffleDesc")}</span>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30">
                <span className="font-medium min-w-[100px]">{t("help.crossfade")}</span>
                <span className="text-muted-foreground">{t("help.crossfadeDesc")}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Playback Troubleshooting */}
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

        {/* Subscription & Account FAQ */}
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

        {/* Contact Support */}
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
                onClick={() => window.location.href = 'mailto:support@ambian.fi'}
                className="p-4 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors text-center cursor-pointer"
              >
                <Mail className="w-6 h-6 mx-auto mb-2 text-primary" />
                <p className="font-medium">{t("help.emailSupport")}</p>
                <p className="text-sm text-muted-foreground">support@ambian.fi</p>
              </button>
              <button 
                onClick={() => window.open('https://wa.me/358404666176', '_blank', 'noopener,noreferrer')}
                className="p-4 rounded-lg bg-green-500/10 hover:bg-green-500/20 transition-colors text-center cursor-pointer"
              >
                <MessageCircle className="w-6 h-6 mx-auto mb-2 text-green-500" />
                <p className="font-medium">WhatsApp</p>
                <p className="text-sm text-muted-foreground">+358 40 466 6176</p>
              </button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Help;
