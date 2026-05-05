import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { BidOffer } from "@/integrations/supabase/types";
import {
  getActiveOffer,
  isMyTurn as checkIsMyTurn,
} from "@/lib/negotiation";

export interface UseNegotiationThreadOptions {
  bidId: string;
  viewerRole: "customer" | "worker";
  onResolved?: () => void;
}

export interface UseNegotiationThreadResult {
  offers: BidOffer[];
  loading: boolean;
  error: string | null;
  activeOffer: BidOffer | null;
  isMyTurn: boolean;
  counter: (amount: number, message?: string) => Promise<void>;
  accept: () => Promise<void>;
  withdraw: () => Promise<void>;
}

export function useNegotiationThread({
  bidId,
  viewerRole,
  onResolved,
}: UseNegotiationThreadOptions): UseNegotiationThreadResult {
  const [offers, setOffers] = useState<BidOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from("bid_offers")
      .select("*")
      .eq("bid_id", bidId)
      .order("round_number", { ascending: true });

    if (fetchError) {
      setError(fetchError.message);
      toast.error(fetchError.message);
    } else {
      setOffers((data as BidOffer[]) ?? []);
      setError(null);
    }
    setLoading(false);
  }, [bidId]);

  useEffect(() => {
    setLoading(true);

    const channel = supabase
      .channel(`bid_offers:${bidId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "bid_offers",
          filter: `bid_id=eq.${bidId}`,
        },
        () => {
          load();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "bid_offers",
          filter: `bid_id=eq.${bidId}`,
        },
        () => {
          load();
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          load();
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [bidId, load]);

  const counter = useCallback(
    async (amount: number, message?: string) => {
      const { error: rpcError } = await supabase.rpc("negotiate_counter", {
        p_bid_id: bidId,
        p_amount: amount,
        p_message: message ?? null,
      });

      if (rpcError) {
        setError(rpcError.message);
        toast.error(rpcError.message);
        return;
      }

      await load();
    },
    [bidId, load]
  );

  const accept = useCallback(async () => {
    const { error: rpcError } = await supabase.rpc("negotiate_accept", {
      p_bid_id: bidId,
    });

    if (rpcError) {
      setError(rpcError.message);
      toast.error(rpcError.message);
      return;
    }

    await load();
    onResolved?.();
  }, [bidId, load, onResolved]);

  const withdraw = useCallback(async () => {
    const { error: rpcError } = await supabase.rpc("negotiate_withdraw", {
      p_bid_id: bidId,
    });

    if (rpcError) {
      setError(rpcError.message);
      toast.error(rpcError.message);
      return;
    }

    await load();
    onResolved?.();
  }, [bidId, load, onResolved]);

  const activeOffer = getActiveOffer(offers);
  const isMyTurn = checkIsMyTurn(activeOffer, viewerRole);

  return {
    offers,
    loading,
    error,
    activeOffer,
    isMyTurn,
    counter,
    accept,
    withdraw,
  };
}
