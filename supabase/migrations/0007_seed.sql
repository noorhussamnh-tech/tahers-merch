-- Seed: the two caps, their five photographs each, and every Egyptian
-- governorate as a shipping destination.
--
-- IMPORTANT -- this seed deliberately ships the store CLOSED.
--
-- Both products are created with `active = false`, a price of 0 and no stock,
-- and every shipping zone is created with a fee of 0. None of those are real
-- numbers, because the business has not supplied them (see
-- docs/MISSING-INFORMATION.md). An inactive product cannot be read by the
-- storefront, cannot be added to a cart and cannot be ordered, so there is no
-- window in which a deploy could sell a cap for nothing.
--
-- Opening the store is a deliberate act: set the price and stock, then
-- activate, from /admin or with the statements at the bottom of this file.

insert into tc_products (slug, name_ar, description_ar, price_piastres, stock_quantity, active, display_order)
values
  ('taiwan',  'تايوان يا ريس',        'كاب مطرّز بعبارة «تايوان يا ريس».',      0, 0, false, 1),
  ('al-adou', 'العدو ليس بهذه القوة', 'كاب مطرّز بإحدى أشهر عبارات طاهر.',     0, 0, false, 2)
on conflict (slug) do nothing;

-- Photography. `base_path` is the stem; the optimiser writes the AVIF and
-- WebP variants beside it and the gallery builds its srcset from that. The
-- alt text is Arabic and describes the photograph, not the product name.
insert into tc_product_images (product_id, view, base_path, alt_ar, width, height, display_order)
select p.id, v.view, '/images/products/' || p.slug || '/' || v.view, v.alt, v.w, v.h, v.ord
  from tc_products p
  cross join (values
    ('main',   'صورة الكاب الأساسية',              1600, 1600, 1),
    ('front',  'واجهة الكاب والتطريز كاملًا',       1600, 1600, 2),
    ('side',   'الكاب من الجانب',                  1600, 1600, 3),
    ('back',   'الكاب من الخلف مع فتحة المقاس',     1600, 1600, 4),
    ('detail', 'تفصيلة قريبة لتطريز العبارة',       1600, 2000, 5)
  ) as v(view, alt, w, h, ord)
 where p.slug in ('taiwan', 'al-adou')
on conflict (product_id, view) do nothing;

-- Per-product alt text for the two views where naming the cap helps a screen
-- reader tell the products apart in a list.
update tc_product_images i
   set alt_ar = 'كاب «' || p.name_ar || '» من الأمام'
  from tc_products p
 where i.product_id = p.id and i.view = 'main';

-- All 27 governorates. A destination with no row cannot be quoted, so every
-- one is present from the start; the FEE is what remains to be filled in.
insert into tc_shipping_zones (governorate, fee_piastres, cod_available, min_days, max_days)
values
  ('Cairo', 0, true, null, null),
  ('Giza', 0, true, null, null),
  ('Alexandria', 0, true, null, null),
  ('Dakahlia', 0, true, null, null),
  ('Red Sea', 0, true, null, null),
  ('Beheira', 0, true, null, null),
  ('Fayoum', 0, true, null, null),
  ('Gharbia', 0, true, null, null),
  ('Ismailia', 0, true, null, null),
  ('Menofia', 0, true, null, null),
  ('Minya', 0, true, null, null),
  ('Qalyubia', 0, true, null, null),
  ('New Valley', 0, true, null, null),
  ('Suez', 0, true, null, null),
  ('Aswan', 0, true, null, null),
  ('Assiut', 0, true, null, null),
  ('Beni Suef', 0, true, null, null),
  ('Port Said', 0, true, null, null),
  ('Damietta', 0, true, null, null),
  ('Sharqia', 0, true, null, null),
  ('South Sinai', 0, true, null, null),
  ('Kafr El Sheikh', 0, true, null, null),
  ('Matrouh', 0, true, null, null),
  ('Luxor', 0, true, null, null),
  ('Qena', 0, true, null, null),
  ('North Sinai', 0, true, null, null),
  ('Sohag', 0, true, null, null)
on conflict (governorate) do nothing;

-- ---------------------------------------------------------------------------
-- Opening the store. Run these once the real figures are known -- or do the
-- same thing from /admin, which is what it is for.
--
--   update tc_products
--      set price_piastres = 75000,   -- 750.00 EGP, in piastres
--          stock_quantity = 100,
--          active = true
--    where slug = 'taiwan';
--
--   update tc_shipping_zones set fee_piastres = 6000, min_days = 2, max_days = 4
--    where governorate = 'Cairo';
--
-- And to grant somebody the admin area, after they have been created in
-- Supabase Auth (see docs/ADMIN-SETUP.md):
--
--   insert into tc_admins (auth_user_id, email)
--   select id, email from auth.users where email = 'you@example.com';
-- ---------------------------------------------------------------------------
