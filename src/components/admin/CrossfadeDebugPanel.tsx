import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const CROSSFADE_DEBUG_KEY = "ambian_crossfade_debug";

type DebugEntry = {
  ts?: string;
  message?: string;
  trackId?: string | null;
  payload?: unknown;
  [k: string]: unknown;
};

function safeParse(raw: string | null): DebugEntry[] {
  try {
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DebugEntry[]) : [];
  } catch {
    return [];
  }
}

export function CrossfadeDebugPanel() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [filter, setFilter] = useState("");

  const entries = useMemo(() => {
    const raw = localStorage.getItem(CROSSFADE_DEBUG_KEY);
    const list = safeParse(raw);
    if (!filter.trim()) return list;
    const q = filter.trim().toLowerCase();
    return list.filter((e) => JSON.stringify(e).toLowerCase().includes(q));
  }, [refreshKey, filter]);

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(entries, null, 2));
      toast.success("Crossfade debug copied");
    } catch {
      toast.error("Failed to copy");
    }
  };

  const clear = () => {
    localStorage.removeItem(CROSSFADE_DEBUG_KEY);
    setRefreshKey((x) => x + 1);
    toast.success("Crossfade debug cleared");
  };

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Crossfade Debug (local)</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setRefreshKey((x) => x + 1)}>
              Refresh
            </Button>
            <Button variant="secondary" size="sm" onClick={copyAll} disabled={entries.length === 0}>
              Copy JSON
            </Button>
            <Button variant="destructive" size="sm" onClick={clear} disabled={entries.length === 0}>
              Clear
            </Button>
          </div>
        </div>
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter (track id, message, src, etc.)"
        />
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[360px] rounded-md border border-border">
          <div className="p-3 space-y-3">
            {entries.length === 0 ? (
              <div className="text-sm text-muted-foreground">No debug entries yet.</div>
            ) : (
              entries
                .slice()
                .reverse()
                .map((e, idx) => (
                  <div key={idx} className="space-y-2">
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                      <span>{e.ts ?? ""}</span>
                      <span>track: {String(e.trackId ?? "-")}</span>
                      <span>{String(e.message ?? "")}</span>
                    </div>
                    <pre className="text-xs whitespace-pre-wrap break-words bg-muted/40 rounded-md p-2">
                      {JSON.stringify(e, null, 2)}
                    </pre>
                    <Separator />
                  </div>
                ))
            )}
          </div>
        </ScrollArea>
        <p className="mt-3 text-xs text-muted-foreground">
          This panel shows the last ~200 crossfade events captured in your browser. After the bug happens, click
          <span className="font-medium"> Refresh</span> and then <span className="font-medium">Copy JSON</span> and paste it here.
        </p>
      </CardContent>
    </Card>
  );
}
