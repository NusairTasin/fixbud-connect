import type { BidOffer, ProposerRole } from "@/integrations/supabase/types";

/**
 * Returns the single pending (active) offer in a thread, or null if none exists.
 */
export function getActiveOffer(offers: BidOffer[]): BidOffer | null {
  return offers.find((o) => o.status === "pending") ?? null;
}

/**
 * Returns true when the viewer is the responder for the active offer
 * (i.e., it is their turn to act).
 * - If activeOffer is null (thread resolved), returns false.
 * - If the active offer was proposed by 'worker', the customer's turn → returns true for 'customer'.
 * - If the active offer was proposed by 'customer', the worker's turn → returns true for 'worker'.
 */
export function isMyTurn(
  activeOffer: BidOffer | null,
  viewerRole: ProposerRole
): boolean {
  if (!activeOffer) return false;
  return activeOffer.proposer_role !== viewerRole;
}

/**
 * Returns true for amounts that are non-negative and have at most 2 decimal places.
 */
export function validateOfferAmount(amount: number): boolean {
  if (amount < 0) return false;
  return Math.round(amount * 100) / 100 === amount;
}

/**
 * Returns a new array of offers sorted by round_number ascending.
 */
export function sortOffersByRound(offers: BidOffer[]): BidOffer[] {
  return [...offers].sort((a, b) => a.round_number - b.round_number);
}
