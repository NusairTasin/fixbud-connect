-- ============ WORKER REVIEWS CUSTOMER ============
-- Separate table so the existing reviews (customer→worker) schema is untouched.

CREATE TABLE public.worker_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL UNIQUE REFERENCES public.job_requests(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX worker_reviews_worker_idx ON public.worker_reviews(worker_id);
CREATE INDEX worker_reviews_customer_idx ON public.worker_reviews(customer_id);

ALTER TABLE public.worker_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Worker reviews viewable by authenticated users"
  ON public.worker_reviews FOR SELECT TO authenticated USING (true);

CREATE POLICY "Workers can review their own completed jobs"
  ON public.worker_reviews FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = worker_id
    AND EXISTS (
      SELECT 1 FROM public.job_requests j
      WHERE j.id = job_id
        AND j.worker_id = auth.uid()
        AND j.customer_id = worker_reviews.customer_id
        AND j.status = 'completed'
    )
  );

CREATE POLICY "Workers can update own worker reviews"
  ON public.worker_reviews FOR UPDATE TO authenticated
  USING (auth.uid() = worker_id)
  WITH CHECK (auth.uid() = worker_id);

-- Timestamp trigger
CREATE TRIGGER touch_worker_reviews BEFORE UPDATE ON public.worker_reviews
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ ADD customer_average_rating TO PROFILES ============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS customer_average_rating NUMERIC(3,2) NOT NULL DEFAULT 0;

-- ============ RECALC CUSTOMER RATING TRIGGER ============
CREATE OR REPLACE FUNCTION public.recalc_customer_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _customer UUID;
  _avg NUMERIC(3,2);
BEGIN
  _customer := COALESCE(NEW.customer_id, OLD.customer_id);

  SELECT COALESCE(ROUND(AVG(rating)::NUMERIC, 2), 0)
    INTO _avg
    FROM public.worker_reviews
    WHERE customer_id = _customer;

  UPDATE public.profiles SET customer_average_rating = _avg WHERE id = _customer;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER worker_reviews_recalc_customer_rating
  AFTER INSERT OR UPDATE OR DELETE ON public.worker_reviews
  FOR EACH ROW EXECUTE FUNCTION public.recalc_customer_rating();
