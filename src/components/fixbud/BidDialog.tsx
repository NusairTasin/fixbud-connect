import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Gavel } from "lucide-react";
import { toast } from "sonner";

interface Props {
  jobId: string;
  jobTitle: string;
  suggested?: number;
  onPlaced?: () => void;
  trigger?: React.ReactNode;
}

export const BidDialog = ({ jobId, jobTitle, suggested, onPlaced, trigger }: Props) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(suggested ? String(suggested) : "");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const value = parseFloat(amount);
    if (Number.isNaN(value) || value < 0) {
      toast.error("Bid amount must be a positive number.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.rpc("negotiate_initiate", {
      p_job_id: jobId,
      p_amount: value,
      p_message: message.trim() || null,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Bid submitted!");
    setMessage("");
    setOpen(false);
    onPlaced?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Gavel className="h-4 w-4" />
            Place bid
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bid on "{jobTitle}"</DialogTitle>
          <DialogDescription>
            Propose your price and a short pitch. The customer will review all bids.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bid-amount">Your bid (USD)</Label>
            <Input
              id="bid-amount"
              type="number"
              min="0"
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="120"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bid-msg">Message (optional)</Label>
            <Textarea
              id="bid-msg"
              rows={3}
              maxLength={500}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Why you're a great fit, ETA, materials included…"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Submit bid
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};