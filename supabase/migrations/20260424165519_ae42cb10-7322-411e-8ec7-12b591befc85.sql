
-- 1. Extend profiles with worker address fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS address_line1 TEXT,
  ADD COLUMN IF NOT EXISTS address_line2 TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS postal_code TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;

-- 2. Saved addresses for customers (and reusable by anyone)
CREATE TABLE IF NOT EXISTS public.addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city TEXT NOT NULL,
  region TEXT,
  postal_code TEXT,
  country TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_addresses_user ON public.addresses(user_id);

ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own addresses"
  ON public.addresses FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own addresses"
  ON public.addresses FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own addresses"
  ON public.addresses FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own addresses"
  ON public.addresses FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER touch_addresses_updated_at
  BEFORE UPDATE ON public.addresses
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Ensure only one default address per user
CREATE OR REPLACE FUNCTION public.enforce_single_default_address()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE public.addresses
       SET is_default = false
     WHERE user_id = NEW.user_id
       AND id <> NEW.id
       AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER addresses_single_default
  AFTER INSERT OR UPDATE OF is_default ON public.addresses
  FOR EACH ROW EXECUTE FUNCTION public.enforce_single_default_address();

-- 3. Job requests gain a shared address pointer
ALTER TABLE public.job_requests
  ADD COLUMN IF NOT EXISTS shared_address_id UUID REFERENCES public.addresses(id) ON DELETE SET NULL;

-- Allow assigned worker to read the shared address
CREATE POLICY "Assigned worker can view shared job address"
  ON public.addresses FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.job_requests j
      WHERE j.shared_address_id = addresses.id
        AND j.worker_id = auth.uid()
    )
  );

-- 4. Require worker location before bidding
CREATE OR REPLACE FUNCTION public.require_worker_location()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _lat DOUBLE PRECISION;
  _lng DOUBLE PRECISION;
BEGIN
  SELECT lat, lng INTO _lat, _lng
    FROM public.profiles
    WHERE id = NEW.worker_id;

  IF _lat IS NULL OR _lng IS NULL THEN
    RAISE EXCEPTION 'You must add your address on your profile before placing a bid';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER bids_require_worker_location
  BEFORE INSERT ON public.bids
  FOR EACH ROW EXECUTE FUNCTION public.require_worker_location();

-- 5. Guard shared_address_id on jobs
CREATE OR REPLACE FUNCTION public.guard_shared_address()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _addr_owner UUID;
BEGIN
  IF NEW.shared_address_id IS DISTINCT FROM OLD.shared_address_id THEN
    -- Only the customer of the job may set it
    IF auth.uid() <> NEW.customer_id THEN
      RAISE EXCEPTION 'Only the job customer can share an address';
    END IF;

    -- Job must already be accepted (or completed)
    IF NEW.status NOT IN ('accepted', 'completed') THEN
      RAISE EXCEPTION 'Address can only be shared after a bid is accepted';
    END IF;

    -- Validate address ownership (when not clearing)
    IF NEW.shared_address_id IS NOT NULL THEN
      SELECT user_id INTO _addr_owner
        FROM public.addresses
        WHERE id = NEW.shared_address_id;

      IF _addr_owner IS NULL THEN
        RAISE EXCEPTION 'Address not found';
      END IF;

      IF _addr_owner <> NEW.customer_id THEN
        RAISE EXCEPTION 'You can only share one of your own saved addresses';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER jobs_guard_shared_address
  BEFORE UPDATE OF shared_address_id ON public.job_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_shared_address();
