import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Smartphone, Monitor, Tablet, X, Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

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
  onDisconnect: (sessionId: string) => Promise<void>;
  onClose: () => void;
}

const parseDeviceInfo = (userAgent: string): { type: "phone" | "tablet" | "desktop"; name: string } => {
  const ua = userAgent.toLowerCase();
  
  // Detect device type
  let type: "phone" | "tablet" | "desktop" = "desktop";
  if (/mobile|iphone|android.*mobile|windows phone/i.test(ua)) {
    type = "phone";
  } else if (/ipad|android(?!.*mobile)|tablet/i.test(ua)) {
    type = "tablet";
  }

  // Try to extract meaningful device name
  let name = "Unknown Device";
  
  if (/iphone/i.test(ua)) {
    name = "iPhone";
  } else if (/ipad/i.test(ua)) {
    name = "iPad";
  } else if (/macintosh|mac os/i.test(ua)) {
    name = "Mac";
  } else if (/windows/i.test(ua)) {
    name = "Windows PC";
  } else if (/android/i.test(ua)) {
    name = type === "phone" ? "Android Phone" : "Android Tablet";
  } else if (/linux/i.test(ua)) {
    name = "Linux";
  }

  // Add browser info
  if (/chrome|crios/i.test(ua) && !/edge|edg/i.test(ua)) {
    name += " (Chrome)";
  } else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) {
    name += " (Safari)";
  } else if (/firefox|fxios/i.test(ua)) {
    name += " (Firefox)";
  } else if (/edge|edg/i.test(ua)) {
    name += " (Edge)";
  }

  return { type, name };
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
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState<{ sessionId: string; deviceName: string } | null>(null);

  const handleDisconnectClick = (sessionId: string, deviceName: string) => {
    setConfirmDisconnect({ sessionId, deviceName });
  };

  const handleConfirmDisconnect = async () => {
    if (!confirmDisconnect) return;
    
    setDisconnecting(confirmDisconnect.sessionId);
    setConfirmDisconnect(null);
    try {
      await onDisconnect(confirmDisconnect.sessionId);
    } finally {
      setDisconnecting(null);
    }
  };

  const handleAddDevice = () => {
    onClose();
    navigate("/profile", { state: { scrollTo: "devices" } });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl">Device Limit Reached</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              You're using {activeDevices.length} of {deviceSlots} allowed device{deviceSlots !== 1 ? "s" : ""}. 
              Disconnect a device to play music here, or continue in read-only mode.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-3">
            {activeDevices.map((device) => {
              const { type, name } = parseDeviceInfo(device.deviceInfo);
              const isCurrentDevice = device.sessionId === currentSessionId;

              return (
                <div
                  key={device.sessionId}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    isCurrentDevice ? "border-primary/50 bg-primary/5" : "border-border bg-card"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${isCurrentDevice ? "bg-primary/20" : "bg-muted"}`}>
                      <DeviceIcon type={type} />
                    </div>
                    <div>
                      <div className="font-medium text-sm">
                        {name}
                        {isCurrentDevice && (
                          <span className="ml-2 text-xs text-primary">(This device)</span>
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
