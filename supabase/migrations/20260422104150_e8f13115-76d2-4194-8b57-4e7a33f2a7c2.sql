-- Bid status enum
CREATE TYPE public.bid_status AS ENUM ('pending', 'accepted', 'rejected', 'withdrawn');

-- Bids table
CREATE TABLE public.bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.job_requests(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  message TEXT,
  status public.bid_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, worker_id)
);

CREATE INDEX idx_bids_job ON public.bids(job_id);
CREATE INDEX idx_bids_worker ON public.bids(worker_id);
CREATE INDEX idx_bids_status ON public.bids(status);

-- Updated_at trigger
CREATE TRIGGER touch_bids_updated_at
BEFORE UPDATE ON public.bids
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Enable RLS
ALTER TABLE public.bids ENABLE ROW LEVEL SECURITY;

-- Workers can view their own bids
CREATE POLICY "Workers view own bids" ON public.bids
FOR SELECT TO authenticated
USING (worker_id = auth.uid());

-- Customers can view bids on their own jobs
CREATE POLICY "Customers view bids on own jobs" ON public.bids
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.job_requests j
  WHERE j.id = bids.job_id AND j.customer_id = auth.uid()
));

-- Workers can submit bids on pending unassigned jobs
CREATE POLICY "Workers can place bids" ON public.bids
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'worker')
  AND worker_id = auth.uid()
  AND status = 'pending'
  AND EXISTS (
    SELECT 1 FROM public.job_requests j
    WHERE j.id = bids.job_id
      AND j.status = 'pending'
      AND j.worker_id IS NULL
  )
);

-- Workers can withdraw their own pending bids
CREATE POLICY "Workers can update own bids" ON public.bids
FOR UPDATE TO authenticated
USING (worker_id = auth.uid())
WITH CHECK (worker_id = auth.uid());

-- Customers can update bids on their own jobs (to accept/reject)
CREATE POLICY "Customers can update bids on own jobs" ON public.bids
FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.job_requests j
  WHERE j.id = bids.job_id AND j.customer_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.job_requests j
  WHERE j.id = bids.job_id AND j.customer_id = auth.uid()
));

-- When a bid is accepted, assign the worker, move job to 'accepted',
-- and reject all other pending bids on the same job.
CREATE OR REPLACE FUNCTION public.handle_bid_accepted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'accepted' AND (OLD.status IS DISTINCT FROM 'accepted') THEN
    UPDATE public.job_requests
       SET worker_id = NEW.worker_id,
           status = 'accepted'
     WHERE id = NEW.job_id
       AND status = 'pending';

    UPDATE public.bids
       SET status = 'rejected'
     WHERE job_id = NEW.job_id
       AND id <> NEW.id
       AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_bid_accepted
AFTER UPDATE ON public.bids
FOR EACH ROW EXECUTE FUNCTION public.handle_bid_accepted();