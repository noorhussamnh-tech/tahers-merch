-- The confirmation page's lookup.
--
-- When Paymob sends a customer back to the site, the browser arrives carrying
-- an order number and nothing else -- no mobile number to pair it with, so
-- tc_track_order cannot be used. This function fills that gap, and the way it
-- stays safe is by returning nothing worth stealing.
--
-- It deliberately returns LESS than tracking does: no name, no address, no
-- governorate, no timeline, no email. An order number on its own answers one
-- question -- "did this payment go through?" -- and the moment the customer
-- wants anything more they are sent to /track, which asks for the mobile
-- number as well.
create or replace function tc_order_status(p_order_number text)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  o tc_orders%rowtype;
begin
  select * into o from tc_orders
   where upper(order_number) = upper(btrim(p_order_number));

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'orderNumber',      o.order_number,
    'paymentMethod',    o.payment_method,
    'paymentStatus',    o.payment_status,
    'fulfilmentStatus', o.fulfilment_status,
    'total',            o.total_piastres,
    'subtotal',         o.subtotal_piastres,
    'shippingFee',      o.shipping_piastres,
    'discount',         o.discount_piastres,
    'placedAt',         o.created_at,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
               'slug', i.slug, 'name', i.name_ar, 'quantity', i.quantity,
               'unitPrice', i.unit_price_piastres, 'lineTotal', i.line_total_piastres
             ) order by i.slug)
        from tc_order_items i where i.order_id = o.id
    ), '[]'::jsonb)
  );
end;
$$;

comment on function tc_order_status is
  'Payment state for a known order number. Returns no personal data: an order number alone never reveals a customer.';

-- Reached through the server function, which rate-limits it.
revoke execute on function tc_order_status(text) from public, anon, authenticated;
