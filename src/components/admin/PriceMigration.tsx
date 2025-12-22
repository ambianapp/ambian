import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Loader2, ArrowRight, AlertTriangle, CheckCircle } from "lucide-react";
import { toast } from "sonner";

// Current prices in Stripe
const PRICES = [
  { id: "price_1S2BhCJrU52a7SNLtRRpyoCl", label: "Monthly €8.90", amount: 890, interval: "month" },
  { id: "price_1S2BqdJrU52a7SNLAnOR8Nhf", label: "Yearly €89.00", amount: 8900, interval: "year" },
  { id: "price_1RREw6JrU52a7SNLjcBLbT7w", label: "Monthly €11.17 (old)", amount: 1117, interval: "month" },
  { id: "price_1RREw6JrU52a7SNLevS4o4gf", label: "Yearly €111.70 (old)", amount: 11170, interval: "year" },
];

interface MigrationPreview {
  subscriptionId: string;
  customerId: string;
  currentPriceId: string;
  currentAmount: number;
}

interface MigrationResult {
  subscriptionId: string;
  status: "migrated" | "failed";
  error?: string;
}

export function PriceMigration() {
  const [oldPriceId, setOldPriceId] = useState<string>("");
  const [newPriceId, setNewPriceId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<MigrationPreview[] | null>(null);
  const [results, setResults] = useState<MigrationResult[] | null>(null);

  const handlePreview = async () => {
    if (!oldPriceId || !newPriceId) {
      toast.error("Please select both old and new prices");
      return;
    }
    if (oldPriceId === newPriceId) {
      toast.error("Old and new prices must be different");
      return;
    }

    setLoading(true);
    setPreview(null);
    setResults(null);

    try {
      const { data, error } = await supabase.functions.invoke("migrate-subscription-prices", {
        body: { oldPriceId, newPriceId, dryRun: true },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setPreview(data.subscriptions || []);
      toast.success(`Found ${data.subscriptions?.length || 0} subscriptions to migrate`);
    } catch (error: any) {
      console.error("Preview error:", error);
      toast.error(error.message || "Failed to preview migration");
    } finally {
      setLoading(false);
    }
  };

  const handleMigrate = async () => {
    setLoading(true);
    setResults(null);

    try {
      const { data, error } = await supabase.functions.invoke("migrate-subscription-prices", {
        body: { oldPriceId, newPriceId, dryRun: false },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setResults(data.results || []);
      setPreview(null);
      toast.success(data.message);
    } catch (error: any) {
      console.error("Migration error:", error);
      toast.error(error.message || "Failed to migrate subscriptions");
    } finally {
      setLoading(false);
    }
  };

  const formatAmount = (amount: number) => `€${(amount / 100).toFixed(2)}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-orange-500" />
          Price Migration Tool
        </CardTitle>
        <CardDescription>
          Migrate existing subscribers from one price to another. This will update their next billing amount.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Price Selection */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr,auto,1fr] gap-4 items-end">
          <div className="space-y-2">
            <label className="text-sm font-medium">Current Price</label>
            <Select value={oldPriceId} onValueChange={setOldPriceId}>
              <SelectTrigger>
                <SelectValue placeholder="Select current price" />
              </SelectTrigger>
              <SelectContent>
                {PRICES.map((price) => (
                  <SelectItem key={price.id} value={price.id}>
                    {price.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <ArrowRight className="w-5 h-5 text-muted-foreground hidden md:block" />

          <div className="space-y-2">
            <label className="text-sm font-medium">New Price</label>
            <Select value={newPriceId} onValueChange={setNewPriceId}>
              <SelectTrigger>
                <SelectValue placeholder="Select new price" />
              </SelectTrigger>
              <SelectContent>
                {PRICES.map((price) => (
                  <SelectItem key={price.id} value={price.id}>
                    {price.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button onClick={handlePreview} disabled={loading || !oldPriceId || !newPriceId}>
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          Preview Migration
        </Button>

        {/* Preview Results */}
        {preview && (
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <h4 className="font-medium mb-2">
                {preview.length} subscription{preview.length !== 1 ? "s" : ""} will be migrated
              </h4>
              {preview.length > 0 ? (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {preview.map((sub) => (
                    <div key={sub.subscriptionId} className="flex items-center justify-between text-sm">
                      <span className="font-mono text-xs">{sub.subscriptionId}</span>
                      <Badge variant="outline">{formatAmount(sub.currentAmount)}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No subscriptions found with the selected price.</p>
              )}
            </div>

            {preview.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={loading}>
                    {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Migrate {preview.length} Subscription{preview.length !== 1 ? "s" : ""}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirm Price Migration</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will update {preview.length} subscription{preview.length !== 1 ? "s" : ""} to the new price.
                      The change will take effect on their next billing cycle.
                      <br /><br />
                      <strong>This action cannot be easily undone.</strong>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleMigrate} className="bg-destructive text-destructive-foreground">
                      Confirm Migration
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        )}

        {/* Migration Results */}
        {results && (
          <div className="p-4 bg-muted rounded-lg space-y-2">
            <h4 className="font-medium flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              Migration Complete
            </h4>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {results.map((result) => (
                <div key={result.subscriptionId} className="flex items-center justify-between text-sm">
                  <span className="font-mono text-xs">{result.subscriptionId}</span>
                  <Badge variant={result.status === "migrated" ? "default" : "destructive"}>
                    {result.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
