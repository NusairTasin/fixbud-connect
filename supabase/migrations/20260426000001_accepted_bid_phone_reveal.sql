-- Migration: Phone reveal for accepted bids
-- Requirements: 3.1, 3.2, 3.3, 3.4

-- ============ profiles_public VIEW ============
-- Exposes all profile columns EXCEPT phone.
-- Existing queries that join profiles for name, average_rating, etc.
-- should be migrated to join this view instead.
CREATE OR REPLACE VIEW public.profiles_public
  WITH (security_barrier = true)
AS
SELECT
  id, name, email, average_rating,
  address_line1, address_line2, city, region,
  postal_code, country, lat, lng,
  default_address_id, created_at, updated_at
  -- phone intentionally excluded
FROM public.profiles;

-- ============ get_contact_phone FUNCTION ============
-- Returns the phone number of target_user_id only when an accepted or
-- completed job_request links auth.uid() to target_user_id (either direction).
-- Returns NULL (not an error) when no qualifying relationship exists.
CREATE OR REPLACE FUNCTION public.get_contact_phone(target_user_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.phone
  FROM public.profiles p
  WHERE p.id = target_user_id
    AND (
      -- Caller is the worker on an accepted/completed job owned by target customer
      EXISTS (
        SELECT 1 FROM public.job_requests j
        WHERE j.customer_id = target_user_id
          AND j.worker_id   = auth.uid()
          AND j.status IN ('accepted', 'completed')
      )
      OR
      -- Caller is the customer on an accepted/completed job assigned to target worker
      EXISTS (
        SELECT 1 FROM public.job_requests j
        WHERE j.worker_id   = target_user_id
          AND j.customer_id = auth.uid()
          AND j.status IN ('accepted', 'completed')
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_contact_phone(UUID) TO authenticated;
