-- ============================================================
-- Bid Negotiation SECURITY DEFINER Functions and Trigger
-- Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4,
--               2.5, 2.6, 2.7, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6,
--               4.1, 4.2, 4.3, 4.4, 8.5
-- ============================================================

-- ----------------------------------------------------------------
-- 1. negotiate_initiate
--    Creates the bids header row and the first bid_offers row.
--    Returns the new bid_id UUID.
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.negotiate_initiate(
  p_job_id  UUID,
  p_amount  NUMERIC,
  p_message TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  _worker_id  UUID;
  _lat        DOUBLE PRECISION;
  _lng        DOUBLE PRECISION;
  _job        public.job_requests%ROWTYPE;
  _bid_id     UUID;
BEGIN
  _worker_id := auth.uid();

  -- 1. Caller must have the worker role
  IF NOT public.has_role(_worker_id, 'worker') THEN
    RAISE EXCEPTION 'Only workers can initiate a negotiation';
  END IF;

  -- 2. Caller must have lat/lng set on their profile
  SELECT lat, lng INTO _lat, _lng
    FROM public.profiles
   WHERE id = _worker_id;

  IF _lat IS NULL OR _lng IS NULL THEN
    RAISE EXCEPTION 'You must add your address on your profile before placing a bid';
  END IF;

  -- 3. Job must exist, be pending, and have no assigned worker
  SELECT * INTO _job
    FROM public.job_requests
   WHERE id = p_job_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found';
  END IF;

  IF _job.status <> 'pending' THEN
    RAISE EXCEPTION 'Job is no longer accepting offers';
  END IF;

  IF _job.worker_id IS NOT NULL THEN
    RAISE EXCEPTION 'Job already has an assigned worker';
  END IF;

  -- 4. No existing non-withdrawn thread for this (job, worker) pair
  IF EXISTS (
    SELECT 1 FROM public.bids
     WHERE job_id   = p_job_id
       AND worker_id = _worker_id
       AND status   <> 'withdrawn'
  ) THEN
    RAISE EXCEPTION 'A negotiation thread already exists for this job and worker';
  END IF;

  -- 5. Amount must be >= 0 with at most 2 decimal places
  IF p_amount < 0 OR p_amount <> ROUND(p_amount, 2) THEN
    RAISE EXCEPTION 'Offer amount must be a non-negative number with at most two decimal places';
  END IF;

  -- Insert the bids header row
  INSERT INTO public.bids (job_id, worker_id, amount, message, status)
  VALUES (p_job_id, _worker_id, p_amount, p_message, 'pending')
  RETURNING id INTO _bid_id;

  -- Insert the first bid_offers row (round 1)
  INSERT INTO public.bid_offers (bid_id, round_number, proposer_role, amount, message, status)
  VALUES (_bid_id, 1, 'worker', p_amount, p_message, 'pending');

  RETURN _bid_id;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.negotiate_initiate(UUID, NUMERIC, TEXT) TO authenticated;

-- ----------------------------------------------------------------
-- 2. negotiate_counter
--    Sets the current pending offer to 'countered' and inserts a
--    new offer with round_number = max + 1.
--    Returns the new offer UUID.
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.negotiate_counter(
  p_bid_id  UUID,
  p_amount  NUMERIC,
  p_message TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  _caller_id      UUID;
  _bid            public.bids%ROWTYPE;
  _job            public.job_requests%ROWTYPE;
  _active_offer   public.bid_offers%ROWTYPE;
  _pending_count  INTEGER;
  _caller_is_worker   BOOLEAN;
  _caller_is_customer BOOLEAN;
  _new_proposer_role  public.proposer_role;
  _new_round          INTEGER;
  _new_offer_id       UUID;
BEGIN
  _caller_id := auth.uid();

  -- Load the bid thread
  SELECT * INTO _bid
    FROM public.bids
   WHERE id = p_bid_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Negotiation thread not found';
  END IF;

  -- Load the job
  SELECT * INTO _job
    FROM public.job_requests
   WHERE id = _bid.job_id;

  -- Determine caller's relationship to the thread
  _caller_is_worker   := (_bid.worker_id = _caller_id);
  _caller_is_customer := (_job.customer_id = _caller_id);

  IF NOT (_caller_is_worker OR _caller_is_customer) THEN
    RAISE EXCEPTION 'You are not a participant in this negotiation';
  END IF;

  -- Job must still be pending
  IF _job.status <> 'pending' THEN
    RAISE EXCEPTION 'Job is no longer accepting offers';
  END IF;

  -- Exactly one pending offer must exist
  SELECT COUNT(*) INTO _pending_count
    FROM public.bid_offers
   WHERE bid_id = p_bid_id
     AND status = 'pending';

  IF _pending_count = 0 THEN
    RAISE EXCEPTION 'This negotiation thread has no active offer';
  END IF;

  IF _pending_count > 1 THEN
    RAISE EXCEPTION 'Negotiation thread is in an inconsistent state';
  END IF;

  -- Load the active (pending) offer
  SELECT * INTO _active_offer
    FROM public.bid_offers
   WHERE bid_id = p_bid_id
     AND status = 'pending';

  -- Caller must be the RESPONDER (not the proposer of the active offer)
  IF _active_offer.proposer_role = 'worker' AND NOT _caller_is_customer THEN
    RAISE EXCEPTION 'It is not your turn to respond';
  END IF;

  IF _active_offer.proposer_role = 'customer' AND NOT _caller_is_worker THEN
    RAISE EXCEPTION 'It is not your turn to respond';
  END IF;

  -- Amount must be >= 0 with at most 2 decimal places
  IF p_amount < 0 OR p_amount <> ROUND(p_amount, 2) THEN
    RAISE EXCEPTION 'Offer amount must be a non-negative number with at most two decimal places';
  END IF;

  -- Determine the new proposer role (opposite of active offer)
  IF _active_offer.proposer_role = 'worker' THEN
    _new_proposer_role := 'customer';
  ELSE
    _new_proposer_role := 'worker';
  END IF;

  -- Compute next round number
  SELECT MAX(round_number) + 1 INTO _new_round
    FROM public.bid_offers
   WHERE bid_id = p_bid_id;

  -- Mark the current pending offer as countered
  UPDATE public.bid_offers
     SET status = 'countered'
   WHERE id = _active_offer.id;

  -- Insert the new counter-offer
  INSERT INTO public.bid_offers (bid_id, round_number, proposer_role, amount, message, status)
  VALUES (p_bid_id, _new_round, _new_proposer_role, p_amount, p_message, 'pending')
  RETURNING id INTO _new_offer_id;

  RETURN _new_offer_id;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.negotiate_counter(UUID, NUMERIC, TEXT) TO authenticated;

-- ----------------------------------------------------------------
-- 3. negotiate_accept
--    Sets the active offer to 'accepted'.
--    The on_bid_offer_accepted trigger handles job assignment and
--    rejection of competing threads.
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.negotiate_accept(
  p_bid_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  _caller_id          UUID;
  _bid                public.bids%ROWTYPE;
  _job                public.job_requests%ROWTYPE;
  _active_offer       public.bid_offers%ROWTYPE;
  _pending_count      INTEGER;
  _caller_is_worker   BOOLEAN;
  _caller_is_customer BOOLEAN;
BEGIN
  _caller_id := auth.uid();

  -- Load the bid thread
  SELECT * INTO _bid
    FROM public.bids
   WHERE id = p_bid_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Negotiation thread not found';
  END IF;

  -- Load the job
  SELECT * INTO _job
    FROM public.job_requests
   WHERE id = _bid.job_id;

  -- Determine caller's relationship to the thread
  _caller_is_worker   := (_bid.worker_id = _caller_id);
  _caller_is_customer := (_job.customer_id = _caller_id);

  IF NOT (_caller_is_worker OR _caller_is_customer) THEN
    RAISE EXCEPTION 'You are not a participant in this negotiation';
  END IF;

  -- Job must still be pending
  IF _job.status <> 'pending' THEN
    RAISE EXCEPTION 'Job is no longer accepting offers';
  END IF;

  -- Exactly one pending offer must exist
  SELECT COUNT(*) INTO _pending_count
    FROM public.bid_offers
   WHERE bid_id = p_bid_id
     AND status = 'pending';

  IF _pending_count = 0 THEN
    RAISE EXCEPTION 'This negotiation thread has no active offer';
  END IF;

  IF _pending_count > 1 THEN
    RAISE EXCEPTION 'Negotiation thread is in an inconsistent state';
  END IF;

  -- Load the active (pending) offer
  SELECT * INTO _active_offer
    FROM public.bid_offers
   WHERE bid_id = p_bid_id
     AND status = 'pending';

  -- Caller must be the RESPONDER (not the proposer of the active offer)
  IF _active_offer.proposer_role = 'worker' AND NOT _caller_is_customer THEN
    RAISE EXCEPTION 'It is not your turn to respond';
  END IF;

  IF _active_offer.proposer_role = 'customer' AND NOT _caller_is_worker THEN
    RAISE EXCEPTION 'It is not your turn to respond';
  END IF;

  -- Accept the active offer (trigger on_bid_offer_accepted fires after this)
  UPDATE public.bid_offers
     SET status = 'accepted'
   WHERE id = _active_offer.id;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.negotiate_accept(UUID) TO authenticated;

-- ----------------------------------------------------------------
-- 4. negotiate_withdraw
--    Sets the active offer to 'withdrawn' and the bids row to
--    'withdrawn'. Only the worker of the thread may call this.
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.negotiate_withdraw(
  p_bid_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  _caller_id     UUID;
  _bid           public.bids%ROWTYPE;
  _active_offer  public.bid_offers%ROWTYPE;
  _pending_count INTEGER;
BEGIN
  _caller_id := auth.uid();

  -- Load the bid thread
  SELECT * INTO _bid
    FROM public.bids
   WHERE id = p_bid_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Negotiation thread not found';
  END IF;

  -- Only the worker of the thread may withdraw
  IF _bid.worker_id <> _caller_id THEN
    RAISE EXCEPTION 'Only the worker can withdraw from a negotiation';
  END IF;

  -- Exactly one pending offer must exist
  SELECT COUNT(*) INTO _pending_count
    FROM public.bid_offers
   WHERE bid_id = p_bid_id
     AND status = 'pending';

  IF _pending_count = 0 THEN
    RAISE EXCEPTION 'This negotiation thread has no active offer';
  END IF;

  IF _pending_count > 1 THEN
    RAISE EXCEPTION 'Negotiation thread is in an inconsistent state';
  END IF;

  -- Load the active (pending) offer
  SELECT * INTO _active_offer
    FROM public.bid_offers
   WHERE bid_id = p_bid_id
     AND status = 'pending';

  -- Mark the active offer as withdrawn
  UPDATE public.bid_offers
     SET status = 'withdrawn'
   WHERE id = _active_offer.id;

  -- Mark the bids row as withdrawn
  UPDATE public.bids
     SET status = 'withdrawn'
   WHERE id = p_bid_id;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.negotiate_withdraw(UUID) TO authenticated;

-- ----------------------------------------------------------------
-- 5. Trigger: on_bid_offer_accepted
--    AFTER UPDATE on bid_offers FOR EACH ROW.
--    When an offer is accepted:
--      - Assigns the job to the worker (sets worker_id + status = 'accepted')
--      - Rejects all other pending bid_offers in competing threads
--      - Rejects those competing bids rows as well
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_bid_offer_accepted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  _job_id    UUID;
  _worker_id UUID;
BEGIN
  IF NEW.status = 'accepted' AND (OLD.status IS DISTINCT FROM 'accepted') THEN

    -- Retrieve job_id and worker_id from the parent bids row
    SELECT job_id, worker_id
      INTO _job_id, _worker_id
      FROM public.bids
     WHERE id = NEW.bid_id;

    -- Assign the job to the worker
    UPDATE public.job_requests
       SET worker_id = _worker_id,
           status    = 'accepted'
     WHERE id     = _job_id
       AND status = 'pending';

    -- Reject all pending offers in competing threads (same job, different bid)
    UPDATE public.bid_offers
       SET status = 'rejected'
     WHERE bid_id IN (
             SELECT id
               FROM public.bids
              WHERE job_id = _job_id
                AND id     <> NEW.bid_id
           )
       AND status = 'pending';

    -- Reject the competing bids rows themselves
    UPDATE public.bids
       SET status = 'rejected'
     WHERE job_id = _job_id
       AND id     <> NEW.bid_id
       AND status = 'pending';

  END IF;

  RETURN NEW;
END;
$func$;

-- Drop the old trigger on bids (replaced by this new trigger on bid_offers)
DROP TRIGGER IF EXISTS on_bid_accepted ON public.bids;

-- Create the new trigger on bid_offers
DROP TRIGGER IF EXISTS on_bid_offer_accepted ON public.bid_offers;
CREATE TRIGGER on_bid_offer_accepted
  AFTER UPDATE ON public.bid_offers
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_bid_offer_accepted();
