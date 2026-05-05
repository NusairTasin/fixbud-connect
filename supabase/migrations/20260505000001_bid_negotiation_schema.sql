-- ============================================================
-- Bid Negotiation Schema
-- Requirements: 8.1, 8.2, 8.3, 8.4
-- ============================================================

-- 1. New enums

CREATE TYPE public.offer_status AS ENUM (
  'pending',    -- active offer awaiting response
  'countered',  -- superseded by a counter-offer
  'accepted',   -- accepted; job assigned
  'withdrawn',  -- worker withdrew
  'rejected'    -- thread closed because another thread was accepted
);

CREATE TYPE public.proposer_role AS ENUM ('customer', 'worker');

-- 2. bid_offers table

CREATE TABLE public.bid_offers (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_id        UUID          NOT NULL REFERENCES public.bids(id) ON DELETE CASCADE,
  round_number  INTEGER       NOT NULL CHECK (round_number >= 1),
  proposer_role public.proposer_role NOT NULL,
  amount        NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  message       TEXT,
  status        public.offer_status NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT bid_offers_unique_round UNIQUE (bid_id, round_number)
);

CREATE INDEX idx_bid_offers_bid    ON public.bid_offers(bid_id);
CREATE INDEX idx_bid_offers_status ON public.bid_offers(status);

-- 3. Enable RLS on bid_offers

ALTER TABLE public.bid_offers ENABLE ROW LEVEL SECURITY;

-- 4. Relax the bids unique constraint to allow re-bidding after withdrawal

ALTER TABLE public.bids DROP CONSTRAINT IF EXISTS bids_job_id_worker_id_key;

-- Partial unique index: only one active (non-withdrawn) thread per (job, worker)
CREATE UNIQUE INDEX bids_active_thread_unique
  ON public.bids (job_id, worker_id)
  WHERE status NOT IN ('withdrawn');

-- 5. Replace guard_bid_update trigger function
--    Remove immutability checks for amount and message (those now live on bid_offers).
--    Keep: job_id / worker_id immutability and status transition rules.

CREATE OR REPLACE FUNCTION public.guard_bid_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  _job public.job_requests%ROWTYPE;
BEGIN
  -- Immutable fields: a bid cannot be reassigned to another job or worker.
  IF NEW.job_id <> OLD.job_id THEN
    RAISE EXCEPTION 'Cannot change a bid''s job_id';
  END IF;
  IF NEW.worker_id <> OLD.worker_id THEN
    RAISE EXCEPTION 'Cannot change a bid''s worker_id';
  END IF;

  -- Status change rules
  IF NEW.status <> OLD.status THEN
    -- Only pending bids can transition
    IF OLD.status <> 'pending' THEN
      RAISE EXCEPTION 'Bid is already %; status cannot change', OLD.status;
    END IF;

    -- Allowed terminal states from pending
    IF NEW.status NOT IN ('accepted', 'rejected', 'withdrawn') THEN
      RAISE EXCEPTION 'Illegal bid status transition: % -> %', OLD.status, NEW.status;
    END IF;

    -- For acceptance, verify the job is still open and the bid belongs to it
    IF NEW.status = 'accepted' THEN
      SELECT * INTO _job FROM public.job_requests WHERE id = NEW.job_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Job no longer exists';
      END IF;

      IF _job.status <> 'pending' THEN
        RAISE EXCEPTION 'Job is no longer pending (current status: %)', _job.status;
      END IF;

      IF _job.worker_id IS NOT NULL THEN
        RAISE EXCEPTION 'Job already has an assigned worker';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$func$;

-- Trigger is already registered; recreating it ensures it uses the updated function.
DROP TRIGGER IF EXISTS guard_bid_update_trg ON public.bids;
CREATE TRIGGER guard_bid_update_trg
BEFORE UPDATE ON public.bids
FOR EACH ROW EXECUTE FUNCTION public.guard_bid_update();
