import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, RefreshCw, Search, XCircle, Clock, User, AlertCircle, LogIn, CreditCard, Play, Settings } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import type { Json } from "@/integrations/supabase/types";

interface ActivityLog {
  id: string;
  user_id: string | null;
  user_email: string | null;
  event_type: string;
  event_message: string | null;
  event_details: Json;
  created_at: string;
}

type EventTypeFilter = "all" | "auth" | "subscription" | "playback" | "error" | "admin";

const EVENT_TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  login: { icon: LogIn, color: "bg-green-500/20 text-green-400 border-green-500/30", label: "Login" },
  logout: { icon: LogIn, color: "bg-gray-500/20 text-gray-400 border-gray-500/30", label: "Logout" },
  signup: { icon: User, color: "bg-blue-500/20 text-blue-400 border-blue-500/30", label: "Signup" },
  subscription_created: { icon: CreditCard, color: "bg-purple-500/20 text-purple-400 border-purple-500/30", label: "Subscription Created" },
  subscription_canceled: { icon: CreditCard, color: "bg-orange-500/20 text-orange-400 border-orange-500/30", label: "Subscription Canceled" },
  subscription_renewed: { icon: CreditCard, color: "bg-green-500/20 text-green-400 border-green-500/30", label: "Subscription Renewed" },
  payment_failed: { icon: AlertCircle, color: "bg-red-500/20 text-red-400 border-red-500/30", label: "Payment Failed" },
  playback_started: { icon: Play, color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30", label: "Playback Started" },
  device_registered: { icon: Settings, color: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30", label: "Device Registered" },
  device_limit_reached: { icon: AlertCircle, color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", label: "Device Limit" },
  error: { icon: AlertCircle, color: "bg-red-500/20 text-red-400 border-red-500/30", label: "Error" },
};

export function ActivityLogs() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState<EventTypeFilter>("all");
  const [limit, setLimit] = useState(100);

  const loadLogs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("activity_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (searchQuery) {
        query = query.or(`user_email.ilike.%${searchQuery}%,event_message.ilike.%${searchQuery}%`);
      }

      if (eventTypeFilter !== "all") {
        const eventTypes: Record<EventTypeFilter, string[]> = {
          all: [],
          auth: ["login", "logout", "signup"],
          subscription: ["subscription_created", "subscription_canceled", "subscription_renewed", "payment_failed"],
          playback: ["playback_started"],
          error: ["error", "payment_failed", "device_limit_reached"],
          admin: ["user_deleted", "subscription_canceled_by_admin"],
        };
        query = query.in("event_type", eventTypes[eventTypeFilter]);
      }

      const { data, error } = await query;

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error("Error loading logs:", error);
      toast.error("Failed to load activity logs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [searchQuery, eventTypeFilter, limit]);

  const getEventBadge = (eventType: string) => {
    const config = EVENT_TYPE_CONFIG[eventType] || { 
      icon: Clock, 
      color: "bg-muted text-muted-foreground", 
      label: eventType.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()) 
    };
    const Icon = config.icon;

    return (
      <Badge className={`${config.color} flex items-center gap-1`}>
        <Icon className="w-3 h-3" />
        {config.label}
      </Badge>
    );
  };

  const formatTimestamp = (timestamp: string) => {
    return format(new Date(timestamp), "MMM d, yyyy HH:mm:ss");
  };

  const clearFilters = () => {
    setSearchQuery("");
    setEventTypeFilter("all");
  };

  const hasActiveFilters = searchQuery || eventTypeFilter !== "all";

  if (loading && logs.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Activity Logs ({logs.length})</h3>
        <Button variant="outline" size="sm" onClick={loadLogs} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by email or message..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={eventTypeFilter} onValueChange={(v) => setEventTypeFilter(v as EventTypeFilter)}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Event Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Events</SelectItem>
            <SelectItem value="auth">Authentication</SelectItem>
            <SelectItem value="subscription">Subscription</SelectItem>
            <SelectItem value="playback">Playback</SelectItem>
            <SelectItem value="error">Errors</SelectItem>
            <SelectItem value="admin">Admin Actions</SelectItem>
          </SelectContent>
        </Select>
        <Select value={limit.toString()} onValueChange={(v) => setLimit(parseInt(v))}>
          <SelectTrigger className="w-full sm:w-[120px]">
            <SelectValue placeholder="Limit" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="50">Last 50</SelectItem>
            <SelectItem value="100">Last 100</SelectItem>
            <SelectItem value="250">Last 250</SelectItem>
            <SelectItem value="500">Last 500</SelectItem>
          </SelectContent>
        </Select>
        {hasActiveFilters && (
          <Button variant="ghost" size="icon" onClick={clearFilters} title="Clear filters">
            <XCircle className="w-4 h-4" />
          </Button>
        )}
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[180px]">Timestamp</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Message</TableHead>
              <TableHead className="w-[200px]">Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No activity logs found
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-muted-foreground text-sm font-mono">
                    {formatTimestamp(log.created_at)}
                  </TableCell>
                  <TableCell>{getEventBadge(log.event_type)}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-sm">{log.user_email || "—"}</span>
                      {log.user_id && (
                        <span className="text-xs text-muted-foreground font-mono">
                          {log.user_id.slice(0, 8)}...
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[300px] truncate">
                    {log.event_message || "—"}
                  </TableCell>
                  <TableCell>
                    {Object.keys(log.event_details || {}).length > 0 ? (
                      <pre className="text-xs bg-muted/50 p-1 rounded max-w-[180px] overflow-auto max-h-[60px]">
                        {JSON.stringify(log.event_details, null, 1)}
                      </pre>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
