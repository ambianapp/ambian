import { useState, useEffect } from "react";
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
import { toast } from "sonner";
import { Plus, Copy, ExternalLink, Users, DollarSign, TrendingUp, RefreshCw } from "lucide-react";
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

export function ReferralPartnerManager() {
  const [partners, setPartners] = useState<ReferralPartner[]>([]);
  const [signups, setSignups] = useState<ReferralSignup[]>([]);
  const [commissions, setCommissions] = useState<ReferralCommission[]>([]);
  const [partnerStats, setPartnerStats] = useState<Map<string, PartnerStats>>(new Map());
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<ReferralPartner | null>(null);
  
  // Form state
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formCommissionRate, setFormCommissionRate] = useState("50");
  const [formDuration, setFormDuration] = useState("12");

  useEffect(() => {
    fetchData();
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
                        <TableCell>{getConnectStatusBadge(partner.stripe_connect_status)}</TableCell>
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
          <h3 className="text-lg font-medium">Referral Signups</h3>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User ID</TableHead>
                  <TableHead>Referral Code</TableHead>
                  <TableHead>Free Months</TableHead>
                  <TableHead>Subscription Started</TableHead>
                  <TableHead>Commission Ends</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {signups.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No referral signups yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  signups.map((signup) => (
                    <TableRow key={signup.id}>
                      <TableCell className="font-mono text-sm">{signup.user_id.slice(0, 8)}...</TableCell>
                      <TableCell>
                        <code className="bg-muted px-2 py-1 rounded text-sm">{signup.referral_code}</code>
                      </TableCell>
                      <TableCell>{signup.free_months_granted}</TableCell>
                      <TableCell>
                        {signup.subscription_start_date 
                          ? format(new Date(signup.subscription_start_date), 'MMM d, yyyy')
                          : '-'
                        }
                      </TableCell>
                      <TableCell>
                        {signup.commission_end_date 
                          ? format(new Date(signup.commission_end_date), 'MMM d, yyyy')
                          : '-'
                        }
                      </TableCell>
                      <TableCell>{format(new Date(signup.created_at), 'MMM d, yyyy')}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
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
