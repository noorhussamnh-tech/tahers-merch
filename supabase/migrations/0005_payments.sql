-- Payment settlement.
--
-- These functions are called only from the verified webhook handler, after it
-- has checked Paymob's HMAC. They are written so that calling them twice is
-- harmless, because a payment gateway *will* deliver the same event twice and
-- the second delivery must not deduct stock again or flip a settled order.

-- Attaches the gateway's references to an order once the intention is made,
-- so a transaction can be reconciled against the Paymob dashboard later.
create or replace function tc_attach_payment_reference(
  p_order_number   text,
  p_intention_id   text,
  p_paymob_order_id text
) returns void
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
begin
  update tc_orders
     set paymob_intention_id = p_intention_id,
         paymob_order_id     = p_paymob_order_id
   where order_number = p_order_number;

  if not found then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------- confirming

-- Marks an order paid and converts its reservation into a real deduction.
--
-- Three things have to be true before that happens, and each is checked here
-- rather than trusted from the caller: the order exists, it has not already
-- been settled, and the amount the gateway captured equals the total we
-- recorded. An amount mismatch is refused outright -- it means the customer
-- was charged something other than what this order says, and no amount of
-- retrying makes that safe to accept.
create or replace function tc_confirm_payment(
  p_order_number    text,
  p_transaction_id  text,
  p_amount_piastres integer,
  p_event_id        text,
  p_payload         jsonb
) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  o    tc_orders%rowtype;
  item record;
begin
  -- Duplicate protection. The unique (provider, event_id) means the second
  -- delivery of the same event inserts nothing and returns here, having
  -- changed no stock and no status.
  insert into tc_payment_events (provider, event_id, payload)
       values ('paymob', p_event_id, p_payload)
  on conflict (provider, event_id) do nothing;

  if not found then
    return jsonb_build_object('result', 'duplicate_event', 'orderNumber', p_order_number);
  end if;

  select * into o from tc_orders where order_number = p_order_number for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;

  update tc_payment_events set order_id = o.id
   where provider = 'paymob' and event_id = p_event_id;

  -- Already settled: acknowledge without doing the work twice.
  if o.payment_status = 'paid' then
    return jsonb_build_object('result', 'already_paid', 'orderNumber', o.order_number);
  end if;

  if p_amount_piastres is distinct from o.total_piastres then
    -- Recorded, not silently dropped: a mismatch is a reconciliation problem
    -- somebody has to look at, and the order stays unpaid in the meantime.
    insert into tc_order_status_history (order_id, status, note)
         values (o.id, o.fulfilment_status,
                 format('Payment amount mismatch: gateway reported %s, order total is %s.',
                        p_amount_piastres, o.total_piastres));
    raise exception 'amount_mismatch:%:%', p_amount_piastres, o.total_piastres
      using errcode = 'P0001';
  end if;

  -- Convert the hold into a deduction. Skipped when stock was already
  -- committed, which is how a cash order that somehow gets paid online, or a
  -- re-confirmation after a manual fix, avoids double-counting.
  if not o.stock_committed then
    for item in select * from tc_order_items where order_id = o.id order by slug loop
      update tc_products
         set stock_quantity    = stock_quantity - item.quantity,
             reserved_quantity = greatest(reserved_quantity - item.quantity, 0)
       where id = item.product_id;
    end loop;
  end if;

  update tc_orders
     set payment_status         = 'paid',
         paymob_transaction_id  = p_transaction_id,
         stock_committed        = true,
         reservation_expires_at = null,
         -- Paying confirms the order; fulfilment starts from there.
         fulfilment_status      = case when fulfilment_status = 'placed'
                                       then 'confirmed' else fulfilment_status end
   where id = o.id;

  insert into tc_order_status_history (order_id, status, note)
       values (o.id, 'confirmed', 'Payment confirmed by verified Paymob webhook.');

  return jsonb_build_object('result', 'confirmed', 'orderNumber', o.order_number);
end;
$$;

-- ------------------------------------------------------------------ failing

-- Releases a hold after a declined, cancelled or abandoned online payment.
create or replace function tc_fail_payment(
  p_order_number text,
  p_status       text,
  p_event_id     text,
  p_payload      jsonb default '{}'::jsonb
) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  o    tc_orders%rowtype;
  item record;
begin
  if p_status not in ('failed', 'cancelled') then
    raise exception 'invalid_payment_status' using errcode = 'P0001';
  end if;

  if p_event_id is not null then
    insert into tc_payment_events (provider, event_id, payload)
         values ('paymob', p_event_id, p_payload)
    on conflict (provider, event_id) do nothing;
    if not found then
      return jsonb_build_object('result', 'duplicate_event', 'orderNumber', p_order_number);
    end if;
  end if;

  select * into o from tc_orders where order_number = p_order_number for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;

  -- A paid order is never walked backwards by a late failure event.
  if o.payment_status = 'paid' then
    return jsonb_build_object('result', 'already_paid', 'orderNumber', o.order_number);
  end if;

  if not o.stock_committed then
    for item in select * from tc_order_items where order_id = o.id order by slug loop
      update tc_products
         set reserved_quantity = greatest(reserved_quantity - item.quantity, 0)
       where id = item.product_id;
    end loop;
  end if;

  update tc_orders
     set payment_status         = p_status,
         reservation_expires_at = null
   where id = o.id;

  insert into tc_order_status_history (order_id, status, note)
       values (o.id, o.fulfilment_status, format('Payment %s; reservation released.', p_status));

  return jsonb_build_object('result', p_status, 'orderNumber', o.order_number);
end;
$$;

-- --------------------------------------------------------------- expiry sweep

-- Releases reservations whose payment window has passed.
--
-- Run it on a schedule (pg_cron, or any scheduled job that can call an RPC).
-- Without it, an abandoned checkout holds the last cap until somebody
-- notices -- Paymob does not always send a cancellation for a customer who
-- simply closes the tab.
create or replace function tc_release_expired_reservations()
returns integer
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  o        record;
  item     record;
  released integer := 0;
begin
  for o in
    select * from tc_orders
     where stock_committed = false
       and payment_status = 'pending'
       and reservation_expires_at is not null
       and reservation_expires_at < now()
     order by created_at
       for update skip locked
  loop
    for item in select * from tc_order_items where order_id = o.id order by slug loop
      update tc_products
         set reserved_quantity = greatest(reserved_quantity - item.quantity, 0)
       where id = item.product_id;
    end loop;

    update tc_orders
       set payment_status = 'cancelled', reservation_expires_at = null
     where id = o.id;

    insert into tc_order_status_history (order_id, status, note)
         values (o.id, o.fulfilment_status, 'Payment window expired; reservation released.');

    released := released + 1;
  end loop;

  return released;
end;
$$;

revoke execute on function tc_attach_payment_reference(text, text, text) from public, anon, authenticated;
revoke execute on function tc_confirm_payment(text, text, integer, text, jsonb) from public, anon, authenticated;
revoke execute on function tc_fail_payment(text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function tc_release_expired_reservations() from public, anon, authenticated;
