import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trash2, Loader2, RefreshCw, Crown, User, Search, XCircle, CreditCard, Eye, Building, MapPin, Phone, Mail, Calendar, Receipt, Download, ExternalLink, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface UserProfile {
  id: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
}

interface Subscription {
  user_id: string;
  status: string;
  plan_type: string | null;
  current_period_end: string | null;
  stripe_subscription_id: string | null;
}

interface UserRole {
  user_id: string;
  role: "admin" | "user";
}

interface UserWithDetails extends UserProfile {
  subscription?: Subscription;
  role?: "admin" | "user";
}

interface StripeCustomer {
  id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  address: {
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
    country: string | null;
  } | null;
  metadata: Record<string, string>;
  created: number;
  currency: string | null;
  balance: number;
  delinquent: boolean;
  subscriptions: Array<{
    id: string;
    status: string;
    current_period_start: number;
    current_period_end: number;
    cancel_at_period_end: boolean;
    items: Array<{
      price_id: string;
      product_id: string;
      amount: number;
      currency: string;
      interval: string;
    }>;
  }>;
  invoices: Array<{
    id: string;
    number: string;
    status: string;
    amount_due: number;
    amount_paid: number;
    currency: string;
    created: number;
    hosted_invoice_url: string;
    invoice_pdf: string | null;
    description: string | null;
    period_start: number;
    period_end: number;
  }>;
  paymentMethods: Array<{
    id: string;
    brand: string;
    last4: string;
    exp_month: number;
    exp_year: number;
  }>;
}

type FilterStatus = "all" | "active" | "trialing" | "canceled" | "inactive" | "none";
type FilterRole = "all" | "admin" | "user";

