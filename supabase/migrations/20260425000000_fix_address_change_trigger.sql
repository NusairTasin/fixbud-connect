-- Fix guard_address_change_limit: scope it to UPDATE OF shared_address_id only
-- so it doesn't fire on worker_id/status updates, and the auto_share internal
-- UPDATE (SECURITY DEFINER, auth.uid() = null) is exempted from the customer check.

CREATE OR REPLACE FUNCTION public.guard_address_change_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only act when shared_address_id is actually changing
  IF NEW.shared_address_id IS NOT DISTINCT FROM OLD.shared_address_id THEN
    RETURN NEW;
  END IF;

  -- auth.uid() is NULL when called from another SECURITY DEFINER trigger
  -- (e.g. auto_share_default_address). Allow those internal updates through.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only the customer of the job may change the shared address
  IF auth.uid() <> NEW.customer_id THEN
    RAISE EXCEPTION 'Only the job customer can change the address';
  END IF;

  -- Job must be accepted or completed
  IF NEW.status NOT IN ('accepted', 'completed') THEN
    RAISE EXCEPTION 'Address can only be changed after a bid is accepted';
  END IF;

  -- If customer already changed the address once, block further changes
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

  -- Mark that address has been changed (only for explicit customer changes)
  NEW.address_changed = true;

  RETURN NEW;
END;
$$;

-- Re-create trigger scoped to shared_address_id column changes only
DROP TRIGGER IF EXISTS jobs_guard_address_change_limit ON public.job_requests;
CREATE TRIGGER jobs_guard_address_change_limit
  BEFORE UPDATE OF shared_address_id ON public.job_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_address_change_limit();
