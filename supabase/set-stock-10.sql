-- ---------------------------------------------------------------------------
-- The first run is 10 of each cap, not 20.
--
-- Run this ONCE in the Supabase SQL editor. It is for a project that was
-- already seeded with the old figure -- a fresh project seeded from setup.sql
-- already has 10 and does not need it.
--
-- It sets the stock rather than subtracting, so running it twice is harmless.
--
-- Safe on a live shop: `stock_quantity` is what is left to sell, and it is
-- separate from `reserved_quantity`, so this cannot disturb an order that is
-- mid-checkout. If more than 10 of a cap have somehow already sold, this would
-- set the number back up -- check the first query before running the update.
-- ---------------------------------------------------------------------------

-- Look before you change. If `sold_so_far` is anything but 0, stop and ask.
select slug,
       stock_quantity   as stock_now,
       reserved_quantity as on_hold,
       (select count(*) from tc_order_items i where i.product_id = p.id) as sold_so_far
  from tc_products p
 order by display_order;

update tc_products set stock_quantity = 10;

-- Should show 10 against both caps.
select slug, stock_quantity, reserved_quantity, active
  from tc_products
 order by display_order;
