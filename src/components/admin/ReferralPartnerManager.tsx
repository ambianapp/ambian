import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { Plus, Copy, Users, DollarSign, TrendingUp, RefreshCw, ChevronDown, Ticket } from "lucide-react";
import { format } from "date-fns";

interface ReferralPartner {
  id: string;
  name: string;
  email: string;
  referral_code: string;
  commission_rate: number;
  commission_duration_months: number;
  is_active: boolean;
  created_at: string;
}

interface EnrichedReferralSignup {
  id: string;
  partner_id: string;
  user_id: string;
  referral_code: string;
  created_at: string;
  subscription_start_date: string | null;
  commission_end_date: string | null;
  free_months_granted: number;
  user_email: string | null;
  user_name: string | null;
  subscription_status: string | null;
  plan_type: string | null;
  monthly_amount: number;
  is_yearly: boolean;
  daysRemaining: number | null;
  isExpired: boolean;
}

interface CouponGroup {
  code: string;
  partnerName: string;
  partnerEmail: string;
  isActive: boolean;
  commissionRate: number;
  commissionDurationMonths: number;
  signups: EnrichedReferralSignup[];
  monthlyRevenue: number;
  yearlyRevenue: number;
  totalRevenue: number;
  activeUsers: number;
  activeCommissionUsers: number;
}

