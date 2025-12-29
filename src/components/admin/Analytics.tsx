import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, Users, Music, Smartphone, Monitor, Play, TrendingUp, Calendar } from "lucide-react";
import { toast } from "sonner";
import { GrowthChurnChart } from "./GrowthChurnChart";
interface PlaylistStats {
  playlist_id: string;
  playlist_name: string;
  play_count: number;
}

interface DeviceStats {
  device_type: string;
  browser: string;
  os: string;
  count: number;
}

interface SubscriptionStats {
  status: string;
  count: number;
}

interface DailyPlayStats {
  date: string;
  count: number;
}

interface AnalyticsData {
  totalUsers: number;
  activeSubscriptions: number;
  totalPlays: number;
  topPlaylists: PlaylistStats[];
  deviceStats: DeviceStats[];
  subscriptionStats: SubscriptionStats[];
  recentActivity: DailyPlayStats[];
  activeSessions: number;
}

const parseUserAgent = (ua: string): { device: string; browser: string; os: string } => {
  let device = "Desktop";
  let browser = "Unknown";
  let os = "Unknown";

  // Detect device type
  if (/iPhone|iPad|iPod/i.test(ua)) {
    device = "iOS";
    os = "iOS";
  } else if (/Android/i.test(ua)) {
    device = "Android";
    os = "Android";
  } else if (/Windows/i.test(ua)) {
    device = "Desktop";
    os = "Windows";
  } else if (/Mac/i.test(ua)) {
    device = "Desktop";
    os = "macOS";
  } else if (/Linux/i.test(ua)) {
    device = "Desktop";
    os = "Linux";
  }

  // Detect browser
  if (/Chrome/i.test(ua) && !/Edg/i.test(ua) && !/CriOS/i.test(ua)) {
    browser = "Chrome";
  } else if (/CriOS/i.test(ua)) {
    browser = "Chrome (iOS)";
  } else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) {
    browser = "Safari";
  } else if (/Firefox/i.test(ua)) {
    browser = "Firefox";
  } else if (/Edg/i.test(ua)) {
    browser = "Edge";
  }

  return { device, browser, os };
};

