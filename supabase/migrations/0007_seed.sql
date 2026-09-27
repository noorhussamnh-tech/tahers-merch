-- Seed: the two caps, the photograph supplied for each, and every Egyptian
-- governorate as a shipping destination.
--
-- IMPORTANT -- this seed ships the store CLOSED, and `active` is now the ONLY
-- thing holding it closed. Read that twice before changing anything here.
--
-- Every commercial figure below is real and supplied by the business:
--
--   price     950.00 EGP  -> 95000 piastres, both caps
--   stock     10 each     -> 20 in total
--   shipping  80.00 EGP   -> 8000 piastres, flat, every governorate
--
-- Earlier revisions of this seed were safe twice over: a price of zero and a
-- stock of zero each made a sale impossible on their own. That is no longer
-- true. Flipping `active` to true opens the shop immediately, at the real
-- price, against real stock -- so it is deliberately left false, and flipping
-- it is the launch decision itself rather than a step on the way to one.
--
-- Before flipping it, see docs/PRODUCTION-CHECKLIST.md. Photography, Paymob
-- credentials and a domain are all still outstanding.

-- 95000 piastres = 950.00 EGP, and 10 of each cap: a 20-piece first run.
--
-- Twenty, not forty. The run was halved after the figure was first supplied,
-- which matters more than it looks: a sell-out is now half as far away, and
-- there is no waiting list behind it. When it is gone it is gone.
--
-- `active` stays false. See the note at the top of this file -- it is the only
-- thing between this seed and a live shop now.
insert into tc_products (slug, name_ar, description_ar, price_piastres, stock_quantity, active, display_order)
values
  ('taiwan',  'تايوان يا ريس',        'كاب مطرّز بعبارة «تايوان يا ريس».',  95000, 10, false, 1),
  ('al-adou', 'العدو ليس بهذه القوة', 'كاب مطرّز بعبارة «العدو ليس بهذه القوة ونحن لسنا بهذا الضعف».', 95000, 10, false, 2)
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

-- Every governorate in Egypt, at a flat 80.00 EGP (8000 piastres).
--
-- The delivery area is exactly the set of rows in this table: a governorate
-- without one cannot be quoted and cannot be ordered to. That is the mechanism
-- for refusing a destination -- delete its row. Never set a fee to zero to
-- refuse somewhere; zero means free delivery.
--
-- It was Cairo and Giza for a while, because there was no courier beyond them.
-- There is one now, so the list is whole again. The FAQ says the same thing;
-- if this list is ever narrowed, narrow the copy in src/lib/catalog/copy.ts in
-- the same change, or the site promises deliveries the checkout will refuse.
--
-- Flat at the courier's own national rate, which is a real figure from the
-- shipping company rather than an estimate -- so unlike the 100.00 that stood
-- here before, this one is not a placeholder waiting on a rate card.
--
-- It still charges the same to reach Aswan as to cross Cairo. If the courier
-- ever varies by distance, vary it per governorate in /admin rather than here.
--
-- The spellings come from GOVERNORATES in src/lib/domain/egypt.ts and must
-- keep matching it exactly: the checkout sends whatever that list says, and a
-- fee that does not match its destination is an order that cannot be placed.
insert into tc_shipping_zones (governorate, fee_piastres, cod_available, min_days, max_days)
values
  ('Cairo', 8000, true, null, null),
  ('Giza', 8000, true, null, null),
  ('Alexandria', 8000, true, null, null),
  ('Dakahlia', 8000, true, null, null),
  ('Red Sea', 8000, true, null, null),
  ('Beheira', 8000, true, null, null),
  ('Fayoum', 8000, true, null, null),
  ('Gharbia', 8000, true, null, null),
  ('Ismailia', 8000, true, null, null),
  ('Menofia', 8000, true, null, null),
  ('Minya', 8000, true, null, null),
  ('Qalyubia', 8000, true, null, null),
  ('New Valley', 8000, true, null, null),
  ('Suez', 8000, true, null, null),
  ('Aswan', 8000, true, null, null),
  ('Assiut', 8000, true, null, null),
  ('Beni Suef', 8000, true, null, null),
  ('Port Said', 8000, true, null, null),
  ('Damietta', 8000, true, null, null),
  ('Sharqia', 8000, true, null, null),
  ('South Sinai', 8000, true, null, null),
  ('Kafr El Sheikh', 8000, true, null, null),
  ('Matrouh', 8000, true, null, null),
  ('Luxor', 8000, true, null, null),
  ('Qena', 8000, true, null, null),
  ('North Sinai', 8000, true, null, null),
  ('Sohag', 8000, true, null, null)
on conflict (governorate) do nothing;

-- ---------------------------------------------------------------------------
-- Opening the store. Run these once the real figures are known -- or do the
-- same thing from /admin, which is what it is for.
--
--   update tc_products set active = true where slug = 'taiwan';
--
-- And to vary the flat fee, or add the delivery estimate once the courier
-- confirms one:
--
--   update tc_shipping_zones set fee_piastres = 12000, min_days = 4, max_days = 6
--    where governorate = 'Aswan';
--
-- And to grant somebody the admin area, after they have been created in
-- Supabase Auth (see docs/ADMIN-SETUP.md):
--
--   insert into tc_admins (auth_user_id, email)
--   select id, email from auth.users where email = 'you@example.com';
-- ---------------------------------------------------------------------------
