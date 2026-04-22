import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, Star } from "lucide-react";
import { toast } from "sonner";

interface Bid {
  id: string;
  amount: number;
  message: string | null;
  status: "pending" | "accepted" | "rejected" | "withdrawn";
  created_at: string;
  worker: { id: string; name: string; average_rating: number } | null;
}

interface Props {
  jobId: string;
  canAccept: boolean;
  onAccepted?: () => void;
}

export const BidsList = ({ jobId, canAccept, onAccepted }: Props) => {
  const [bids, setBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(true);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("bids")
      .select(
        "id, amount, message, status, created_at, worker:profiles!bids_worker_id_fkey(id, name, average_rating)",
      )
      .eq("job_id", jobId)
      .order("amount", { ascending: true });
    setBids((data ?? []) as unknown as Bid[]);
    setLoading(false);
  }, [jobId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAccept = async (bidId: string) => {
    setAcceptingId(bidId);
    const { error } = await supabase
      .from("bids")
      .update({ status: "accepted" })
      .eq("id", bidId);
    setAcceptingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Bid accepted — job assigned!");
    onAccepted?.();
    load();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (bids.length === 0) {
    return (
      <p className="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        No bids yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {bids.map((b) => (
        <div
          key={b.id}
          className="flex flex-wrap items-start justify-between gap-2 rounded-md border bg-card/50 px-3 py-2"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {b.worker && (
                <Link to={`/workers/${b.worker.id}`} className="font-medium text-primary hover:underline">
                  {b.worker.name}
                </Link>
              )}
              {b.worker && b.worker.average_rating > 0 && (
                <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                  <Star className="h-3 w-3 fill-current text-primary" />
                  {b.worker.average_rating}
                </span>
              )}
              <span className="font-semibold">${b.amount.toLocaleString()}</span>
              {b.status !== "pending" && (
                <Badge variant={b.status === "accepted" ? "default" : "secondary"}>
                  {b.status}
                </Badge>
              )}
            </div>
            {b.message && <p className="mt-1 text-sm text-muted-foreground">{b.message}</p>}
          </div>
          {canAccept && b.status === "pending" && (
            <Button
              size="sm"
              onClick={() => handleAccept(b.id)}
              disabled={acceptingId === b.id}
            >
              {acceptingId === b.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Accept
            </Button>
          )}
        </div>
      ))}
    </div>
  );
};