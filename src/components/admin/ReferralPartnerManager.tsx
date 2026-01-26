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
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { Plus, Copy, Users, DollarSign, TrendingUp, RefreshCw, Link2, ChevronDown, Ticket } from "lucide-react";
import { format } from "date-fns";

interface ReferralPartner {
  id: string;
  name: string;
  email: string;
  referral_code: string;
  commission_rate: number;
  commission_duration_months: number;
  stripe_connect_account_id: string | null;
  stripe_connect_status: string;
  is_active: boolean;
  created_at: string;
}

interface ReferralSignup {
  id: string;
  partner_id: string;
  user_id: string;
  referral_code: string;
  free_months_granted: number;
  subscription_start_date: string | null;
  commission_end_date: string | null;
  created_at: string;
}

interface EnrichedReferralSignup extends ReferralSignup {
  user_email: string | null;
  user_name: string | null;
  subscription_status: string | null;
  plan_type: string | null;
  partner_name: string | null;
  total_revenue: number;
}

interface ReferralCommission {
  id: string;
  partner_id: string;
  referral_signup_id: string;
  subscription_amount: number;
  commission_amount: number;
  commission_rate: number;
  status: string;
  period_start: string;
  period_end: string;
  paid_at: string | null;
  created_at: string;
}

interface PartnerStats {
  partnerId: string;
  totalSignups: number;
  totalCommissions: number;
  pendingCommissions: number;
  paidCommissions: number;
}

interface GroupedSignups {
  [code: string]: {
    partnerName: string;
    signups: EnrichedReferralSignup[];
    totalRevenue: number;
  };
}

