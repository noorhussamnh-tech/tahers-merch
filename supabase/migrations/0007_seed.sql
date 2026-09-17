-- Seed: the two caps, the photograph supplied for each, and every Egyptian
-- governorate as a shipping destination.
--
-- IMPORTANT -- this seed deliberately ships the store CLOSED.
--
-- The PRICE is real: 950.00 EGP, supplied by the business, stored as 95000
-- piastres. Everything else that would let a cap actually sell is not:
-- `stock_quantity` is 0, `active` is false, and every shipping zone has a fee
-- of 0, because none of those have been supplied (see
-- docs/MISSING-INFORMATION.md).
--
-- An inactive product with no stock cannot be read by the storefront, added
-- to a cart or ordered, so there is no window in which a deploy could sell a
-- cap it does not have.
--
-- Opening the store is a deliberate act: set the stock and the shipping fees,
-- then activate, from /admin or with the statements at the bottom of this
-- file.

-- 95000 piastres = 950.00 EGP. Both caps are the same price.
insert into tc_products (slug, name_ar, description_ar, price_piastres, stock_quantity, active, display_order)
values
  ('taiwan',  'تايوان يا ريس',        'كاب مطرّز بعبارة «تايوان يا ريس».',  95000, 0, false, 1),
  ('al-adou', 'العدو ليس بهذه القوة', 'كاب مطرّز بإحدى أشهر عبارات طاهر.', 95000, 0, false, 2)
on conflict (slug) do nothing;

-- Photography.
--
-- One photograph per cap has been supplied: the cap worn, shot from behind
-- against the sea. `base_path` is the stem; the optimiser writes the AVIF and
-- WebP variants beside it and the gallery builds its srcset from that.
--
-- Only the `main` view is seeded, because only the `main` view exists. Add a
-- row here as each further view is shot -- the gallery reads whatever is in
-- src/lib/catalog/products.ts and grows a thumbnail strip on its own.
insert into tc_product_images (product_id, view, base_path, alt_ar, width, height, display_order)
select p.id, 'main', '/images/products/' || p.slug || '/main', v.alt, 1600, 1600, 1
  from tc_products p
  join (values
    ('taiwan',
     'شخص يرتدي كاب «تايوان يا ريس» الأخضر، مصوَّرًا من الخلف أمام البحر، والعبارة مطرّزة بالأبيض على ظهر الكاب.'),
    ('al-adou',
     'شخص يرتدي كاب «العدو ليس بهذه القوة» النبيتي، مصوَّرًا من الخلف أمام البحر، والعبارة مطرّزة على سطرين.')
  ) as v(slug, alt) on v.slug = p.slug
on conflict (product_id, view) do nothing;

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
--      set stock_quantity = 100,     -- the count the manufacturer delivered
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
