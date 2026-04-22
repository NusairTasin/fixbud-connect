
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('customer', 'worker');
CREATE TYPE public.job_status AS ENUM ('pending', 'accepted', 'completed', 'cancelled');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  average_rating NUMERIC(3,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX profiles_email_idx ON public.profiles(lower(email));

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by authenticated users"
  ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
CREATE INDEX user_roles_user_id_idx ON public.user_roles(user_id);
CREATE INDEX user_roles_role_idx ON public.user_roles(role);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer role check (prevents recursive RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policies — only the system (via SECURITY DEFINER trigger) assigns roles

-- ============ SERVICE CATEGORIES ============
CREATE TABLE public.service_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX service_categories_slug_idx ON public.service_categories(slug);

ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Categories viewable by authenticated users"
  ON public.service_categories FOR SELECT TO authenticated USING (true);

-- ============ JOB REQUESTS ============
CREATE TABLE public.job_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  worker_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  category_id UUID NOT NULL REFERENCES public.service_categories(id) ON DELETE RESTRICT,
  status public.job_status NOT NULL DEFAULT 'pending',
  budget NUMERIC(12,2) NOT NULL CHECK (budget >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX job_requests_customer_idx ON public.job_requests(customer_id);
CREATE INDEX job_requests_worker_idx ON public.job_requests(worker_id) WHERE worker_id IS NOT NULL;
CREATE INDEX job_requests_category_idx ON public.job_requests(category_id);
CREATE INDEX job_requests_status_idx ON public.job_requests(status);

ALTER TABLE public.job_requests ENABLE ROW LEVEL SECURITY;

-- Customers see their own jobs; workers see pending + their assigned jobs
CREATE POLICY "Customers view own jobs"
  ON public.job_requests FOR SELECT TO authenticated
  USING (auth.uid() = customer_id);

CREATE POLICY "Workers view pending and assigned jobs"
  ON public.job_requests FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'worker')
    AND (status = 'pending' OR worker_id = auth.uid())
  );

-- Only customers can post jobs (and only as themselves)
CREATE POLICY "Customers can create jobs"
  ON public.job_requests FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'customer')
    AND auth.uid() = customer_id
    AND status = 'pending'
    AND worker_id IS NULL
  );

-- Customers can update/cancel their own jobs
CREATE POLICY "Customers can update own jobs"
  ON public.job_requests FOR UPDATE TO authenticated
  USING (auth.uid() = customer_id AND public.has_role(auth.uid(), 'customer'))
  WITH CHECK (auth.uid() = customer_id);

-- Workers can update jobs they accepted (or accept a pending one)
CREATE POLICY "Workers can update jobs they own or accept pending"
  ON public.job_requests FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'worker')
    AND (worker_id = auth.uid() OR (status = 'pending' AND worker_id IS NULL))
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'worker')
    AND worker_id = auth.uid()
  );

-- ============ REVIEWS ============
CREATE TABLE public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL UNIQUE REFERENCES public.job_requests(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX reviews_worker_idx ON public.reviews(worker_id);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reviews viewable by authenticated users"
  ON public.reviews FOR SELECT TO authenticated USING (true);

CREATE POLICY "Customers can review their own completed jobs"
  ON public.reviews FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = customer_id
    AND EXISTS (
      SELECT 1 FROM public.job_requests j
      WHERE j.id = job_id
        AND j.customer_id = auth.uid()
        AND j.worker_id = reviews.worker_id
        AND j.status = 'completed'
    )
  );

CREATE POLICY "Customers can update own reviews"
  ON public.reviews FOR UPDATE TO authenticated
  USING (auth.uid() = customer_id)
  WITH CHECK (auth.uid() = customer_id);

-- ============ TIMESTAMP TRIGGER ============
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER touch_profiles BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_service_categories BEFORE UPDATE ON public.service_categories
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_job_requests BEFORE UPDATE ON public.job_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_reviews BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ AUTO-CREATE PROFILE + ROLE ON SIGNUP ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _name TEXT;
  _role public.app_role;
BEGIN
  _name := COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1));
  _role := COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'customer');

  INSERT INTO public.profiles (id, name, email)
  VALUES (NEW.id, _name, NEW.email);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, _role);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ AUTO-RECALC AVERAGE RATING ============
CREATE OR REPLACE FUNCTION public.recalc_worker_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _worker UUID;
  _avg NUMERIC(3,2);
BEGIN
  _worker := COALESCE(NEW.worker_id, OLD.worker_id);

  SELECT COALESCE(ROUND(AVG(rating)::NUMERIC, 2), 0)
    INTO _avg
    FROM public.reviews
    WHERE worker_id = _worker;

  UPDATE public.profiles SET average_rating = _avg WHERE id = _worker;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER reviews_recalc_rating
  AFTER INSERT OR UPDATE OR DELETE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.recalc_worker_rating();

-- ============ STATUS-TRANSITION GUARD ============
CREATE OR REPLACE FUNCTION public.guard_job_status()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Allowed transitions:
  -- pending  -> accepted, cancelled
  -- accepted -> completed, cancelled
  -- completed/cancelled -> (terminal)
  IF OLD.status = 'pending' AND NEW.status IN ('accepted', 'cancelled') THEN
    RETURN NEW;
  ELSIF OLD.status = 'accepted' AND NEW.status IN ('completed', 'cancelled') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Illegal job status transition: % -> %', OLD.status, NEW.status;
END;
$$;

CREATE TRIGGER job_requests_guard_status
  BEFORE UPDATE OF status ON public.job_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_job_status();

-- ============ SEED CATEGORIES ============
INSERT INTO public.service_categories (name, slug, description) VALUES
  ('Plumbing', 'plumbing', 'Leaks, pipes, fixtures, and water systems.'),
  ('Electrical', 'electrical', 'Wiring, outlets, lighting, and electrical repairs.'),
  ('Carpentry', 'carpentry', 'Custom woodwork, framing, and repairs.'),
  ('Painting', 'painting', 'Interior and exterior painting services.'),
  ('Cleaning', 'cleaning', 'Deep cleaning and regular home maintenance.'),
  ('Appliance Repair', 'appliance-repair', 'Fridges, washers, dryers, and more.'),
  ('HVAC', 'hvac', 'Heating, ventilation, and air conditioning.'),
  ('General Handyman', 'general-handyman', 'Odd jobs, mounting, assembly, and small repairs.');
