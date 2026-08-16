-- Roles, and the one helper every other policy in this schema is built on.
--
-- The role lives in its own table rather than on a column of a profile, and
-- the check runs through a SECURITY DEFINER function rather than a subquery
-- inside each policy. Both choices are about the same failure: a policy that
-- reads a table which is itself protected by a policy recurses, and Postgres
-- resolves that by denying the row. Putting the lookup in a definer function
-- takes it outside RLS entirely, so the answer is the same everywhere and
-- there is exactly one place to audit.

CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id    UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'staff')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- A signed-in user may see which roles they hold, and nothing about anyone
-- else's. Granting roles is a service-role operation, deliberately: there is no
-- policy here that lets a user give themselves one.
CREATE POLICY "own_roles_readable" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_admin_role()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
  );
$$;

-- Staff can see the work but not the money. Used by the enquiry policies so a
-- future employee can be given the operational view without the commercial one.
CREATE OR REPLACE FUNCTION public.has_staff_role()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin', 'staff')
  );
$$;

REVOKE ALL ON FUNCTION public.has_admin_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_staff_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_admin_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_staff_role() TO authenticated;

-- `updated_at` maintenance, shared by every table below.
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
