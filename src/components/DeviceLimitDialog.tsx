import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Smartphone, Monitor, Tablet, X, Loader2, Plus, Play } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePlayer } from "@/contexts/PlayerContext";

interface ActiveDevice {
  sessionId: string;
  deviceInfo: string;
  createdAt: string;
  updatedAt: string;
}

interface DeviceLimitDialogProps {
  open: boolean;
  activeDevices: ActiveDevice[];
  deviceSlots: number;
  currentSessionId: string;
  onDisconnect: (sessionId: string) => Promise<{ success: boolean; needsUserGesture: boolean }>;
  onClose: () => void;
}

const parseDeviceInfo = (userAgent: string, sessionId?: string): { type: "phone" | "tablet" | "desktop"; name: string; browser: string } => {
  const ua = userAgent.toLowerCase();
  
  // Detect device type
  let type: "phone" | "tablet" | "desktop" = "desktop";
  if (/mobile|iphone|android.*mobile|windows phone/i.test(ua)) {
    type = "phone";
  } else if (/ipad|android(?!.*mobile)|tablet/i.test(ua)) {
    type = "tablet";
  }

  // Try to extract meaningful device name
  let deviceName = "Unknown Device";
  
  if (/iphone/i.test(ua)) {
    deviceName = "iPhone";
  } else if (/ipad/i.test(ua)) {
    deviceName = "iPad";
  } else if (/macintosh|mac os/i.test(ua)) {
    deviceName = "Mac";
  } else if (/windows/i.test(ua)) {
    deviceName = "Windows PC";
  } else if (/android/i.test(ua)) {
    deviceName = type === "phone" ? "Android Phone" : "Android Tablet";
  } else if (/linux/i.test(ua)) {
    deviceName = "Linux";
  }

  // Detect browser
  let browser = "";
  if (/chrome|crios/i.test(ua) && !/edge|edg/i.test(ua)) {
    browser = "Chrome";
  } else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) {
    browser = "Safari";
  } else if (/firefox|fxios/i.test(ua)) {
    browser = "Firefox";
  } else if (/edge|edg/i.test(ua)) {
    browser = "Edge";
  }

  const name = browser ? `${deviceName} (${browser})` : deviceName;

  return { type, name, browser };
};

// Check if two sessions appear to be from the same physical device
const isSameDevice = (sessionId1: string, sessionId2: string): boolean => {
  // If both use fingerprint-based IDs, compare the fingerprint portion
  if (sessionId1.startsWith('fp_') && sessionId2.startsWith('fp_')) {
    // Extract fingerprint (first 8 characters after 'fp_' are the stable hash)
    const fp1 = sessionId1.substring(3, 11);
    const fp2 = sessionId2.substring(3, 11);
    return fp1 === fp2;
  }
  return false;
};

const DeviceIcon = ({ type }: { type: "phone" | "tablet" | "desktop" }) => {
  switch (type) {
    case "phone":
      return <Smartphone className="h-5 w-5" />;
    case "tablet":
      return <Tablet className="h-5 w-5" />;
    default:
      return <Monitor className="h-5 w-5" />;
  }
};

const formatLastActive = (dateStr: string): string => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
};

