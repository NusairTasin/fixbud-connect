import { useState } from "react";
import { useNegotiationThread } from "@/hooks/useNegotiationThread";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Check, X, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BidOffer, OfferStatus } from "@/integrations/supabase/types";

interface NegotiationThreadProps {
  bidId: string;
  workerId: string;
  workerName: string;
  jobId: string;
  viewerRole: "customer" | "worker";
  onResolved?: () => void;
}

const STATUS_BADGE_VARIANTS: Record<
  OfferStatus,
  { label: string; className: string }
> = {
  pending: {
    label: "Awaiting response",
    className: "bg-primary/10 text-primary border-primary/20",
  },
  countered: {
    label: "Countered",
    className: "bg-secondary text-secondary-foreground",
  },
  accepted: {
    label: "Accepted",
    className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
  withdrawn: {
    label: "Withdrawn",
    className: "bg-destructive/10 text-destructive",
  },
  rejected: {
    label: "Rejected",
    className: "bg-destructive/10 text-destructive",
  },
};

function OfferStatusBadge({ status }: { status: OfferStatus }) {
  const config = STATUS_BADGE_VARIANTS[status];
  return (
    <Badge
      variant="outline"
      className={cn("text-xs font-medium", config.className)}
    >
      {config.label}
    </Badge>
  );
}

function formatAmount(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function OfferCard({
  offer,
  isActive,
}: {
  offer: BidOffer;
  isActive: boolean;
}) {
  const isWorker = offer.proposer_role === "worker";
  const proposerLabel = isWorker ? "Worker" : "Customer";

  return (
    <div
      className={cn(
        "flex",
        isWorker ? "justify-start" : "justify-end",
      )}
    >
      <div
        className={cn(
          "max-w-[75%] rounded-lg border p-3 space-y-1.5",
          isWorker
            ? "bg-muted/40 border-muted"
            : "bg-primary/10 border-primary/20",
          isActive && "ring-1 ring-primary",
        )}
      >
        {/* Header row: amount + proposer + status */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-sm">
            {formatAmount(offer.amount)}
          </span>
          <span className="text-xs text-muted-foreground">{proposerLabel}</span>
          {isActive ? (
            <OfferStatusBadge status="pending" />
          ) : (
            offer.status !== "pending" && (
              <OfferStatusBadge status={offer.status} />
            )
          )}
        </div>

        {/* Optional message */}
        {offer.message && (
          <p className="text-sm text-foreground/80 leading-snug">
            {offer.message}
          </p>
        )}

        {/* Timestamp */}
        <p className="text-xs text-muted-foreground">
          {new Date(offer.created_at).toLocaleString()}
        </p>
      </div>
    </div>
  );
}

export function NegotiationThread({
  bidId,
  workerName,
  viewerRole,
  onResolved,
}: NegotiationThreadProps) {
  const { offers, loading, error, activeOffer, isMyTurn, counter, accept, withdraw } =
    useNegotiationThread({ bidId, viewerRole, onResolved });

  const [counterAmount, setCounterAmount] = useState("");
  const [counterMessage, setCounterMessage] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [countering, setCountering] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  const otherParty = viewerRole === "customer" ? workerName || "Worker" : "Customer";

  const handleAccept = async () => {
    setAccepting(true);
    await accept();
    setAccepting(false);
  };

  const handleCounter = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(counterAmount);
    if (Number.isNaN(amount)) return;
    setCountering(true);
    await counter(amount, counterMessage.trim() || undefined);
    setCountering(false);
    setCounterAmount("");
    setCounterMessage("");
  };

  const handleWithdraw = async () => {
    setWithdrawing(true);
    await withdraw();
    setWithdrawing(false);
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {error}
      </div>
    );
  }

  const isResolved = !activeOffer && offers.length > 0;
  const lastOffer = offers.length > 0 ? offers[offers.length - 1] : null;

  return (
    <div className="space-y-4">
      {/* Offer history timeline */}
      {offers.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          No offers yet.
        </p>
      ) : (
        <div className="space-y-2">
          {offers.map((offer) => (
            <OfferCard
              key={offer.id}
              offer={offer}
              isActive={activeOffer?.id === offer.id}
            />
          ))}
        </div>
      )}

      {/* Action area */}
      <div className="space-y-3 pt-1">
        {/* Resolved state */}
        {isResolved && lastOffer && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Thread resolved:</span>
            <OfferStatusBadge status={lastOffer.status} />
            {lastOffer.status === "accepted" && (
              <span className="font-medium text-foreground">
                {formatAmount(lastOffer.amount)}
              </span>
            )}
          </div>
        )}

        {/* Active thread actions */}
        {activeOffer && (
          <>
            {/* My turn: Accept + Counter form */}
            {isMyTurn && (
              <div className="space-y-3 rounded-lg border bg-card p-4">
                {/* Accept button */}
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleAccept}
                  disabled={accepting || countering}
                  className="w-full sm:w-auto"
                  aria-label="Accept offer"
                >
                  {accepting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Accept {formatAmount(activeOffer.amount)}
                </Button>

                {/* Counter-offer form */}
                <form onSubmit={handleCounter} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor={`counter-amount-${bidId}`} className="text-sm">
                      Counter offer (USD)
                    </Label>
                    <Input
                      id={`counter-amount-${bidId}`}
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      value={counterAmount}
                      onChange={(e) => setCounterAmount(e.target.value)}
                      placeholder="0.00"
                      className="max-w-[180px]"
                      disabled={countering || accepting}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`counter-msg-${bidId}`} className="text-sm">
                      Message{" "}
                      <span className="text-muted-foreground">(optional)</span>
                    </Label>
                    <Textarea
                      id={`counter-msg-${bidId}`}
                      rows={2}
                      maxLength={500}
                      value={counterMessage}
                      onChange={(e) => setCounterMessage(e.target.value)}
                      placeholder="Explain your counter-offer…"
                      disabled={countering || accepting}
                    />
                  </div>
                  <Button
                    type="submit"
                    variant="outline"
                    size="sm"
                    disabled={countering || accepting || !counterAmount}
                    aria-label="Submit counter-offer"
                  >
                    {countering && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                    Counter
                  </Button>
                </form>
              </div>
            )}

            {/* Not my turn: waiting indicator */}
            {!isMyTurn && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4 shrink-0" />
                <span>Waiting for {otherParty}…</span>
              </div>
            )}

            {/* Withdraw button (worker only) */}
            {viewerRole === "worker" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleWithdraw}
                disabled={withdrawing || accepting || countering}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                aria-label="Withdraw offer"
              >
                {withdrawing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <X className="h-4 w-4" />
                )}
                Withdraw
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
