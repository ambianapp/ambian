import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, UserPlus, UserMinus, RefreshCw, CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, BarChart, Bar } from "recharts";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";

type TimePeriod = "week" | "month" | "quarter" | "year" | "custom";

interface PeriodData {
  period: string;
  newUsers: number;
  churnedUsers: number;
  netGrowth: number;
  totalUsers: number;
}

interface GrowthStats {
  totalNewUsers: number;
  totalChurned: number;
  netGrowth: number;
  growthRate: number;
  churnRate: number;
}

interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

const chartConfig = {
  newUsers: {
    label: "New Users",
    color: "hsl(var(--chart-1))",
  },
  churnedUsers: {
    label: "Churned",
    color: "hsl(var(--chart-2))",
  },
  netGrowth: {
    label: "Net Growth",
    color: "hsl(var(--chart-3))",
  },
  totalUsers: {
    label: "Total Users",
    color: "hsl(var(--chart-4))",
  },
} satisfies ChartConfig;

export function GrowthChurnChart() {
  const [period, setPeriod] = useState<TimePeriod>("month");
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<PeriodData[]>([]);
  const [stats, setStats] = useState<GrowthStats | null>(null);
  const [customRange, setCustomRange] = useState<DateRange>({
    from: undefined,
    to: undefined,
  });
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  const periodConfig = useMemo(() => {
    if (period === "custom" && customRange.from && customRange.to) {
      const days = differenceInDays(customRange.to, customRange.from) + 1;
      const groupBy = days <= 31 ? "day" : days <= 90 ? "week" : "month";
      return {
        label: `${format(customRange.from, "MMM d, yyyy")} - ${format(customRange.to, "MMM d, yyyy")}`,
        days,
        groupBy,
        startDate: customRange.from,
        endDate: customRange.to,
      };
    }

    switch (period) {
      case "week":
        return {
          label: "Last 7 Days",
          days: 7,
          groupBy: "day",
          startDate: null,
          endDate: null,
        };
      case "month":
        return {
          label: "Last 30 Days",
          days: 30,
          groupBy: "day",
          startDate: null,
          endDate: null,
        };
      case "quarter":
        return {
          label: "Last 90 Days",
          days: 90,
          groupBy: "week",
          startDate: null,
          endDate: null,
        };
      case "year":
        return {
          label: "Last 12 Months",
          days: 365,
          groupBy: "month",
          startDate: null,
          endDate: null,
        };
      default:
        return {
          label: "Select date range",
          days: 0,
          groupBy: "day",
          startDate: null,
          endDate: null,
        };
    }
  }, [period, customRange]);

  const loadData = async () => {
    if (period === "custom" && (!customRange.from || !customRange.to)) {
      return;
    }

    setLoading(true);
    try {
      let startDate: Date;
      let endDate: Date;

      if (period === "custom" && customRange.from && customRange.to) {
        startDate = new Date(customRange.from);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(customRange.to);
        endDate.setHours(23, 59, 59, 999);
      } else {
        endDate = new Date();
        startDate = new Date();
        startDate.setDate(startDate.getDate() - periodConfig.days);
      }

      // Fetch profiles (new users) and subscriptions (for churn)
      const [profilesResult, subscriptionsResult, allProfilesResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("created_at")
          .gte("created_at", startDate.toISOString())
          .lte("created_at", endDate.toISOString())
          .order("created_at", { ascending: true }),
        supabase
          .from("subscriptions")
          .select("status, updated_at, created_at")
          .or(`updated_at.gte.${startDate.toISOString()},created_at.gte.${startDate.toISOString()}`),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
      ]);

      const profiles = profilesResult.data || [];
      const subscriptions = subscriptionsResult.data || [];
      const totalCurrentUsers = allProfilesResult.count || 0;

      // Group data by period
      const groupedData = groupDataByPeriodWithDates(
        profiles,
        subscriptions,
        startDate,
        endDate,
        periodConfig.groupBy as "day" | "week" | "month"
      );

      // Calculate cumulative total users
      let runningTotal = totalCurrentUsers - groupedData.reduce((sum, d) => sum + d.netGrowth, 0);
      const dataWithTotals = groupedData.map((d) => {
        runningTotal += d.netGrowth;
        return { ...d, totalUsers: Math.max(0, runningTotal) };
      });

      setChartData(dataWithTotals);

      // Calculate summary stats
      const totalNew = groupedData.reduce((sum, d) => sum + d.newUsers, 0);
      const totalChurned = groupedData.reduce((sum, d) => sum + d.churnedUsers, 0);
      const netGrowth = totalNew - totalChurned;
      const startingUsers = totalCurrentUsers - netGrowth;

      setStats({
        totalNewUsers: totalNew,
        totalChurned: totalChurned,
        netGrowth: netGrowth,
        growthRate: startingUsers > 0 ? (netGrowth / startingUsers) * 100 : 0,
        churnRate: startingUsers > 0 ? (totalChurned / startingUsers) * 100 : 0,
      });
    } catch (error) {
      console.error("Error loading growth data:", error);
      toast.error("Failed to load growth data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (period !== "custom" || (customRange.from && customRange.to)) {
      loadData();
    }
  }, [period, customRange]);

  const handlePeriodChange = (newPeriod: TimePeriod) => {
    if (newPeriod === "custom") {
      setPeriod(newPeriod);
      setIsCalendarOpen(true);
    } else {
      setPeriod(newPeriod);
      setCustomRange({ from: undefined, to: undefined });
    }
  };

  const handleDateSelect = (range: DateRange | undefined) => {
    if (range) {
      setCustomRange(range);
      if (range.from && range.to) {
        setIsCalendarOpen(false);
      }
    }
  };

  if (loading && period !== "custom") {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-60" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Period Selector */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {(["week", "month", "quarter", "year"] as TimePeriod[]).map((p) => (
            <Button
              key={p}
              variant={period === p ? "default" : "outline"}
              size="sm"
              onClick={() => handlePeriodChange(p)}
            >
              {p === "week" && "Week"}
              {p === "month" && "Month"}
              {p === "quarter" && "Quarter"}
              {p === "year" && "Year"}
            </Button>
          ))}
          
          <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                variant={period === "custom" ? "default" : "outline"}
                size="sm"
                onClick={() => handlePeriodChange("custom")}
                className={cn("min-w-[120px]", period === "custom" && customRange.from && "min-w-[200px]")}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {period === "custom" && customRange.from && customRange.to
                  ? `${format(customRange.from, "MMM d")} - ${format(customRange.to, "MMM d")}`
                  : "Custom"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-popover" align="start">
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={customRange.from}
                selected={customRange}
                onSelect={handleDateSelect}
                numberOfMonths={2}
                disabled={(date) => date > new Date()}
              />
            </PopoverContent>
          </Popover>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} disabled={period === "custom" && (!customRange.from || !customRange.to)}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-green-500" />
                <span className="text-sm text-muted-foreground">New Users</span>
              </div>
              <div className="text-2xl font-bold mt-1">{stats.totalNewUsers}</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <UserMinus className="h-4 w-4 text-red-500" />
                <span className="text-sm text-muted-foreground">Churned</span>
              </div>
              <div className="text-2xl font-bold mt-1">{stats.totalChurned}</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                {stats.netGrowth >= 0 ? (
                  <TrendingUp className="h-4 w-4 text-green-500" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-500" />
                )}
                <span className="text-sm text-muted-foreground">Net Growth</span>
              </div>
              <div className={`text-2xl font-bold mt-1 ${stats.netGrowth >= 0 ? "text-green-500" : "text-red-500"}`}>
                {stats.netGrowth >= 0 ? "+" : ""}{stats.netGrowth}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-500" />
                <span className="text-sm text-muted-foreground">Growth Rate</span>
              </div>
              <div className="text-2xl font-bold mt-1">
                {stats.growthRate >= 0 ? "+" : ""}{stats.growthRate.toFixed(1)}%
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-orange-500" />
                <span className="text-sm text-muted-foreground">Churn Rate</span>
              </div>
              <div className="text-2xl font-bold mt-1">{stats.churnRate.toFixed(1)}%</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Growth/Churn Bar Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Growth vs Churn</CardTitle>
            <CardDescription>{periodConfig.label}</CardDescription>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                No data for this period
              </div>
            ) : (
              <ChartContainer config={chartConfig} className="h-[250px] w-full">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="period"
                    tickLine={false}
                    axisLine={false}
                    className="text-xs"
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    className="text-xs"
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="newUsers" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} name="New Users" />
                  <Bar dataKey="churnedUsers" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} name="Churned" />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Total Users Area Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Total Users Over Time</CardTitle>
            <CardDescription>{periodConfig.label}</CardDescription>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                No data for this period
              </div>
            ) : (
              <ChartContainer config={chartConfig} className="h-[250px] w-full">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="totalUsersGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-4))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--chart-4))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="period"
                    tickLine={false}
                    axisLine={false}
                    className="text-xs"
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    className="text-xs"
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area
                    type="monotone"
                    dataKey="totalUsers"
                    stroke="hsl(var(--chart-4))"
                    fill="url(#totalUsersGradient)"
                    strokeWidth={2}
                    name="Total Users"
                  />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Helper functions
function getWeekNumber(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 1);
  const diff = date.getTime() - start.getTime();
  const oneWeek = 604800000;
  return Math.ceil((diff + start.getDay() * 86400000) / oneWeek);
}

