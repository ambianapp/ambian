import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { X, Bell } from "lucide-react";
import { cn } from "@/lib/utils";

interface Notification {
  id: string;
  message: string;
  created_at: string;
}

const DISMISSED_KEY = "ambian_dismissed_notifications";
const NOTIFICATION_MAX_AGE_HOURS = 24;

const getDismissedIds = (): Set<string> => {
  try {
    const stored = localStorage.getItem(DISMISSED_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
};

const saveDismissedId = (id: string) => {
  try {
    const dismissed = getDismissedIds();
    dismissed.add(id);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissed]));
  } catch {
    // Ignore localStorage errors
  }
};

export const AdminNotificationBanner = () => {
  const { user } = useAuth();
  const [notification, setNotification] = useState<Notification | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(getDismissedIds);

  const showNotification = useCallback((notif: Notification) => {
    if (!dismissedIds.has(notif.id)) {
      setNotification(notif);
      setIsVisible(true);
    }
  }, [dismissedIds]);

  useEffect(() => {
    if (!user) return;

    // Fetch recent notifications on login (last 24 hours)
    const fetchRecent = async () => {
      const cutoff = new Date();
      cutoff.setHours(cutoff.getHours() - NOTIFICATION_MAX_AGE_HOURS);
      
      const { data } = await supabase
        .from("admin_notifications")
        .select("*")
        .gte("created_at", cutoff.toISOString())
        .order("created_at", { ascending: false })
        .limit(1);

      if (data?.[0]) {
        showNotification(data[0] as Notification);
      }
    };

    fetchRecent();

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
          showNotification(payload.new as Notification);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, showNotification]);

  const handleDismiss = () => {
    if (notification) {
      saveDismissedId(notification.id);
      setDismissedIds((prev) => new Set(prev).add(notification.id));
    }
    setIsVisible(false);
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
