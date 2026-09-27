-- ---------------------------------------------------------------------------
-- Cap at 1,400.00 EGP, and delivery free everywhere.
--
-- Run this ONCE in the Supabase SQL editor. A project seeded fresh from
-- setup.sql already has both figures.
--
-- ZERO MEANS FREE, NOT "UNSET". That is the actual mechanism: the checkout
-- adds whatever fee_piastres holds, so zero adds nothing. To refuse a
-- destination you delete its row -- you never express it as a fee.
--
-- Safe on a live shop. Orders already placed keep the prices they were
-- placed at: tc_order_items stores unit_price_piastres per line and
-- tc_orders stores its own totals, so nothing already sold is repriced.
-- ---------------------------------------------------------------------------

-- What is about to change, and what has already sold at the old price.
select slug,
       price_piastres / 100 as price_now_egp,
       (select count(*) from tc_order_items i where i.product_id = p.id) as sold_so_far
  from tc_products p
 order by display_order;

update tc_products      set price_piastres = 140000;
update tc_shipping_zones set fee_piastres  = 0;

-- Both caps at 1400, and 27 governorates at 0.
select slug, price_piastres / 100 as price_egp, stock_quantity, active
  from tc_products order by display_order;

select count(*) as zones, max(fee_piastres) as highest_fee
  from tc_shipping_zones;