function groupDataByPeriodWithDates(
  profiles: { created_at: string }[],
  subscriptions: { status: string; updated_at: string; created_at: string }[],
  startDate: Date,
  endDate: Date,
  groupBy: "day" | "week" | "month"
): PeriodData[] {
  const periods: Map<string, { newUsers: number; churnedUsers: number }> = new Map();

  // Initialize periods
  const current = new Date(startDate);
  while (current <= endDate) {
    const key = getPeriodKey(current, groupBy);
    if (!periods.has(key)) {
      periods.set(key, { newUsers: 0, churnedUsers: 0 });
    }
    if (groupBy === "day") {
      current.setDate(current.getDate() + 1);
    } else if (groupBy === "week") {
      current.setDate(current.getDate() + 7);
    } else {
      current.setMonth(current.getMonth() + 1);
    }
  }

  // Count new users
  profiles.forEach((profile) => {
    const date = new Date(profile.created_at);
    if (date >= startDate && date <= endDate) {
      const key = getPeriodKey(date, groupBy);
      const period = periods.get(key);
      if (period) {
        period.newUsers++;
      }
    }
  });

  // Count churned users (canceled subscriptions)
  subscriptions.forEach((sub) => {
    if (sub.status === "canceled" || sub.status === "expired") {
      const date = new Date(sub.updated_at);
      if (date >= startDate && date <= endDate) {
        const key = getPeriodKey(date, groupBy);
        const period = periods.get(key);
        if (period) {
          period.churnedUsers++;
        }
      }
    }
  });

  // Convert to array and calculate net growth
  return Array.from(periods.entries())
    .map(([period, data]) => ({
      period: formatPeriodLabel(period, groupBy),
      newUsers: data.newUsers,
      churnedUsers: data.churnedUsers,
      netGrowth: data.newUsers - data.churnedUsers,
      totalUsers: 0, // Will be calculated later
    }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

function getPeriodKey(date: Date, groupBy: "day" | "week" | "month"): string {
  if (groupBy === "day") {
    return date.toISOString().split("T")[0];
  } else if (groupBy === "week") {
    const year = date.getFullYear();
    const week = getWeekNumber(date);
    return `${year}-W${week.toString().padStart(2, "0")}`;
  } else {
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}`;
  }
}

function formatPeriodLabel(key: string, groupBy: "day" | "week" | "month"): string {
  if (groupBy === "day") {
    const date = new Date(key);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } else if (groupBy === "week") {
    return key.replace("-W", " W");
  } else {
    const [year, month] = key.split("-");
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  }
}
