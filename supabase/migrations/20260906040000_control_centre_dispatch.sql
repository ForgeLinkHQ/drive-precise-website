-- Mirror operational website events into the Drive Precise Control Centre.
-- The customer-facing write remains decoupled from all network calls: the existing
-- owner_alert_queue is still the durable event queue and pg_net dispatches asynchronously.

create or replace function public.alert_on_new_enquiry()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_settings public.owner_alert_settings%rowtype;
begin
  select * into v_settings from public.owner_alert_settings where id = 1;
  if coalesce(v_settings.on_new_enquiry, true) then
    perform public.enqueue_owner_alert('new_enquiry', jsonb_build_object(
      'enquiry_id', new.id,
      'reference', new.reference,
      'customer_name', new.customer_name,
      'phone', new.customer_phone,
      'customer_email', new.customer_email,
      'registration', new.registration,
      'mileage', new.mileage,
      'vehicle_notes', new.vehicle_notes,
      'postcode', new.postcode,
      'items', new.items,
      'indicative_total_gbp', new.indicative_total_gbp,
      'preferred_date', new.preferred_date,
      'preferred_window', new.preferred_window
    ));
  end if;
  return new;
end;
$$;

create or replace function public.alert_on_quote_accepted()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_settings public.owner_alert_settings%rowtype;
begin
  if new.status = 'quote_accepted' and old.status is distinct from 'quote_accepted' then
    select * into v_settings from public.owner_alert_settings where id = 1;
    if coalesce(v_settings.on_quote_accepted, true) then
      perform public.enqueue_owner_alert('quote_accepted', jsonb_build_object(
        'enquiry_id', new.id,
        'reference', new.reference,
        'customer_name', new.customer_name,
        'phone', new.customer_phone,
        'customer_email', new.customer_email,
        'registration', new.registration,
        'mileage', new.mileage,
        'vehicle_notes', new.vehicle_notes,
        'postcode', new.postcode,
        'items', new.items,
        'quoted_total_gbp', new.quoted_total_gbp,
        'preferred_date', new.preferred_date,
        'preferred_window', new.preferred_window
      ));
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.dispatch_owner_alerts()
returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_url text := current_setting('app.settings.functions_url', true);
  v_key text := current_setting('app.settings.service_role_key', true);
  v_count int := 0;
begin
  if v_url is null or v_key is null then
    raise warning 'dispatch_owner_alerts: functions_url or service_role_key unset';
    return 0;
  end if;

  for r in
    select id, event, detail from public.owner_alert_queue
      where sent_at is null order by created_at limit 50
  loop
    update public.owner_alert_queue set sent_at = now() where id = r.id;

    perform net.http_post(
      url := v_url || '/notify-owner',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_key,
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('event', r.event, 'detail', r.detail)
    );

    -- Same event, second consumer. The forwarding Edge Function owns its own
    -- destination credentials and deliberately degrades to a no-op until configured.
    perform net.http_post(
      url := v_url || '/sync-control-centre',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_key,
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('event', r.event, 'detail', r.detail)
    );

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.dispatch_owner_alerts() from public, anon, authenticated;
grant execute on function public.dispatch_owner_alerts() to service_role;
