import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { X, Bell } from "lucide-react";
import { cn } from "@/lib/utils";

interface Notification {
  id: string;
  message: string;
  created_at: string;
}

export const AdminNotificationBanner = () => {
  const { user } = useAuth();
  const [notification, setNotification] = useState<Notification | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;

    // Subscribe to realtime notifications
    const channel = supabase
      .channel("admin-notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "admin_notifications",
        },
        (payload) => {
          const newNotification = payload.new as Notification;
          if (!dismissedIds.has(newNotification.id)) {
            setNotification(newNotification);
            setIsVisible(true);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, dismissedIds]);

  const handleDismiss = () => {
    if (notification) {
      setDismissedIds((prev) => new Set(prev).add(notification.id));
    }
    setIsVisible(false);
    // Clear notification after animation
    setTimeout(() => setNotification(null), 300);
  };

  if (!notification || !isVisible) return null;

  return (
    <div
      className={cn(
        "fixed top-0 left-0 right-0 z-[99] bg-primary text-primary-foreground py-3 px-4 flex items-center justify-center gap-3 transition-all duration-300",
        isVisible ? "animate-fade-in" : "opacity-0 -translate-y-full"
      )}
    >
      <Bell className="w-4 h-4 flex-shrink-0" />
      <span className="text-sm font-medium text-center flex-1">
        {notification.message}
      </span>
      <button
        onClick={handleDismiss}
        className="p-1 hover:bg-primary-foreground/20 rounded-full transition-colors flex-shrink-0"
        aria-label="Dismiss notification"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
