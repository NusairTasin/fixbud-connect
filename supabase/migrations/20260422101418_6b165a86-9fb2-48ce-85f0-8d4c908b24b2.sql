
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION public.guard_job_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'pending' AND NEW.status IN ('accepted', 'cancelled') THEN
    RETURN NEW;
  ELSIF OLD.status = 'accepted' AND NEW.status IN ('completed', 'cancelled') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Illegal job status transition: % -> %', OLD.status, NEW.status;
END;
$$;
