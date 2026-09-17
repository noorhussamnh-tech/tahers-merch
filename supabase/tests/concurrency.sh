#!/usr/bin/env bash
#
# Two customers, one cap left.
#
# The other test files run statements one after another, which can never
# actually exercise a race. This one opens two real connections and has them
# both try to buy the last unit at the same time. What should happen is that
# the second one blocks on the first one's row lock, reads the reservation the
# first one made, and is refused -- rather than reading the stale count it saw
# on the product page and overselling.
#
# Usage:  DATABASE_URL=postgres://... ./supabase/tests/concurrency.sh
set -uo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to the test database}"

psql_q() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -qtA -c "$1"; }

order_sql() {
  local name=$1
  cat <<SQL
select tc_place_order(
  '[{"slug":"taiwan","quantity":1}]'::jsonb,
  '{"fullName":"$name","mobile":"01000000001"}'::jsonb,
  '{"governorate":"Cairo","city":"A","street":"B","building":"1","floor":"1","apartment":"1"}'::jsonb,
  'cod', gen_random_uuid());
SQL
}

echo "== setting the stage: exactly one cap left =============================="
psql_q "update tc_products set price_piastres = 75000, stock_quantity = 1, reserved_quantity = 0, active = true where slug = 'taiwan';" >/dev/null
psql_q "update tc_shipping_zones set fee_piastres = 6000, cod_available = true where governorate = 'Cairo';" >/dev/null
psql_q "delete from tc_order_items; delete from tc_order_status_history; delete from tc_payment_events; delete from tc_orders;" >/dev/null

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

echo "== customer A starts checkout and holds the lock ========================"
# A opens a transaction, places the order, and sits on the lock for a moment
# -- standing in for the fraction of a second a real checkout takes.
(
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -qtA >"$tmp/a.out" 2>&1 <<SQL
begin;
$(order_sql "Customer A")
select pg_sleep(3);
commit;
SQL
  echo "$?" >"$tmp/a.code"
) &
a_pid=$!

sleep 1

echo "== customer B tries for the same cap ===================================="
psql "$DATABASE_URL" -qtA >"$tmp/b.out" 2>&1 <<SQL
$(order_sql "Customer B")
SQL
echo "$?" >"$tmp/b.code"

wait "$a_pid"

echo
echo "-- A --"; cat "$tmp/a.out"
echo "-- B --"; cat "$tmp/b.out"
echo

fail=0
check() {
  if [ "$2" = "$3" ]; then
    printf '  ok    %s\n' "$1"
  else
    printf '  FAIL  %s (expected %s, got %s)\n' "$1" "$3" "$2"
    fail=1
  fi
}

orders=$(psql_q "select count(*) from tc_orders;")
stock=$(psql_q "select stock_quantity from tc_products where slug = 'taiwan';")
reserved=$(psql_q "select reserved_quantity from tc_products where slug = 'taiwan';")
b_refused=$(grep -qi "insufficient_stock" "$tmp/b.out" && echo yes || echo no)
a_succeeded=$(grep -q "orderNumber" "$tmp/a.out" && echo yes || echo no)

check "customer A got the cap"            "$a_succeeded" "yes"
check "customer B was refused"            "$b_refused"   "yes"
check "exactly one order exists"          "$orders"      "1"
check "stock is zero, not minus one"      "$stock"       "0"
check "nothing is left reserved"          "$reserved"    "0"

echo
if [ "$fail" -eq 0 ]; then
  echo "== the last cap was sold once ========================================="
else
  echo "== OVERSOLD -- the reservation is not atomic =========================="
  exit 1
fi