export function UserManager() {
  const [users, setUsers] = useState<UserWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [cancelingUserId, setCancelingUserId] = useState<string | null>(null);
  
  // Customer detail modal
  const [selectedUser, setSelectedUser] = useState<UserWithDetails | null>(null);
  const [customerData, setCustomerData] = useState<StripeCustomer | null>(null);
  const [loadingCustomer, setLoadingCustomer] = useState(false);
  
  // Search and filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [roleFilter, setRoleFilter] = useState<FilterRole>("all");

  const loadUsers = async () => {
    setLoading(true);
    try {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;

      const { data: subscriptions, error: subsError } = await supabase
        .from("subscriptions")
        .select("*");

      if (subsError) throw subsError;

      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("*");

      if (rolesError) throw rolesError;

      const usersWithDetails: UserWithDetails[] = (profiles || []).map((profile) => {
        const subscription = subscriptions?.find((s) => s.user_id === profile.user_id);
        const userRole = roles?.find((r) => r.user_id === profile.user_id);
        return {
          ...profile,
          subscription,
          role: userRole?.role || "user",
        };
      });

      setUsers(usersWithDetails);
    } catch (error) {
      console.error("Error loading users:", error);
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const loadCustomerDetails = async (email: string) => {
    setLoadingCustomer(true);
    setCustomerData(null);
    try {
      const { data, error } = await supabase.functions.invoke("get-stripe-customer", {
        body: { email },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setCustomerData(data.customer);
    } catch (error: any) {
      console.error("Error loading customer:", error);
      toast.error(error.message || "Failed to load customer details");
    } finally {
      setLoadingCustomer(false);
    }
  };

  const handleViewCustomer = (user: UserWithDetails) => {
    setSelectedUser(user);
    if (user.email) {
      loadCustomerDetails(user.email);
    }
  };

  const sanitizeSearchQuery = (q: string): string => {
    return q.slice(0, 100);
  };

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const searchLower = sanitizeSearchQuery(searchQuery).toLowerCase();
      const matchesSearch = !searchQuery || 
        user.email?.toLowerCase().includes(searchLower) ||
        user.full_name?.toLowerCase().includes(searchLower);

      let matchesStatus = true;
      if (statusFilter !== "all") {
        if (statusFilter === "none") {
          matchesStatus = !user.subscription;
        } else {
          matchesStatus = user.subscription?.status === statusFilter;
        }
      }

      const matchesRole = roleFilter === "all" || user.role === roleFilter;

      return matchesSearch && matchesStatus && matchesRole;
    });
  }, [users, searchQuery, statusFilter, roleFilter]);

  const handleDeleteUser = async (userId: string) => {
    setDeletingUserId(userId);
    try {
      const { data, error } = await supabase.functions.invoke("delete-user", {
        body: { userId },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("User deleted successfully");
      loadUsers();
    } catch (error: any) {
      console.error("Error deleting user:", error);
      toast.error(error.message || "Failed to delete user");
    } finally {
      setDeletingUserId(null);
    }
  };

  const handleCancelSubscription = async (userId: string, stripeSubscriptionId: string) => {
    setCancelingUserId(userId);
    try {
      const { data, error } = await supabase.functions.invoke("cancel-user-subscription", {
        body: { userId, stripeSubscriptionId },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("Subscription canceled successfully");
      loadUsers();
    } catch (error: any) {
      console.error("Error canceling subscription:", error);
      toast.error(error.message || "Failed to cancel subscription");
    } finally {
      setCancelingUserId(null);
    }
  };

  const getSubscriptionBadge = (subscription?: Subscription) => {
    if (!subscription) {
      return <Badge variant="outline">No subscription</Badge>;
    }
    
    const statusColors: Record<string, string> = {
      active: "bg-green-500/20 text-green-400 border-green-500/30",
      trialing: "bg-blue-500/20 text-blue-400 border-blue-500/30",
      canceled: "bg-red-500/20 text-red-400 border-red-500/30",
      inactive: "bg-gray-500/20 text-gray-400 border-gray-500/30",
    };

    return (
      <Badge className={statusColors[subscription.status] || statusColors.inactive}>
        {subscription.status} {subscription.plan_type && `(${subscription.plan_type})`}
      </Badge>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const isNewUser = (createdAt: string) => {
    const userDate = new Date(createdAt);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return userDate > sevenDaysAgo;
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  };

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setRoleFilter("all");
  };

  const hasActiveFilters = searchQuery || statusFilter !== "all" || roleFilter !== "all";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Users ({filteredUsers.length} of {users.length})</h3>
        <Button variant="outline" size="sm" onClick={loadUsers}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by email or name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as FilterStatus)}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="trialing">Trialing</SelectItem>
            <SelectItem value="canceled">Canceled</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="none">No Subscription</SelectItem>
          </SelectContent>
        </Select>
        <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as FilterRole)}>
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="user">User</SelectItem>
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
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Subscription</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="w-[150px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{user.full_name || "No name"}</span>
                      {isNewUser(user.created_at) && (
                        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">
                          <Sparkles className="w-3 h-3 mr-1" />
                          New
                        </Badge>
                      )}
                    </div>
                    <span className="text-sm text-muted-foreground">{user.email || "No email"}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {user.role === "admin" ? (
                      <Badge className="bg-primary/20 text-primary border-primary/30">
                        <Crown className="w-3 h-3 mr-1" />
                        Admin
                      </Badge>
                    ) : (
                      <Badge variant="outline">
                        <User className="w-3 h-3 mr-1" />
                        User
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>{getSubscriptionBadge(user.subscription)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(user.created_at)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {/* View Customer Details */}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleViewCustomer(user)}
                      title="View Stripe customer details"
                    >
                      <Eye className="w-4 h-4" />
                    </Button>

                    {/* Cancel Subscription Button */}
                    {user.subscription?.status === "active" && user.subscription?.stripe_subscription_id && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-orange-500 hover:text-orange-500 hover:bg-orange-500/10"
                            disabled={cancelingUserId === user.user_id}
                            title="Cancel subscription"
                          >
                            {cancelingUserId === user.user_id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <CreditCard className="w-4 h-4" />
                            )}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Cancel Subscription</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to cancel the subscription for{" "}
                              <span className="font-semibold">{user.email || user.full_name}</span>?
                              This will immediately revoke their access to premium features.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Keep Subscription</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleCancelSubscription(user.user_id, user.subscription!.stripe_subscription_id!)}
                              className="bg-orange-500 text-white hover:bg-orange-600"
                            >
                              Cancel Subscription
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}

                    {/* Delete User Button */}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          disabled={user.role === "admin" || deletingUserId === user.user_id}
                          title="Delete user"
                        >
                          {deletingUserId === user.user_id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete User</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete{" "}
                            <span className="font-semibold">{user.email || user.full_name}</span>?
                            This action cannot be undone and will remove all their data.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDeleteUser(user.user_id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filteredUsers.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  {hasActiveFilters ? "No users match your filters" : "No users found"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Customer Detail Modal */}
      <Dialog open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Stripe Customer Details
            </DialogTitle>
          </DialogHeader>

          {loadingCustomer ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : !customerData ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No Stripe customer found for this user.</p>
              <p className="text-sm mt-2">They haven't completed a checkout yet.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Customer Info */}
              <div className="space-y-3">
                <h4 className="font-semibold flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Customer Info
                </h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    <span>{customerData.email || "No email"}</span>
                  </div>
                  {customerData.name && (
                    <div className="flex items-center gap-2">
                      <Building className="w-4 h-4 text-muted-foreground" />
                      <span>{customerData.name}</span>
                    </div>
                  )}
                  {customerData.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-muted-foreground" />
                      <span>{customerData.phone}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span>Customer since {formatTimestamp(customerData.created)}</span>
                  </div>
                </div>
              </div>

              {/* Address */}
              {customerData.address && (
                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Billing Address
                  </h4>
                  <div className="text-sm bg-muted/50 rounded-lg p-3">
                    {customerData.address.line1 && <p>{customerData.address.line1}</p>}
                    {customerData.address.line2 && <p>{customerData.address.line2}</p>}
                    <p>
                      {[customerData.address.city, customerData.address.state, customerData.address.postal_code]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                    {customerData.address.country && <p>{customerData.address.country}</p>}
                  </div>
                </div>
              )}

              {/* Company name from metadata */}
              {customerData.metadata?.company_name && (
                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <Building className="w-4 h-4" />
                    Company
                  </h4>
                  <p className="text-sm bg-muted/50 rounded-lg p-3">{customerData.metadata.company_name}</p>
                </div>
              )}

              {/* Payment Methods */}
              {customerData.paymentMethods.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <CreditCard className="w-4 h-4" />
                    Payment Methods
                  </h4>
                  <div className="space-y-2">
                    {customerData.paymentMethods.map((pm) => (
                      <div key={pm.id} className="text-sm bg-muted/50 rounded-lg p-3 flex items-center gap-2">
                        <span className="capitalize">{pm.brand}</span>
                        <span>•••• {pm.last4}</span>
                        <span className="text-muted-foreground">
                          Expires {pm.exp_month}/{pm.exp_year}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Subscriptions */}
              {customerData.subscriptions.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-semibold">Subscriptions</h4>
                  <div className="space-y-2">
                    {customerData.subscriptions.map((sub) => (
                      <div key={sub.id} className="text-sm bg-muted/50 rounded-lg p-3 space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge className={sub.status === "active" ? "bg-green-500/20 text-green-400" : ""}>
                            {sub.status}
                          </Badge>
                          {sub.cancel_at_period_end && (
                            <Badge variant="outline" className="text-orange-400">Cancels at period end</Badge>
                          )}
                        </div>
                        {sub.items.map((item, i) => (
                          <p key={i}>
                            {formatCurrency(item.amount, item.currency)}/{item.interval}
                          </p>
                        ))}
                        <p className="text-muted-foreground">
                          Current period: {formatTimestamp(sub.current_period_start)} - {formatTimestamp(sub.current_period_end)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Payment History / Invoices */}
              {customerData.invoices.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <Receipt className="w-4 h-4" />
                    Payment History ({customerData.invoices.length} invoices)
                  </h4>
                  <div className="border border-border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead className="text-xs">Invoice</TableHead>
                          <TableHead className="text-xs">Date</TableHead>
                          <TableHead className="text-xs">Amount</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs w-[100px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {customerData.invoices.map((inv) => (
                          <TableRow key={inv.id}>
                            <TableCell className="text-xs font-medium">
                              {inv.number || inv.id.slice(0, 12)}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {formatTimestamp(inv.created)}
                            </TableCell>
                            <TableCell className="text-xs">
                              {formatCurrency(inv.status === "paid" ? inv.amount_paid : inv.amount_due, inv.currency)}
                            </TableCell>
                            <TableCell>
                              <Badge 
                                className={
                                  inv.status === "paid" 
                                    ? "bg-green-500/20 text-green-400 text-xs" 
                                    : inv.status === "open"
                                    ? "bg-yellow-500/20 text-yellow-400 text-xs"
                                    : "text-xs"
                                }
                              >
                                {inv.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                {inv.invoice_pdf && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => window.open(inv.invoice_pdf!, "_blank")}
                                    title="Download PDF"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                                {inv.hosted_invoice_url && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => window.open(inv.hosted_invoice_url, "_blank")}
                                    title="View invoice online"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Stripe Dashboard Link */}
              <div className="pt-4 border-t">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => window.open(`https://dashboard.stripe.com/customers/${customerData.id}`, "_blank")}
                >
                  Open in Stripe Dashboard
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}