export function ReferralPartnerManager() {
  const [partners, setPartners] = useState<ReferralPartner[]>([]);
  const [signups, setSignups] = useState<ReferralSignup[]>([]);
  const [enrichedSignups, setEnrichedSignups] = useState<EnrichedReferralSignup[]>([]);
  const [commissions, setCommissions] = useState<ReferralCommission[]>([]);
  const [partnerStats, setPartnerStats] = useState<Map<string, PartnerStats>>(new Map());
  const [loading, setLoading] = useState(true);
  const [connectingPartnerId, setConnectingPartnerId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<ReferralPartner | null>(null);
  const [openCoupons, setOpenCoupons] = useState<Set<string>>(new Set());

  // Group signups by coupon code
  const groupedSignups = useMemo(() => {
    const groups: GroupedSignups = {};
    enrichedSignups.forEach((signup) => {
      const code = signup.referral_code;
      if (!groups[code]) {
        groups[code] = {
          partnerName: signup.partner_name || "Unknown Partner",
          signups: [],
          totalRevenue: 0,
        };
      }
      groups[code].signups.push(signup);
      groups[code].totalRevenue += signup.total_revenue;
    });
    return groups;
  }, [enrichedSignups]);

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
  
  // Form state
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formCommissionRate, setFormCommissionRate] = useState("50");
  const [formDuration, setFormDuration] = useState("12");

  useEffect(() => {
    fetchData();
    
    // Check for connect return URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const connectComplete = urlParams.get("connect_complete");
    const connectRefresh = urlParams.get("connect_refresh");
    const partnerId = urlParams.get("partner_id");
    
    if (partnerId && (connectComplete || connectRefresh)) {
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
      
      if (connectComplete) {
        // Verify the connect status
        handleVerifyConnect(partnerId);
      } else if (connectRefresh) {
        toast.info("Stripe Connect setup was not completed. Please try again.");
      }
    }
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [partnersRes, signupsRes, commissionsRes] = await Promise.all([
        supabase.from("referral_partners").select("*").order("created_at", { ascending: false }),
        supabase.from("referral_signups").select("*").order("created_at", { ascending: false }),
        supabase.from("referral_commissions").select("*").order("created_at", { ascending: false }),
      ]);

      if (partnersRes.error) throw partnersRes.error;
      if (signupsRes.error) throw signupsRes.error;
      if (commissionsRes.error) throw commissionsRes.error;

      setPartners(partnersRes.data || []);
      setSignups(signupsRes.data || []);
      setCommissions(commissionsRes.data || []);

      // Enrich signups with user and subscription data
      const enrichedData: EnrichedReferralSignup[] = await Promise.all(
        (signupsRes.data || []).map(async (signup) => {
          const partner = (partnersRes.data || []).find(p => p.id === signup.partner_id);
          
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
          
          // Calculate total revenue from commissions for this signup
          const signupCommissions = (commissionsRes.data || []).filter(
            c => c.referral_signup_id === signup.id
          );
          const totalRevenue = signupCommissions.reduce(
            (sum, c) => sum + Number(c.subscription_amount), 0
          );

          return {
            ...signup,
            user_email: profileData?.email || null,
            user_name: profileData?.full_name || null,
            subscription_status: subData?.status || null,
            plan_type: subData?.plan_type || null,
            partner_name: partner?.name || null,
            total_revenue: totalRevenue,
          };
        })
      );
      setEnrichedSignups(enrichedData);

      // Calculate stats per partner
      const stats = new Map<string, PartnerStats>();
      (partnersRes.data || []).forEach(partner => {
        const partnerSignups = (signupsRes.data || []).filter(s => s.partner_id === partner.id);
        const partnerCommissions = (commissionsRes.data || []).filter(c => c.partner_id === partner.id);
        
        stats.set(partner.id, {
          partnerId: partner.id,
          totalSignups: partnerSignups.length,
          totalCommissions: partnerCommissions.reduce((sum, c) => sum + Number(c.commission_amount), 0),
          pendingCommissions: partnerCommissions.filter(c => c.status === 'pending').reduce((sum, c) => sum + Number(c.commission_amount), 0),
          paidCommissions: partnerCommissions.filter(c => c.status === 'paid').reduce((sum, c) => sum + Number(c.commission_amount), 0),
        });
      });
      setPartnerStats(stats);
    } catch (error) {
      console.error("Error fetching referral data:", error);
      toast.error("Failed to load referral data");
    } finally {
      setLoading(false);
    }
  };

  const generateCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormCode(code);
  };

  const handleStartConnect = async (partnerId: string) => {
    setConnectingPartnerId(partnerId);
    try {
      const { data, error } = await supabase.functions.invoke("create-partner-connect-link", {
        body: { partnerId },
      });

      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank");
        toast.success("Stripe Connect onboarding opened in new tab");
      }
    } catch (error: any) {
      console.error("Error creating connect link:", error);
      toast.error(error.message || "Failed to start Stripe Connect");
    } finally {
      setConnectingPartnerId(null);
    }
  };

  const handleVerifyConnect = async (partnerId: string) => {
    setConnectingPartnerId(partnerId);
    try {
      const { data, error } = await supabase.functions.invoke("complete-partner-connect", {
        body: { partnerId },
      });

      if (error) throw error;
      
      if (data?.status === "active") {
        toast.success("Stripe Connect is now active! Partner can receive payouts.");
      } else if (data?.status === "pending_verification") {
        toast.info("Stripe is verifying the partner's account. This may take a few days.");
      } else {
        toast.info(`Connect status: ${data?.status}`);
      }
      
      fetchData();
    } catch (error: any) {
      console.error("Error verifying connect:", error);
      toast.error(error.message || "Failed to verify Stripe Connect status");
    } finally {
      setConnectingPartnerId(null);
    }
  };

  const resetForm = () => {
    setFormName("");
    setFormEmail("");
    setFormCode("");
    setFormCommissionRate("50");
    setFormDuration("12");
    setEditingPartner(null);
  };

  const openEditDialog = (partner: ReferralPartner) => {
    setEditingPartner(partner);
    setFormName(partner.name);
    setFormEmail(partner.email);
    setFormCode(partner.referral_code);
    setFormCommissionRate(partner.commission_rate.toString());
    setFormDuration(partner.commission_duration_months.toString());
    setDialogOpen(true);
  };

  const handleSavePartner = async () => {
    if (!formName || !formEmail || !formCode) {
      toast.error("Please fill in all required fields");
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
            commission_rate: parseFloat(formCommissionRate),
            commission_duration_months: parseInt(formDuration),
          })
          .eq("id", editingPartner.id);

        if (error) throw error;
        toast.success("Partner updated successfully");
      } else {
        const { error } = await supabase
          .from("referral_partners")
          .insert({
            name: formName,
            email: formEmail,
            referral_code: formCode.toUpperCase(),
            commission_rate: parseFloat(formCommissionRate),
            commission_duration_months: parseInt(formDuration),
          });

        if (error) throw error;
        toast.success("Partner created successfully");
      }

      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      console.error("Error saving partner:", error);
      toast.error(error.message || "Failed to save partner");
    }
  };

  const togglePartnerActive = async (partner: ReferralPartner) => {
    try {
      const { error } = await supabase
        .from("referral_partners")
        .update({ is_active: !partner.is_active })
        .eq("id", partner.id);

      if (error) throw error;
      toast.success(`Partner ${partner.is_active ? 'deactivated' : 'activated'}`);
      fetchData();
    } catch (error) {
      console.error("Error toggling partner:", error);
      toast.error("Failed to update partner status");
    }
  };

  const copyReferralLink = (code: string) => {
    const link = `${window.location.origin}/?ref=${code}`;
    navigator.clipboard.writeText(link);
    toast.success("Referral link copied to clipboard");
  };

  const getConnectStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-primary text-primary-foreground">Connected</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pending Setup</Badge>;
      case 'restricted':
        return <Badge variant="destructive">Restricted</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getCommissionStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-primary text-primary-foreground">Paid</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Calculate totals
  const totalPartners = partners.length;
  const activePartners = partners.filter(p => p.is_active).length;
  const totalSignupsCount = signups.length;
  const totalPendingCommissions = commissions.filter(c => c.status === 'pending').reduce((sum, c) => sum + Number(c.commission_amount), 0);
  const totalPaidCommissions = commissions.filter(c => c.status === 'paid').reduce((sum, c) => sum + Number(c.commission_amount), 0);

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
            <CardTitle className="text-sm font-medium">Total Partners</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalPartners}</div>
            <p className="text-xs text-muted-foreground">{activePartners} active</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Referrals</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSignupsCount}</div>
            <p className="text-xs text-muted-foreground">users referred</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Payouts</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">€{totalPendingCommissions.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">to be paid</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">€{totalPaidCommissions.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">all time</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="partners" className="space-y-4">
        <TabsList>
          <TabsTrigger value="partners">Partners</TabsTrigger>
          <TabsTrigger value="signups">Referral Signups</TabsTrigger>
          <TabsTrigger value="commissions">Commissions</TabsTrigger>
        </TabsList>

        <TabsContent value="partners" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium">Referral Partners</h3>
            <Dialog open={dialogOpen} onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) resetForm();
            }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Partner
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>{editingPartner ? 'Edit Partner' : 'Add New Partner'}</DialogTitle>
                  <DialogDescription>
                    {editingPartner ? 'Update partner details' : 'Create a new referral partner'}
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Name *</Label>
                    <Input
                      id="name"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="Partner Company Name"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      placeholder="partner@example.com"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="code">Referral Code *</Label>
                    <div className="flex gap-2">
                      <Input
                        id="code"
                        value={formCode}
                        onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                        placeholder="PARTNER123"
                        className="uppercase"
                      />
                      <Button type="button" variant="outline" onClick={generateCode}>
                        Generate
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="commission">Commission Rate (%)</Label>
                    <Input
                      id="commission"
                      type="number"
                      min="0"
                      max="100"
                      value={formCommissionRate}
                      onChange={(e) => setFormCommissionRate(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="duration">Commission Duration (months)</Label>
                    <Input
                      id="duration"
                      type="number"
                      min="1"
                      value={formDuration}
                      onChange={(e) => setFormDuration(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleSavePartner}>
                    {editingPartner ? 'Update' : 'Create'} Partner
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partner</TableHead>
                  <TableHead>Referral Code</TableHead>
                  <TableHead>Commission</TableHead>
                  <TableHead>Stripe Connect</TableHead>
                  <TableHead>Signups</TableHead>
                  <TableHead>Earnings</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {partners.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No partners yet. Add your first referral partner.
                    </TableCell>
                  </TableRow>
                ) : (
                  partners.map((partner) => {
                    const stats = partnerStats.get(partner.id);
                    return (
                      <TableRow key={partner.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{partner.name}</div>
                            <div className="text-sm text-muted-foreground">{partner.email}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <code className="bg-muted px-2 py-1 rounded text-sm">{partner.referral_code}</code>
                            <Button variant="ghost" size="icon" onClick={() => copyReferralLink(partner.referral_code)}>
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {partner.commission_rate}% for {partner.commission_duration_months}mo
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getConnectStatusBadge(partner.stripe_connect_status)}
                            {partner.stripe_connect_status !== 'active' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => partner.stripe_connect_account_id 
                                  ? handleVerifyConnect(partner.id) 
                                  : handleStartConnect(partner.id)
                                }
                                disabled={connectingPartnerId === partner.id}
                              >
                                {connectingPartnerId === partner.id ? (
                                  <RefreshCw className="h-3 w-3 animate-spin" />
                                ) : partner.stripe_connect_account_id ? (
                                  <>
                                    <RefreshCw className="h-3 w-3 mr-1" />
                                    Verify
                                  </>
                                ) : (
                                  <>
                                    <Link2 className="h-3 w-3 mr-1" />
                                    Connect
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{stats?.totalSignups || 0}</TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div>€{stats?.totalCommissions.toFixed(2) || '0.00'} total</div>
                            <div className="text-muted-foreground">€{stats?.pendingCommissions.toFixed(2) || '0.00'} pending</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={partner.is_active}
                            onCheckedChange={() => togglePartnerActive(partner)}
                          />
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => openEditDialog(partner)}>
                            Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="signups" className="space-y-4">
          <h3 className="text-lg font-medium">Referred Users by Coupon Code</h3>
          <Card>
            <CardContent className="p-4">
              {Object.keys(groupedSignups).length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <Ticket className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No referral signups yet. Users who sign up with a referral code will appear here.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {Object.entries(groupedSignups).map(([code, group]) => {
                    const isOpen = openCoupons.has(code);
                    const activeCount = group.signups.filter(s => s.subscription_status === 'active').length;

                    return (
                      <Collapsible
                        key={code}
                        open={isOpen}
                        onOpenChange={() => toggleCoupon(code)}
                      >
                        <CollapsibleTrigger asChild>
                          <button className="flex items-center justify-between w-full p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-left">
                            <div className="flex items-center gap-3">
                              <Ticket className="w-5 h-5 text-primary" />
                              <div>
                                <code className="font-mono font-bold text-base">{code}</code>
                                <span className="text-sm text-muted-foreground ml-3">{group.partnerName}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <div className="text-sm font-medium">
                                  {group.signups.length} {group.signups.length === 1 ? "user" : "users"}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {activeCount} active • €{group.totalRevenue.toFixed(2)} revenue
                                </div>
                              </div>
                              <ChevronDown
                                className={`w-4 h-4 text-muted-foreground transition-transform ${
                                  isOpen ? "rotate-180" : ""
                                }`}
                              />
                            </div>
                          </button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="mt-2 border rounded-lg overflow-hidden">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>User</TableHead>
                                  <TableHead>Subscription</TableHead>
                                  <TableHead>Revenue</TableHead>
                                  <TableHead>Signed Up</TableHead>
                                  <TableHead>Commission Ends</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {group.signups.map((signup) => (
                                  <TableRow key={signup.id}>
                                    <TableCell>
                                      <div>
                                        <div className="font-medium">{signup.user_name || 'Unknown'}</div>
                                        <div className="text-sm text-muted-foreground">
                                          {signup.user_email || signup.user_id.slice(0, 8) + '...'}
                                        </div>
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <div className="flex flex-col gap-1">
                                        {signup.subscription_status ? (
                                          <Badge 
                                            variant={signup.subscription_status === 'active' ? 'default' : 'secondary'}
                                            className={signup.subscription_status === 'active' ? 'bg-primary text-primary-foreground' : ''}
                                          >
                                            {signup.subscription_status}
                                          </Badge>
                                        ) : (
                                          <Badge variant="outline">No subscription</Badge>
                                        )}
                                        {signup.plan_type && (
                                          <span className="text-xs text-muted-foreground capitalize">{signup.plan_type}</span>
                                        )}
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <div className="font-medium">€{signup.total_revenue.toFixed(2)}</div>
                                    </TableCell>
                                    <TableCell>{format(new Date(signup.created_at), 'MMM d, yyyy')}</TableCell>
                                    <TableCell>
                                      {signup.commission_end_date 
                                        ? format(new Date(signup.commission_end_date), 'MMM d, yyyy')
                                        : '-'
                                      }
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="commissions" className="space-y-4">
          <h3 className="text-lg font-medium">Commission Payments</h3>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partner</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Subscription</TableHead>
                  <TableHead>Commission</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Paid At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commissions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No commissions yet. Commissions will appear here once referred users subscribe.
                    </TableCell>
                  </TableRow>
                ) : (
                  commissions.map((commission) => {
                    const partner = partners.find(p => p.id === commission.partner_id);
                    return (
                      <TableRow key={commission.id}>
                        <TableCell>{partner?.name || 'Unknown'}</TableCell>
                        <TableCell className="text-sm">
                          {format(new Date(commission.period_start), 'MMM d')} - {format(new Date(commission.period_end), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell>€{Number(commission.subscription_amount).toFixed(2)}</TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">€{Number(commission.commission_amount).toFixed(2)}</div>
                            <div className="text-xs text-muted-foreground">{commission.commission_rate}%</div>
                          </div>
                        </TableCell>
                        <TableCell>{getCommissionStatusBadge(commission.status)}</TableCell>
                        <TableCell>
                          {commission.paid_at 
                            ? format(new Date(commission.paid_at), 'MMM d, yyyy')
                            : '-'
                          }
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
