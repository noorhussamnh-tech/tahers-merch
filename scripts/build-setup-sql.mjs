#!/usr/bin/env node
/**
 * Regenerates supabase/setup.sql from supabase/migrations/.
 *
 * setup.sql exists so a new project can be set up with one paste into the
 * Supabase SQL Editor instead of eight. It is generated, never hand-edited --
 * edit a migration and run this.
 *
 *   node scripts/build-setup-sql.mjs
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(root, "supabase", "migrations");

const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();

const header = `-- ===========================================================================
-- Taher's Merch — complete database setup
--
-- ONE file. Paste the whole thing into the Supabase SQL Editor and press Run.
--
-- It is every migration (${files[0].slice(0, 4)}–${files.at(-1).slice(0, 4)}) concatenated in order, so you do not have
-- to run eight files by hand. Running it on a FRESH project is safe.
--
-- What it creates:
--   · the two caps, at 950.00 EGP, 20 in stock each, BOTH INACTIVE
--   · all 27 governorates at a flat 100.00 EGP delivery
--   · orders, order items, status history, payment ledger, rate limits
--   · row-level security so the public can read the shop and nothing else
--   · the checkout, tracking, payment and admin functions
--
-- The shop cannot sell anything until you activate the caps in /admin.
-- That is deliberate.
--
-- Generated from supabase/migrations/. Regenerate with:
--   node scripts/build-setup-sql.mjs
-- ===========================================================================

`;

const body = [];
for (const name of files) {
  body.push(`\n-- ###########################################################################\n`);
  body.push(`-- ${name}\n`);
  body.push(`-- ###########################################################################\n\n`);
  body.push((await readFile(join(migrationsDir, name), "utf8")).trimEnd() + "\n");
}

const footer = `
-- ===========================================================================
-- Done. Two things left, both in the Supabase dashboard:
--
-- 1. Make yourself an administrator. Create the user first under
--    Authentication -> Users -> Add user (tick "Auto Confirm User"), then run:
--
--      insert into tc_admins (auth_user_id, email)
--      select id, email from auth.users where email = 'you@example.com';
--
-- 2. Turn OFF public sign-ups:
--    Authentication -> Providers -> Email -> untick "Enable sign-ups".
--
-- Then open /admin on your deployed site, sign in, and activate the caps when
-- you are ready to open the shop.
-- ===========================================================================
`;

await writeFile(join(root, "supabase", "setup.sql"), header + body.join("") + footer);
console.log(`setup.sql regenerated from ${files.length} migrations.`);
