-- ---------------------------------------------------------------------------
-- Close delivery down to Cairo and Giza.
--
-- Run this ONCE, in the Supabase SQL editor, on a project that was seeded
-- before the delivery area was decided -- it had all 27 governorates. A fresh
-- project seeded from setup.sql already has only these two and does not need
-- it.
--
-- Why deleting rather than zeroing: the storefront quotes delivery from
-- tc_shipping_zones, and a governorate with no row cannot be quoted, so
-- checkout refuses it. Setting the fee to 0 would not refuse anything -- it
-- would offer free delivery to Aswan.
--
-- Safe to run on a live shop. Orders keep their own copy of the address, so
-- nothing already placed is affected; only future destinations change.
-- Reversible: re-insert any row, from here or from /admin.
-- ---------------------------------------------------------------------------

-- What is about to go. Read it before running the delete.
select governorate, fee_piastres
  from tc_shipping_zones
 where governorate not in ('Cairo', 'Giza')
 order by governorate;

delete from tc_shipping_zones
 where governorate not in ('Cairo', 'Giza');

-- Make sure the two that matter are actually there, at 100.00 EGP, with cash
-- on delivery on. Harmless if they already are.
insert into tc_shipping_zones (governorate, fee_piastres, cod_available)
values ('Cairo', 10000, true),
       ('Giza',  10000, true)
on conflict (governorate) do nothing;

-- Should return exactly two rows: Cairo and Giza.
select governorate, fee_piastres / 100 as fee_egp, cod_available
  from tc_shipping_zones
 order by governorate;