export function Analytics() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalyticsData | null>(null);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      // Fetch all data in parallel
      const [
        profilesResult,
        subscriptionsResult,
        playHistoryResult,
        topPlaylistsResult,
        sessionsResult,
        recentPlaysResult,
      ] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("subscriptions").select("status"),
        supabase.from("play_history").select("id", { count: "exact", head: true }),
        supabase
          .from("play_history")
          .select(`
            playlist_id,
            playlists!inner(name)
          `),
        supabase.from("active_sessions").select("device_info, updated_at"),
        supabase
          .from("play_history")
          .select("played_at")
          .gte("played_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
          .order("played_at", { ascending: true }),
      ]);

      // Calculate total users
      const totalUsers = profilesResult.count || 0;

      // Calculate subscription stats
      const subscriptionStats: SubscriptionStats[] = [];
      const statusCounts: Record<string, number> = {};
      (subscriptionsResult.data || []).forEach((sub) => {
        statusCounts[sub.status] = (statusCounts[sub.status] || 0) + 1;
      });
      Object.entries(statusCounts).forEach(([status, count]) => {
        subscriptionStats.push({ status, count });
      });
      const activeSubscriptions = statusCounts["active"] || 0;

      // Calculate total plays
      const totalPlays = playHistoryResult.count || 0;

      // Calculate top playlists
      const playlistCounts: Record<string, { name: string; count: number }> = {};
      (topPlaylistsResult.data || []).forEach((play: any) => {
        const id = play.playlist_id;
        const name = play.playlists?.name || "Unknown";
        if (!playlistCounts[id]) {
          playlistCounts[id] = { name, count: 0 };
        }
        playlistCounts[id].count++;
      });
      const topPlaylists: PlaylistStats[] = Object.entries(playlistCounts)
        .map(([id, { name, count }]) => ({
          playlist_id: id,
          playlist_name: name,
          play_count: count,
        }))
        .sort((a, b) => b.play_count - a.play_count)
        .slice(0, 10);

      // Calculate device stats
      const deviceCounts: Record<string, DeviceStats> = {};
      const now = Date.now();
      const activeSessions = (sessionsResult.data || []).filter((session) => {
        // Consider sessions active if updated in the last 24 hours
        const updatedAt = new Date(session.updated_at).getTime();
        return now - updatedAt < 24 * 60 * 60 * 1000;
      });

      (sessionsResult.data || []).forEach((session) => {
        if (session.device_info) {
          const { device, browser, os } = parseUserAgent(session.device_info);
          const key = `${device}-${browser}-${os}`;
          if (!deviceCounts[key]) {
            deviceCounts[key] = { device_type: device, browser, os, count: 0 };
          }
          deviceCounts[key].count++;
        }
      });
      const deviceStats = Object.values(deviceCounts).sort((a, b) => b.count - a.count);

      // Calculate daily plays for last 30 days
      const dailyCounts: Record<string, number> = {};
      (recentPlaysResult.data || []).forEach((play) => {
        const date = play.played_at.split("T")[0];
        dailyCounts[date] = (dailyCounts[date] || 0) + 1;
      });
      const recentActivity = Object.entries(dailyCounts)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));

      setData({
        totalUsers,
        activeSubscriptions,
        totalPlays,
        topPlaylists,
        deviceStats,
        subscriptionStats,
        recentActivity,
        activeSessions: activeSessions.length,
      });
    } catch (error) {
      console.error("Error loading analytics:", error);
      toast.error("Failed to load analytics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Analytics</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-20" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-500/20 text-green-400 border-green-500/30";
      case "trialing":
        return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "canceled":
        return "bg-red-500/20 text-red-400 border-red-500/30";
      default:
        return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    }
  };

  const getDeviceIcon = (device: string) => {
    if (device === "iOS" || device === "Android") {
      return <Smartphone className="w-4 h-4" />;
    }
    return <Monitor className="w-4 h-4" />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Analytics</h3>
        <Button variant="outline" size="sm" onClick={loadAnalytics}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.totalUsers}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Subscriptions</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.activeSubscriptions}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Plays</CardTitle>
            <Play className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.totalPlays}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Sessions (24h)</CardTitle>
            <Monitor className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.activeSessions}</div>
          </CardContent>
        </Card>
      </div>

      {/* Growth/Churn Chart */}
      <GrowthChurnChart />

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Playlists */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Music className="w-5 h-5" />
              Top Playlists
            </CardTitle>
            <CardDescription>Most played playlists</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.topPlaylists.length === 0 ? (
                <p className="text-muted-foreground text-sm">No play data yet</p>
              ) : (
                data.topPlaylists.map((playlist, index) => (
                  <div key={playlist.playlist_id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-muted-foreground w-5">
                        {index + 1}.
                      </span>
                      <span className="font-medium">{playlist.playlist_name}</span>
                    </div>
                    <Badge variant="secondary">{playlist.play_count} plays</Badge>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Device Stats */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="w-5 h-5" />
              Devices & Browsers
            </CardTitle>
            <CardDescription>User device breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.deviceStats.length === 0 ? (
                <p className="text-muted-foreground text-sm">No device data yet</p>
              ) : (
                data.deviceStats.slice(0, 8).map((device, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getDeviceIcon(device.device_type)}
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">{device.browser}</span>
                        <span className="text-xs text-muted-foreground">{device.os}</span>
                      </div>
                    </div>
                    <Badge variant="outline">{device.count} sessions</Badge>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Subscription Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Subscription Status
            </CardTitle>
            <CardDescription>Breakdown by status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.subscriptionStats.length === 0 ? (
                <p className="text-muted-foreground text-sm">No subscriptions yet</p>
              ) : (
                data.subscriptionStats.map((stat) => (
                  <div key={stat.status} className="flex items-center justify-between">
                    <Badge className={getStatusColor(stat.status)}>
                      {stat.status.charAt(0).toUpperCase() + stat.status.slice(1)}
                    </Badge>
                    <span className="font-medium">{stat.count} users</span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Recent Activity (30 days)
            </CardTitle>
            <CardDescription>Daily play counts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.recentActivity.length === 0 ? (
                <p className="text-muted-foreground text-sm">No recent activity</p>
              ) : (
                <div className="space-y-1">
                  {data.recentActivity.slice(-10).map((day) => (
                    <div key={day.date} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {new Date(day.date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2 bg-primary rounded"
                          style={{
                            width: `${Math.min(100, (day.count / Math.max(...data.recentActivity.map((d) => d.count))) * 100)}px`,
                          }}
                        />
                        <span className="font-medium w-8 text-right">{day.count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