export function ReferralPartnerManager() {
  const [partners, setPartners] = useState<ReferralPartner[]>([]);
  const [couponGroups, setCouponGroups] = useState<CouponGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<ReferralPartner | null>(null);
  const [openCoupons, setOpenCoupons] = useState<Set<string>>(new Set());

  // Form state
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formCommissionRate, setFormCommissionRate] = useState(50);
  const [formCommissionMonths, setFormCommissionMonths] = useState(12);
  const [formFreeMonths, setFormFreeMonths] = useState(2);

  const toggleCoupon = (code: string) => {
    setOpenCoupons((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch partners and signups
      const [partnersRes, signupsRes] = await Promise.all([
        supabase.from("referral_partners").select("*").order("created_at", { ascending: false }),
        supabase.from("referral_signups").select("*").order("created_at", { ascending: false }),
      ]);

      if (partnersRes.error) throw partnersRes.error;
      if (signupsRes.error) throw signupsRes.error;

      const partnersData = partnersRes.data || [];
      setPartners(partnersData);

      // Enrich signups with user and subscription data
      const enrichedSignups: EnrichedReferralSignup[] = await Promise.all(
        (signupsRes.data || []).map(async (signup) => {
          // Fetch user profile
          const { data: profileData } = await supabase
            .from("profiles")
            .select("email, full_name")
            .eq("user_id", signup.user_id)
            .maybeSingle();

          // Fetch subscription
          const { data: subData } = await supabase
            .from("subscriptions")
            .select("status, plan_type")
            .eq("user_id", signup.user_id)
            .maybeSingle();

          // Determine monthly amount based on plan type and status
          let monthlyAmount = 0;
          const isActive = subData?.status === "active";
          const isYearly = subData?.plan_type === "yearly";
          
          if (isActive) {
            // Monthly: €34.90, Yearly: €349/12 = €29.08/month
            monthlyAmount = isYearly ? 349 / 12 : 34.90;
          }

          // Calculate days remaining in commission period
          let daysRemaining: number | null = null;
          let isExpired = false;
          if (signup.commission_end_date) {
            const endDate = new Date(signup.commission_end_date);
            const now = new Date();
            const diffTime = endDate.getTime() - now.getTime();
            daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            isExpired = daysRemaining <= 0;
          }

          return {
            id: signup.id,
            partner_id: signup.partner_id,
            user_id: signup.user_id,
            referral_code: signup.referral_code,
            created_at: signup.created_at,
            subscription_start_date: signup.subscription_start_date,
            commission_end_date: signup.commission_end_date,
            free_months_granted: signup.free_months_granted,
            user_email: profileData?.email || null,
            user_name: profileData?.full_name || null,
            subscription_status: subData?.status || null,
            plan_type: subData?.plan_type || null,
            monthly_amount: monthlyAmount,
            is_yearly: isYearly,
            daysRemaining,
            isExpired,
          };
        })
      );

      // Group by coupon code
      const groupMap = new Map<string, CouponGroup>();
      
      partnersData.forEach((partner) => {
        groupMap.set(partner.referral_code, {
          code: partner.referral_code,
          partnerName: partner.name,
          partnerEmail: partner.email,
          isActive: partner.is_active,
          commissionRate: partner.commission_rate,
          commissionDurationMonths: partner.commission_duration_months,
          signups: [],
          monthlyRevenue: 0,
          yearlyRevenue: 0,
          totalRevenue: 0,
          activeUsers: 0,
          activeCommissionUsers: 0,
        });
      });

      enrichedSignups.forEach((signup) => {
        const group = groupMap.get(signup.referral_code);
        if (group) {
          group.signups.push(signup);
          if (signup.subscription_status === "active") {
            group.activeUsers++;
            // Only count revenue if commission is still active
            if (!signup.isExpired) {
              group.activeCommissionUsers++;
            }
            if (signup.is_yearly) {
              group.yearlyRevenue += 349;
            } else {
              group.monthlyRevenue += 34.90;
            }
          }
        }
      });

      // Calculate total revenue
      groupMap.forEach((group) => {
        group.totalRevenue = group.monthlyRevenue + group.yearlyRevenue;
      });

      // Convert to array and sort by active users (most first)
      const groups = Array.from(groupMap.values())
        .filter(g => g.isActive || g.signups.length > 0)
        .sort((a, b) => b.activeUsers - a.activeUsers);

      setCouponGroups(groups);
    } catch (error) {
      console.error("Error fetching referral data:", error);
      toast.error("Failed to load referral data");
    } finally {
      setLoading(false);
    }
  };

  const generateCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormCode(code);
  };

  const resetForm = () => {
    setFormName("");
    setFormEmail("");
    setFormCode("");
    setFormCommissionRate(50);
    setFormCommissionMonths(12);
    setFormFreeMonths(2);
    setEditingPartner(null);
  };

  const openEditDialog = (partner: ReferralPartner) => {
    setEditingPartner(partner);
    setFormName(partner.name);
    setFormEmail(partner.email);
    setFormCode(partner.referral_code);
    setFormCommissionRate(partner.commission_rate);
    setFormCommissionMonths(partner.commission_duration_months);
    setDialogOpen(true);
  };

  const handleSavePartner = async () => {
    if (!formName || !formCode) {
      toast.error("Please fill in name and code");
      return;
    }

    try {
      if (editingPartner) {
        const { error } = await supabase
          .from("referral_partners")
          .update({
            name: formName,
            email: formEmail,
            referral_code: formCode.toUpperCase(),
            commission_rate: formCommissionRate,
            commission_duration_months: formCommissionMonths,
          })
          .eq("id", editingPartner.id);

        if (error) throw error;
        toast.success("Coupon updated");
      } else {
        const { error } = await supabase
          .from("referral_partners")
          .insert({
            name: formName,
            email: formEmail || "",
            referral_code: formCode.toUpperCase(),
            commission_rate: formCommissionRate,
            commission_duration_months: formCommissionMonths,
          });

        if (error) throw error;
        toast.success("Coupon created");
      }

      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      console.error("Error saving partner:", error);
      toast.error(error.message || "Failed to save coupon");
    }
  };

  const toggleCouponActive = async (code: string, currentlyActive: boolean) => {
    const partner = partners.find((p) => p.referral_code === code);
    if (!partner) return;

    try {
      const { error } = await supabase
        .from("referral_partners")
        .update({ is_active: !currentlyActive })
        .eq("id", partner.id);

      if (error) throw error;
      toast.success(`Coupon ${currentlyActive ? "deactivated" : "activated"}`);
      fetchData();
    } catch (error) {
      console.error("Error toggling coupon:", error);
      toast.error("Failed to update coupon status");
    }
  };

  const copyReferralLink = (code: string) => {
    const link = `${window.location.origin}/?ref=${code}`;
    navigator.clipboard.writeText(link);
    toast.success("Referral link copied");
  };

  // Calculate totals
  const totalCoupons = couponGroups.filter((g) => g.isActive).length;
  const totalUsers = couponGroups.reduce((sum, g) => sum + g.signups.length, 0);
  const totalActiveUsers = couponGroups.reduce((sum, g) => sum + g.activeUsers, 0);
  const totalMonthlyRevenue = couponGroups.reduce((sum, g) => sum + g.monthlyRevenue, 0);
  const totalYearlyRevenue = couponGroups.reduce((sum, g) => sum + g.yearlyRevenue, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Coupons</CardTitle>
            <Ticket className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCoupons}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Referred Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalUsers}</div>
            <p className="text-xs text-muted-foreground">{totalActiveUsers} paying</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">€{totalMonthlyRevenue.toFixed(0)}</div>
            <p className="text-xs text-muted-foreground">recurring/mo</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Yearly Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">€{totalYearlyRevenue.toFixed(0)}</div>
            <p className="text-xs text-muted-foreground">prepaid yearly</p>
          </CardContent>
        </Card>
      </div>

      {/* Header with Add button */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Coupon Codes</h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Coupon
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[400px]">
              <DialogHeader>
                <DialogTitle>{editingPartner ? "Edit Coupon" : "Add New Coupon"}</DialogTitle>
                <DialogDescription>
                  Create a referral code for a partner company
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Partner Name *</Label>
                  <Input
                    id="name"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g., Timma"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email">Contact Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="partner@example.com"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="code">Coupon Code *</Label>
                  <div className="flex gap-2">
                    <Input
                      id="code"
                      value={formCode}
                      onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                      placeholder="TIMMA"
                      className="uppercase"
                    />
                    <Button type="button" variant="outline" onClick={generateCode}>
                      Generate
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="commission">Commission %</Label>
                    <Input
                      id="commission"
                      type="number"
                      min="0"
                      max="100"
                      value={formCommissionRate}
                      onChange={(e) => setFormCommissionRate(Number(e.target.value))}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="duration">Duration (months)</Label>
                    <Input
                      id="duration"
                      type="number"
                      min="1"
                      max="36"
                      value={formCommissionMonths}
                      onChange={(e) => setFormCommissionMonths(Number(e.target.value))}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Partner earns {formCommissionRate}% commission for {formCommissionMonths} months from each user's subscription start.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSavePartner}>
                  {editingPartner ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Coupon List */}
      <Card>
        <CardContent className="p-4">
          {couponGroups.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <Ticket className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No coupons yet. Add your first coupon code.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {couponGroups.map((group) => {
                const isOpen = openCoupons.has(group.code);

                return (
                  <Collapsible key={group.code} open={isOpen} onOpenChange={() => toggleCoupon(group.code)}>
                    <div className="flex items-center gap-2">
                      <CollapsibleTrigger asChild>
                        <button className="flex-1 flex items-center justify-between p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-left">
                          <div className="flex items-center gap-3">
                            <Ticket className="w-5 h-5 text-primary" />
                            <div>
                              <code className="font-mono font-bold text-base">{group.code}</code>
                              <span className="text-sm text-muted-foreground ml-3">{group.partnerName}</span>
                              {!group.isActive && (
                                <Badge variant="outline" className="ml-2 text-xs">Inactive</Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-6">
                            <div className="text-right">
                              <div className="text-sm font-medium">
                                {group.signups.length} users • {group.activeUsers} paying • {group.activeCommissionUsers} in period
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {group.commissionRate}% for {group.commissionDurationMonths}mo • €{group.monthlyRevenue.toFixed(0)}/mo + €{group.yearlyRevenue.toFixed(0)}/yr
                              </div>
                            </div>
                            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                          </div>
                        </button>
                      </CollapsibleTrigger>
                      <div className="flex items-center gap-2 pr-2">
                        <Button variant="ghost" size="icon" onClick={() => copyReferralLink(group.code)} title="Copy link">
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Switch
                          checked={group.isActive}
                          onCheckedChange={() => toggleCouponActive(group.code, group.isActive)}
                          title={group.isActive ? "Deactivate" : "Activate"}
                        />
                      </div>
                    </div>
                    <CollapsibleContent>
                      <div className="mt-2 border rounded-lg overflow-hidden">
                        {group.signups.length === 0 ? (
                          <div className="p-4 text-center text-muted-foreground text-sm">
                            No users have signed up with this code yet
                          </div>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>User</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Plan</TableHead>
                                <TableHead>Monthly Value</TableHead>
                                <TableHead>Commission Period</TableHead>
                                <TableHead>Signed Up</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {group.signups.map((signup) => (
                                <TableRow key={signup.id} className={signup.isExpired ? "opacity-50" : ""}>
                                  <TableCell>
                                    <div>
                                      <div className="font-medium">{signup.user_name || "Unknown"}</div>
                                      <div className="text-sm text-muted-foreground">
                                        {signup.user_email || signup.user_id.slice(0, 8) + "..."}
                                      </div>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    {signup.subscription_status === "active" ? (
                                      <Badge className="bg-primary/20 text-primary border-primary/30">Active</Badge>
                                    ) : signup.subscription_status === "trialing" ? (
                                      <Badge className="bg-accent/20 text-accent-foreground border-accent/30">Trial</Badge>
                                    ) : (
                                      <Badge variant="outline">{signup.subscription_status || "None"}</Badge>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <span className="text-sm capitalize">{signup.plan_type || "—"}</span>
                                  </TableCell>
                                  <TableCell>
                                    {signup.monthly_amount > 0 ? (
                                      <span className="font-medium">€{signup.monthly_amount.toFixed(2)}</span>
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {signup.commission_end_date ? (
                                      signup.isExpired ? (
                                        <Badge variant="outline" className="text-muted-foreground">Expired</Badge>
                                      ) : (
                                        <div className="text-sm">
                                          <span className="font-medium text-primary">{signup.daysRemaining}d</span>
                                          <span className="text-muted-foreground ml-1">left</span>
                                        </div>
                                      )
                                    ) : signup.subscription_start_date ? (
                                      <span className="text-xs text-muted-foreground">
                                        Ends {format(new Date(new Date(signup.subscription_start_date).getTime() + group.commissionDurationMonths * 30 * 24 * 60 * 60 * 1000), "MMM yyyy")}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground text-sm">Not started</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-muted-foreground">
                                    {format(new Date(signup.created_at), "MMM d, yyyy")}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
