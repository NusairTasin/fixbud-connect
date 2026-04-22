-- Guard bid updates with strict server-side checks
CREATE OR REPLACE FUNCTION public.guard_bid_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _job public.job_requests%ROWTYPE;
BEGIN
  -- Immutable fields: a bid cannot be reassigned to another job/worker,
  -- and the amount/message cannot be edited after submission.
  IF NEW.job_id <> OLD.job_id THEN
    RAISE EXCEPTION 'Cannot change a bid''s job_id';
  END IF;
  IF NEW.worker_id <> OLD.worker_id THEN
    RAISE EXCEPTION 'Cannot change a bid''s worker_id';
  END IF;
  IF NEW.amount <> OLD.amount THEN
    RAISE EXCEPTION 'Bid amount cannot be modified after submission';
  END IF;
  IF COALESCE(NEW.message, '') <> COALESCE(OLD.message, '') THEN
    RAISE EXCEPTION 'Bid message cannot be modified after submission';
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
$$;

DROP TRIGGER IF EXISTS guard_bid_update_trg ON public.bids;
CREATE TRIGGER guard_bid_update_trg
BEFORE UPDATE ON public.bids
FOR EACH ROW EXECUTE FUNCTION public.guard_bid_update();