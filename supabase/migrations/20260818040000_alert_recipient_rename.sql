-- Move the alert recipient out of the way.
--
-- `owner_alert_settings` has to become the per-event table in the next
-- migration, because that is what the name means everywhere else on the
-- platform and what the Portal's shared alert panel reads. This site was using
-- that name for a row holding one email address.
--
-- A rename rather than a copy-and-drop: it keeps whatever address was
-- configured, with no data migration to get wrong. The `on_*` booleans come
-- with it and are read, then dropped, by the migration that follows — which is
-- why this is two files rather than one. A rename and a recreate of the same
-- name in a single file is also unparseable by the schema snapshot builder,
-- which reads migrations rather than running them.

ALTER TABLE public.owner_alert_settings RENAME TO owner_alert_recipient;

DROP POLICY IF EXISTS "admin_manage_alert_recipient" ON public.owner_alert_recipient;
CREATE POLICY "admin_manage_alert_recipient" ON public.owner_alert_recipient
  FOR ALL TO authenticated
  USING (public.has_admin_role()) WITH CHECK (public.has_admin_role());

INSERT INTO public.owner_alert_recipient (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.owner_alert_recipient IS
  'Where owner alerts go. One row. Null notify_email falls back to the owner login address.';
