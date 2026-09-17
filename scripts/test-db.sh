#!/usr/bin/env bash
#
# Builds a throwaway database from the migrations and runs the SQL test suite
# against it.
#
# These tests cover what a browser test cannot reach: two customers racing for
# the last cap, a webhook that arrives twice, a payment for the wrong amount,
# and what an anonymous caller can actually select.
#
# Usage:
#   DATABASE_URL=postgres://postgres:postgres@localhost:54322/postgres ./scripts/test-db.sh
#
# With the Supabase CLI running locally, that URL is what `supabase status`
# prints as "DB URL". The script drops and recreates the schema, so point it
# at a development database and never at production.
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to a development database. Never production.}"

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
psql_f() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$1"; }

case "$DATABASE_URL" in
  *prod*|*production*)
    echo "Refusing to run: the URL looks like production." >&2
    exit 1
    ;;
esac

# Drops everything and rebuilds from the migrations.
#
# Supabase provides auth.users, auth.uid() and the anon / authenticated roles
# in a real project; on a bare Postgres they have to be stood up first. Note
# the USAGE grant comes *after* the schema is recreated -- dropping the public
# schema takes its grants with it, and RLS policies written for `anon` do
# nothing if anon cannot see the schema they live in.
rebuild() {
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c "drop schema if exists public cascade; create schema public;"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
create extension if not exists pgcrypto;
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
delete from auth.users;
grant usage on schema public to anon, authenticated;
SQL
  for f in "$root"/supabase/migrations/*.sql; do psql_f "$f"; done
}

echo "== applying migrations =================================================="
rebuild
for f in "$root"/supabase/migrations/*.sql; do printf '  %-34s ok\n' "$(basename "$f")"; done

echo
echo "########## business rules ##############################################"
psql_f "$root/supabase/tests/schema.test.sql"

echo
echo "########## row-level security ##########################################"
# A clean database: the business-rule pass above left orders and admins behind,
# and the RLS assertions count rows.
rebuild
psql_f "$root/supabase/tests/rls.test.sql"

echo
echo "########## concurrency #################################################"
rebuild
bash "$root/supabase/tests/concurrency.sh"

echo
echo "All database tests passed."
