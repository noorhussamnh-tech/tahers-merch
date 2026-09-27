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
-- Every row below is 80.00 EGP, the courier's national rate. Note the
-- `do nothing`: a governorate that already has a row keeps whatever fee it
-- has, so this will NOT correct an existing row still sitting at 100.00. The
-- update at the bottom does that.
-- ---------------------------------------------------------------------------

insert into tc_shipping_zones (governorate, fee_piastres, cod_available)
values
  ('Cairo', 8000, true),
  ('Giza', 8000, true),
  ('Alexandria', 8000, true),
  ('Dakahlia', 8000, true),
  ('Red Sea', 8000, true),
  ('Beheira', 8000, true),
  ('Fayoum', 8000, true),
  ('Gharbia', 8000, true),
  ('Ismailia', 8000, true),
  ('Menofia', 8000, true),
  ('Minya', 8000, true),
  ('Qalyubia', 8000, true),
  ('New Valley', 8000, true),
  ('Suez', 8000, true),
  ('Aswan', 8000, true),
  ('Assiut', 8000, true),
  ('Beni Suef', 8000, true),
  ('Port Said', 8000, true),
  ('Damietta', 8000, true),
  ('Sharqia', 8000, true),
  ('South Sinai', 8000, true),
  ('Kafr El Sheikh', 8000, true),
  ('Matrouh', 8000, true),
  ('Luxor', 8000, true),
  ('Qena', 8000, true),
  ('North Sinai', 8000, true),
  ('Sohag', 8000, true)
on conflict (governorate) do nothing;

-- Bring every existing row to the same rate, including ones inserted before
-- the courier was arranged. Run this whether or not the insert above added
-- anything.
update tc_shipping_zones set fee_piastres = 8000;

-- Should return 27 rows, all at 80. Read the fee column: it is what you charge.
select governorate,
       fee_piastres / 100 as fee_egp,
       cod_available,
       min_days,
       max_days
  from tc_shipping_zones
 order by governorate;