export const DeviceLimitDialog = ({
  open,
  activeDevices,
  deviceSlots,
  currentSessionId,
  onDisconnect,
  onClose,
}: DeviceLimitDialogProps) => {
  const navigate = useNavigate();
  const { handlePlayPause, currentTrack, isPlaying } = usePlayer();
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState<{ sessionId: string; deviceName: string } | null>(null);
  const [showPlayButton, setShowPlayButton] = useState(false);

  const handleDisconnectClick = (sessionId: string, deviceName: string) => {
    setConfirmDisconnect({ sessionId, deviceName });
  };

  const handleConfirmDisconnect = async () => {
    if (!confirmDisconnect) return;
    
    setDisconnecting(confirmDisconnect.sessionId);
    setConfirmDisconnect(null);
    try {
      const result = await onDisconnect(confirmDisconnect.sessionId);
      // If on iOS, show a play button instead of auto-closing
      if (result.success && result.needsUserGesture && currentTrack) {
        setShowPlayButton(true);
      }
    } finally {
      setDisconnecting(null);
    }
  };

  const handlePlayNow = () => {
    // This is a direct user gesture - will work on iOS
    if (!isPlaying && currentTrack) {
      handlePlayPause();
    }
    setShowPlayButton(false);
    onClose();
  };

  const handleAddDevice = () => {
    onClose();
    navigate("/profile", { state: { scrollTo: "devices" } });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
        <DialogContent className="max-w-md">
          {showPlayButton ? (
            // Success state - iOS needs user gesture to play
            <>
              <DialogHeader>
                <DialogTitle className="text-xl text-center">Device Disconnected!</DialogTitle>
                <DialogDescription className="text-muted-foreground text-center">
                  You can now play music on this device. Tap the button below to start.
                </DialogDescription>
              </DialogHeader>
              
              <div className="mt-6 flex flex-col items-center gap-4">
                <Button size="lg" onClick={handlePlayNow} className="w-full max-w-xs">
                  <Play className="h-5 w-5 mr-2" />
                  Play Music
                </Button>
                <Button variant="ghost" size="sm" onClick={onClose}>
                  Maybe later
                </Button>
              </div>
            </>
          ) : (
            // Normal device list view
            <>
              <DialogHeader>
                <DialogTitle className="text-xl">Device Limit Reached</DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  You're using {activeDevices.length} of {deviceSlots} allowed device{deviceSlots !== 1 ? "s" : ""}. 
                  Disconnect a device to play music here, or continue in read-only mode.
                </DialogDescription>
              </DialogHeader>

              <div className="mt-4 space-y-3">
                {activeDevices.map((device) => {
                  const { type, name } = parseDeviceInfo(device.deviceInfo, device.sessionId);
                  const isCurrentDevice = device.sessionId === currentSessionId;
                  
                  // Check if this device appears to be the same physical device as current
                  const isSamePhysicalDevice = !isCurrentDevice && isSameDevice(device.sessionId, currentSessionId);

                  return (
                    <div
                      key={device.sessionId}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        isCurrentDevice ? "border-primary/50 bg-primary/5" : 
                        isSamePhysicalDevice ? "border-warning/50 bg-warning/5" : 
                        "border-border bg-card"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${
                          isCurrentDevice ? "bg-primary/20" : 
                          isSamePhysicalDevice ? "bg-warning/20" : 
                          "bg-muted"
                        }`}>
                          <DeviceIcon type={type} />
                        </div>
                        <div>
                          <div className="font-medium text-sm">
                            {name}
                            {isCurrentDevice && (
                              <span className="ml-2 text-xs text-primary">(This device)</span>
                            )}
                            {isSamePhysicalDevice && (
                              <span className="ml-2 text-xs text-warning">(Same device, different browser)</span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Last active: {formatLastActive(device.updatedAt)}
                          </div>
                        </div>
                      </div>

                      {!isCurrentDevice && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDisconnectClick(device.sessionId, name)}
                          disabled={disconnecting !== null}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          {disconnecting === device.sessionId ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <X className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Add more devices upsell */}
              <div className="mt-4 p-3 rounded-lg bg-primary/5 border border-primary/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Need more devices?</p>
                    <p className="text-xs text-muted-foreground">Add extra device slots for €5/month each</p>
                  </div>
                  <Button size="sm" variant="default" onClick={handleAddDevice}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t space-y-2">
                <Button variant="outline" className="w-full" onClick={onClose}>
                  Continue in Read-Only Mode
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  You can browse playlists but can't play music until you disconnect a device.
                </p>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmation dialog for disconnect */}
      <AlertDialog open={!!confirmDisconnect} onOpenChange={(open) => !open && setConfirmDisconnect(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect device?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to disconnect <strong>{confirmDisconnect?.deviceName}</strong>? 
              If someone is using it, their music will stop playing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDisconnect} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
