-- ---------------------------------------------------------------------------
-- Open delivery to every governorate in Egypt.
--
-- Run this ONCE in the Supabase SQL editor, on a project that was narrowed to
-- Cairo and Giza while there was no courier for the rest of the country. A
-- project seeded fresh from setup.sql already has all 27 and does not need it.
--
-- `on conflict do nothing` rather than an upsert: any fee, cash-on-delivery
-- setting or delivery estimate already tuned in /admin for a governorate is
-- left exactly as it is. This only ADDS the missing destinations.
--
-- Safe on a live shop. Nothing already ordered is affected.
--
-- AFTER RUNNING IT, CHECK THE FEES. Every row below is 100.00 EGP, which is
-- the figure supplied when the shop only delivered across Cairo. If the
-- courier charges more to reach Upper Egypt or Sinai -- and most do -- those
-- orders are sold at a loss until the real rates are set in /admin -> Shipping.
-- ---------------------------------------------------------------------------

insert into tc_shipping_zones (governorate, fee_piastres, cod_available)
values
  ('Cairo', 10000, true),
  ('Giza', 10000, true),
  ('Alexandria', 10000, true),
  ('Dakahlia', 10000, true),
  ('Red Sea', 10000, true),
  ('Beheira', 10000, true),
  ('Fayoum', 10000, true),
  ('Gharbia', 10000, true),
  ('Ismailia', 10000, true),
  ('Menofia', 10000, true),
  ('Minya', 10000, true),
  ('Qalyubia', 10000, true),
  ('New Valley', 10000, true),
  ('Suez', 10000, true),
  ('Aswan', 10000, true),
  ('Assiut', 10000, true),
  ('Beni Suef', 10000, true),
  ('Port Said', 10000, true),
  ('Damietta', 10000, true),
  ('Sharqia', 10000, true),
  ('South Sinai', 10000, true),
  ('Kafr El Sheikh', 10000, true),
  ('Matrouh', 10000, true),
  ('Luxor', 10000, true),
  ('Qena', 10000, true),
  ('North Sinai', 10000, true),
  ('Sohag', 10000, true)
on conflict (governorate) do nothing;

-- Should return 27 rows. Read the fee column: it is what you are charging.
select governorate,
       fee_piastres / 100 as fee_egp,
       cod_available,
       min_days,
       max_days
  from tc_shipping_zones
 order by governorate;
