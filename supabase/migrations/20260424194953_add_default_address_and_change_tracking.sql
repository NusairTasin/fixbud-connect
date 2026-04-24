-- ============ ADD DEFAULT ADDRESS TO PROFILES ============
-- Track which address is the customer's default
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS default_address_id UUID REFERENCES public.addresses(id) ON DELETE SET NULL;

-- ============ ADD ADDRESS CHANGE TRACKING TO JOB REQUESTS ============
-- Track if customer has changed address after offer accepted
-- and what the originally-shared address was
ALTER TABLE public.job_requests
  ADD COLUMN IF NOT EXISTS original_shared_address_id UUID REFERENCES public.addresses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS address_changed BOOLEAN NOT NULL DEFAULT false;

-- ============ ENSURE CONSISTENCY: default_address_id MUST BELONG TO USER ============
CREATE OR REPLACE FUNCTION public.validate_default_address()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _addr_user_id UUID;
BEGIN
  IF NEW.default_address_id IS DISTINCT FROM OLD.default_address_id THEN
    -- Verify address belongs to this user (if not null)
    IF NEW.default_address_id IS NOT NULL THEN
      SELECT user_id INTO _addr_user_id
        FROM public.addresses
        WHERE id = NEW.default_address_id;

      IF _addr_user_id IS NULL THEN
        RAISE EXCEPTION 'Address not found';
      END IF;

      IF _addr_user_id <> NEW.id THEN
        RAISE EXCEPTION 'You can only set your own addresses as default';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_validate_default_address ON public.profiles;
CREATE TRIGGER profiles_validate_default_address
  BEFORE UPDATE OF default_address_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.validate_default_address();

-- ============ AUTO-SHARE DEFAULT ADDRESS WHEN BID ACCEPTED ============
-- When a bid is accepted, automatically share the customer's default address
CREATE OR REPLACE FUNCTION public.auto_share_default_address()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _customer_id UUID;
  _default_addr_id UUID;
BEGIN
  -- When job is accepted and shared_address_id is still null
  IF NEW.status = 'accepted' 
     AND OLD.status = 'pending'
     AND NEW.shared_address_id IS NULL THEN
    
    -- Get customer's default address
    SELECT default_address_id INTO _default_addr_id
      FROM public.profiles
      WHERE id = NEW.customer_id;

    -- Share the default address if customer has one
    IF _default_addr_id IS NOT NULL THEN
      UPDATE public.job_requests
        SET shared_address_id = _default_addr_id,
            original_shared_address_id = _default_addr_id
        WHERE id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS jobs_auto_share_default_address ON public.job_requests;
CREATE TRIGGER jobs_auto_share_default_address
  AFTER UPDATE OF status ON public.job_requests
  FOR EACH ROW EXECUTE FUNCTION public.auto_share_default_address();

-- ============ ENFORCE ONE-TIME ADDRESS CHANGE AFTER ACCEPTANCE ============
-- Once address_changed is set to true, it cannot change the address again
CREATE OR REPLACE FUNCTION public.guard_address_change_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If trying to change the shared_address_id
  IF NEW.shared_address_id IS DISTINCT FROM OLD.shared_address_id THEN
    -- Only customer can do this
    IF auth.uid() <> NEW.customer_id THEN
      RAISE EXCEPTION 'Only the job customer can change the address';
    END IF;

    -- Job must be accepted (not pending or completed)
    IF NEW.status NOT IN ('accepted', 'completed') THEN
      RAISE EXCEPTION 'Address can only be changed after a bid is accepted';
    END IF;

    -- If customer already changed the address once, prevent further changes
    IF OLD.address_changed THEN
      RAISE EXCEPTION 'You have already changed the address once. No further changes are allowed';
    END IF;

    -- Validate new address ownership
    IF NEW.shared_address_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.addresses
        WHERE id = NEW.shared_address_id
          AND user_id = NEW.customer_id
      ) THEN
        RAISE EXCEPTION 'You can only share one of your own saved addresses';
      END IF;
    END IF;

    -- Mark that address has been changed
    NEW.address_changed = true;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS jobs_guard_address_change_limit ON public.job_requests;
CREATE TRIGGER jobs_guard_address_change_limit
  BEFORE UPDATE ON public.job_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_address_change_limit();

-- ============ UPDATE RLS POLICY: WORKERS CAN VIEW SHARED ADDRESSES ============
-- Update the existing policy to use the new tracking columns if needed
-- (The existing policy in 20260424165519 should still work, but this ensures consistency)
DROP POLICY IF EXISTS "Assigned worker can view shared job address" ON public.addresses;
CREATE POLICY "Assigned worker can view shared job address"
  ON public.addresses FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.job_requests j
      WHERE (j.shared_address_id = addresses.id OR j.original_shared_address_id = addresses.id)
        AND j.worker_id = auth.uid()
        AND j.status IN ('accepted', 'completed')
    )
  );
