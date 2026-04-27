-- Migration: Add phone column to profiles and update handle_new_user trigger
-- Requirements: 4.1, 4.2, 4.3, 4.4, 6.3

-- Step 1: Add phone column (nullable first to allow backfill of existing rows)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone TEXT;

-- Step 2: Backfill existing rows with a sentinel value
UPDATE public.profiles
  SET phone = '+8800000000000_' || id
  WHERE phone IS NULL;

-- Step 3: Apply NOT NULL, UNIQUE, and CHECK constraints
-- The CHECK constraint excludes sentinel values so pre-existing rows remain valid.
ALTER TABLE public.profiles
  ALTER COLUMN phone SET NOT NULL,
  ADD CONSTRAINT profiles_phone_unique UNIQUE (phone),
  ADD CONSTRAINT profiles_phone_format CHECK (
    phone ~ '^\+8801[3-9][0-9]{8}$'
    OR phone LIKE '+8800000000000_%'
  );

-- Step 4: Update handle_new_user to read and persist phone from auth metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _name  TEXT;
  _role  public.app_role;
  _phone TEXT;
BEGIN
  _name  := COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1));
  _role  := COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'customer');
  _phone := NEW.raw_user_meta_data->>'phone';

  IF _phone IS NULL THEN
    RAISE EXCEPTION 'phone is required in user metadata';
  END IF;

  INSERT INTO public.profiles (id, name, email, phone)
  VALUES (NEW.id, _name, NEW.email, _phone);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, _role);

  RETURN NEW;
END;
$$;
