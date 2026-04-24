-- ============================================================
-- Fix 1: Convert auto_share_default_address from AFTER to BEFORE
--   so it sets NEW.shared_address_id directly instead of doing
--   a second UPDATE (which re-triggers guard_address_change_limit).
-- Fix 2: Re-scope guard_address_change_limit to UPDATE OF shared_address_id
--   and add auth.uid() IS NULL guard for internal calls.
-- ============================================================

-- Drop the old AFTER trigger first
DROP TRIGGER IF EXISTS jobs_auto_share_default_address ON public.job_requests;

-- Recreate as BEFORE UPDATE OF status so we can set NEW directly
CREATE OR REPLACE FUNCTION public.auto_share_default_address()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _default_addr_id UUID;
BEGIN
  -- Only when transitioning pending -> accepted with no address yet
  IF NEW.status = 'accepted'
     AND OLD.status = 'pending'
     AND NEW.shared_address_id IS NULL THEN

    SELECT default_address_id INTO _default_addr_id
      FROM public.profiles
      WHERE id = NEW.customer_id;

    IF _default_addr_id IS NOT NULL THEN
      NEW.shared_address_id        := _default_addr_id;
      NEW.original_shared_address_id := _default_addr_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER jobs_auto_share_default_address
  BEFORE UPDATE OF status ON public.job_requests
  FOR EACH ROW EXECUTE FUNCTION public.auto_share_default_address();

-- ============================================================
-- Fix guard_address_change_limit:
--   - Scope to UPDATE OF shared_address_id only (won't fire on status/worker_id changes)
--   - auth.uid() IS NULL escape for any remaining internal calls
-- ============================================================

DROP TRIGGER IF EXISTS jobs_guard_address_change_limit ON public.job_requests;

CREATE OR REPLACE FUNCTION public.guard_address_change_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Scoped to shared_address_id changes only, but double-check anyway
  IF NEW.shared_address_id IS NOT DISTINCT FROM OLD.shared_address_id THEN
    RETURN NEW;
  END IF;

  -- Allow internal SECURITY DEFINER calls (auth.uid() is null in that context)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only the customer may change the shared address
  IF auth.uid() <> NEW.customer_id THEN
    RAISE EXCEPTION 'Only the job customer can change the address';
  END IF;

  IF NEW.status NOT IN ('accepted', 'completed') THEN
    RAISE EXCEPTION 'Address can only be changed after a bid is accepted';
  END IF;

  IF OLD.address_changed THEN
    RAISE EXCEPTION 'You have already changed the address once. No further changes are allowed';
  END IF;

  IF NEW.shared_address_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.addresses
      WHERE id = NEW.shared_address_id AND user_id = NEW.customer_id
    ) THEN
      RAISE EXCEPTION 'You can only share one of your own saved addresses';
    END IF;
  END IF;

  NEW.address_changed := true;
  RETURN NEW;
END;
$$;

CREATE TRIGGER jobs_guard_address_change_limit
  BEFORE UPDATE OF shared_address_id ON public.job_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_address_change_limit();
