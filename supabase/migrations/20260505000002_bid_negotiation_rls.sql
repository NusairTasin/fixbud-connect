-- ============================================================
-- Bid Negotiation RLS Policies for bid_offers
-- Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
-- ============================================================
-- Note: RLS is already enabled on bid_offers in migration 20260505000001.
-- This migration adds the access policies only.

-- ----------------------------------------------------------------
-- SELECT policies
-- ----------------------------------------------------------------

-- 9.1: Workers may read bid_offers rows for threads they own
CREATE POLICY "Workers view own bid offers"
  ON public.bid_offers
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.bids b
       WHERE b.id = bid_offers.bid_id
         AND b.worker_id = auth.uid()
    )
  );

-- 9.2: Customers may read bid_offers rows for threads on their jobs
CREATE POLICY "Customers view bid offers on own jobs"
  ON public.bid_offers
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.bids b
        JOIN public.job_requests j ON j.id = b.job_id
       WHERE b.id = bid_offers.bid_id
         AND j.customer_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------
-- INSERT policies
-- ----------------------------------------------------------------

-- 9.3: Workers may insert when it is their turn
--   Conditions:
--     • Caller has the 'worker' role
--     • NEW.proposer_role = 'worker'
--     • The bid belongs to this worker
--     • Either no offers exist yet in the thread (first offer),
--       OR the last offer in the thread was proposed by the customer
CREATE POLICY "Workers can insert bid offers on their turn"
  ON public.bid_offers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'worker')
    AND proposer_role = 'worker'
    AND EXISTS (
      SELECT 1
        FROM public.bids b
       WHERE b.id = bid_offers.bid_id
         AND b.worker_id = auth.uid()
    )
    AND (
      -- First offer in the thread
      NOT EXISTS (
        SELECT 1
          FROM public.bid_offers prev
         WHERE prev.bid_id = bid_offers.bid_id
      )
      OR
      -- Last offer was proposed by the customer
      (
        SELECT prev.proposer_role
          FROM public.bid_offers prev
         WHERE prev.bid_id = bid_offers.bid_id
         ORDER BY prev.round_number DESC
         LIMIT 1
      ) = 'customer'
    )
  );

-- 9.4: Customers may insert when it is their turn
--   Conditions:
--     • Caller has the 'customer' role
--     • NEW.proposer_role = 'customer'
--     • The job belongs to this customer
--     • The last offer in the thread was proposed by the worker
--       (customers cannot initiate — the worker always goes first)
CREATE POLICY "Customers can insert bid offers on their turn"
  ON public.bid_offers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'customer')
    AND proposer_role = 'customer'
    AND EXISTS (
      SELECT 1
        FROM public.bids b
        JOIN public.job_requests j ON j.id = b.job_id
       WHERE b.id = bid_offers.bid_id
         AND j.customer_id = auth.uid()
    )
    AND (
      SELECT prev.proposer_role
        FROM public.bid_offers prev
       WHERE prev.bid_id = bid_offers.bid_id
       ORDER BY prev.round_number DESC
       LIMIT 1
    ) = 'worker'
  );

-- ----------------------------------------------------------------
-- No UPDATE or DELETE policies (9.5)
-- ----------------------------------------------------------------
-- UPDATE and DELETE are intentionally omitted.
-- With RLS enabled and no permissive UPDATE/DELETE policies,
-- all such operations by regular authenticated users are denied
-- by default. Status transitions are performed exclusively by
-- SECURITY DEFINER functions and triggers.
