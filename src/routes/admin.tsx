/**
 * Administration.
 *
 * Deliberately small. A shop with two products does not need a dashboard; it
 * needs somebody to be able to change a price, set the stock, take a cap off
 * sale, find an order and move it along. That is all this page does.
 *
 * There is no sign-up. An administrator exists because a row was inserted in
 * `tc_admins` by hand -- see docs/ADMIN-SETUP.md. Signing in with a valid
 * Supabase account that is not on that list gets you a page that says so, and
 * every function behind it would refuse you anyway.
 */
import { Download } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  isAdmin,
  listOrders,
  listProducts,
  listZones,
  updateFulfilment,
  updateProduct,
  updateZone,
  type AdminOrder,
  type AdminProduct,
  type AdminZone,
} from "@/lib/admin/api";
import { Button } from "@/components/ui/button";
import { downloadOrdersCsv } from "@/lib/admin/csv";
import { FULFILMENT_FLOW, type FulfilmentStatus } from "@/lib/domain/types";
import { formatEGP, piastresToPounds, poundsToPiastres } from "@/lib/domain/money";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Admin | Taher's Merch" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: AdminPage,
});

type Gate = "checking" | "signedOut" | "notAdmin" | "ready" | "unconfigured";

function AdminPage() {
  const [gate, setGate] = useState<Gate>("checking");
  const [email, setEmail] = useState("");

  const check = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setGate("unconfigured");
      return;
    }

    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setGate("signedOut");
      return;
    }

    setEmail(data.session.user.email ?? "");
    // Asks the database, not the token: being signed in is not the same as
    // being an administrator, and only the database knows the difference.
    setGate((await isAdmin()) ? "ready" : "notAdmin");
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  if (gate === "checking") {
    return <Centered>Checking…</Centered>;
  }

  if (gate === "unconfigured") {
    return (
      <Centered>Supabase is not configured, so the admin area cannot sign anyone in.</Centered>
    );
  }

  if (gate === "signedOut") {
    return <SignIn onSignedIn={check} />;
  }

  if (gate === "notAdmin") {
    return (
      <Centered>
        <p className="font-sans text-sm text-foreground">
          {email} is signed in, but is not an administrator.
        </p>
        <SignOutButton />
      </Centered>
    );
  }

  return <AdminConsole email={email} />;
}

/* -------------------------------------------------------------- sign in */

function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);

    if (error) {
      // One message for a wrong password and an unknown address alike: the
      // sign-in form should not tell a stranger which addresses exist.
      toast.error("Those sign-in details were not accepted.");
      return;
    }
    onSignedIn();
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-5">
      <h1 className="font-display text-3xl text-foreground">Admin</h1>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="font-sans text-xs text-muted">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 border border-border bg-background px-3 font-sans text-sm text-foreground outline-none focus:border-signal"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="font-sans text-xs text-muted">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-12 border border-border bg-background px-3 font-sans text-sm text-foreground outline-none focus:border-signal"
          />
        </div>

        <Button type="submit" size="lg" disabled={busy} className="mt-2">
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="mt-6 font-sans text-xs leading-relaxed text-muted">
        There is no sign-up. Accounts are created in Supabase and added to the administrator list by
        hand.
      </p>
    </div>
  );
}

function SignOutButton() {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await getSupabaseBrowserClient()?.auth.signOut();
        window.location.reload();
      }}
    >
      Sign out
    </Button>
  );
}

/* ------------------------------------------------------------- console */

function AdminConsole({ email }: { email: string }) {
  const [tab, setTab] = useState<"products" | "orders" | "shipping">("products");

  return (
    <div className="mx-auto max-w-page px-5 py-10 md:px-10 lg:px-16">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl text-foreground">Admin</h1>
        <div className="flex items-center gap-4">
          <span className="font-sans text-xs text-muted">{email}</span>
          <SignOutButton />
        </div>
      </div>

      <nav className="mt-8 flex gap-6 border-b border-border">
        {(["products", "orders", "shipping"] as const).map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setTab(name)}
            className={cn(
              "-mb-px border-b-2 pb-3 font-sans text-xs uppercase tracking-[0.14em] transition-colors",
              tab === name ? "border-signal text-signal" : "border-transparent text-muted",
            )}
          >
            {name}
          </button>
        ))}
      </nav>

      <div className="mt-10">
        {tab === "products" && <ProductsPanel />}
        {tab === "orders" && <OrdersPanel />}
        {tab === "shipping" && <ShippingPanel />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ products */

function ProductsPanel() {
  const [products, setProducts] = useState<AdminProduct[] | null>(null);

  const reload = useCallback(() => {
    listProducts()
      .then(setProducts)
      .catch((error: Error) => toast.error(error.message));
  }, []);

  useEffect(reload, [reload]);

  if (!products) return <p className="font-sans text-sm text-muted">Loading…</p>;

  return (
    <div className="flex flex-col gap-6">
      {products.map((product) => (
        <ProductRow key={product.slug} product={product} onSaved={reload} />
      ))}
    </div>
  );
}

function ProductRow({ product, onSaved }: { product: AdminProduct; onSaved: () => void }) {
  // Prices are edited in pounds, because that is what a person thinks in, and
  // converted to piastres on the way out -- never stored as a float.
  const [price, setPrice] = useState(String(piastresToPounds(product.price)));
  const [stock, setStock] = useState(String(product.stock));
  const [busy, setBusy] = useState(false);

  async function save(changes: Parameters<typeof updateProduct>[0]) {
    setBusy(true);
    try {
      await updateProduct(changes);
      toast.success("Saved.");
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-border bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p dir="rtl" className="font-arabic text-lg text-foreground">
            {product.name}
          </p>
          <p className="mt-1 font-sans text-xs text-muted">{product.slug}</p>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => save({ slug: product.slug, active: !product.active })}
          className={cn(
            "border px-3 py-1.5 font-sans text-[11px] uppercase tracking-[0.14em] transition-colors",
            product.active ? "border-success text-success" : "border-border text-muted",
          )}
        >
          {product.active ? "Active" : "Inactive"}
        </button>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Stock" value={String(product.stock)} />
        <Stat label="Reserved" value={String(product.reserved)} />
        <Stat label="Available" value={String(product.available)} />
        <Stat label="Price" value={product.price > 0 ? formatEGP(product.price) : "Not set"} />
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="font-sans text-xs text-muted">Price (EGP)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="h-11 w-32 border border-border bg-background px-3 font-sans text-sm text-foreground outline-none focus:border-signal"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="font-sans text-xs text-muted">Stock</span>
          <input
            type="number"
            min={0}
            step="1"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            className="h-11 w-28 border border-border bg-background px-3 font-sans text-sm text-foreground outline-none focus:border-signal"
          />
        </label>

        <Button
          size="sm"
          className="h-11"
          disabled={busy}
          onClick={() =>
            save({
              slug: product.slug,
              price: poundsToPiastres(Number(price)),
              stock: Number(stock),
            })
          }
        >
          Save
        </Button>
      </div>

      {product.reserved > 0 && (
        <p className="mt-4 font-sans text-xs text-muted">
          {product.reserved} unit{product.reserved === 1 ? " is" : "s are"} reserved for unpaid
          online orders. Stock cannot be set below that.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <p className="mt-1 font-sans text-base text-foreground">{value}</p>
    </div>
  );
}

/* -------------------------------------------------------------- orders */

function OrdersPanel() {
  const [search, setSearch] = useState("");
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(
    (term?: string) => {
      setBusy(true);
      listOrders(term ?? search)
        .then(setOrders)
        .catch((error: Error) => toast.error(error.message))
        .finally(() => setBusy(false));
    },
    [search],
  );

  useEffect(() => {
    reload("");
    // Loaded once on mount; later loads come from the search form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            reload();
          }}
        >
          <input
            aria-label="Search orders"
            placeholder="Order number or mobile number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 w-full max-w-sm border border-border bg-background px-3 font-sans text-sm text-foreground outline-none focus:border-signal"
          />
          <Button type="submit" size="sm" variant="outline" className="h-11" disabled={busy}>
            Search
          </Button>
        </form>

        {/* Exports exactly what is on screen, so a search narrows the file
            too -- "today's Cairo orders" is a search away from being its own
            CSV. */}
        <Button
          type="button"
          size="sm"
          className="h-11"
          disabled={!orders || orders.length === 0}
          onClick={() => {
            if (!orders?.length) return;
            downloadOrdersCsv(orders);
            toast.success(`Exported ${orders.length} order${orders.length === 1 ? "" : "s"}.`);
          }}
        >
          <Download className="h-4 w-4" aria-hidden />
          Export CSV
        </Button>
      </div>

      {!orders ? (
        <p className="font-sans text-sm text-muted">Loading…</p>
      ) : orders.length === 0 ? (
        <p className="font-sans text-sm text-muted">No orders match that search.</p>
      ) : (
        orders.map((order) => (
          <OrderCard key={order.orderNumber} order={order} onChanged={reload} />
        ))
      )}
    </div>
  );
}

function OrderCard({ order, onChanged }: { order: AdminOrder; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);

  async function move(status: FulfilmentStatus) {
    setBusy(true);
    try {
      await updateFulfilment(order.orderNumber, status);
      toast.success(`Marked ${status}.`);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-border bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-sans text-base tracking-wide text-foreground">{order.orderNumber}</p>
          <p className="mt-1 font-sans text-xs text-muted">
            {new Date(order.placedAt).toLocaleString("en-GB")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            tone={
              order.paymentStatus === "paid"
                ? "good"
                : order.paymentStatus === "pending"
                  ? "neutral"
                  : "bad"
            }
          >
            {order.paymentMethod === "cod" ? "COD" : "Online"} · {order.paymentStatus}
          </Badge>
          <Badge tone={order.fulfilmentStatus === "cancelled" ? "bad" : "neutral"}>
            {order.fulfilmentStatus}
          </Badge>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
        <div>
          <p className="eyebrow">Customer</p>
          <p className="mt-2 font-sans text-sm leading-relaxed text-foreground">
            {order.customerName}
            <br />
            {order.customerMobile}
            {order.customerEmail && (
              <>
                <br />
                {order.customerEmail}
              </>
            )}
          </p>
        </div>

        <div>
          <p className="eyebrow">Deliver to</p>
          <p className="mt-2 font-sans text-sm leading-relaxed text-foreground">
            {order.address["street"]}, Building {order.address["building"]}, Floor{" "}
            {order.address["floor"]}, Apt {order.address["apartment"]}
            <br />
            {order.address["city"]}, {order.address["governorate"]}
          </p>
          {order.address["notes"] && (
            <p className="mt-2 font-sans text-xs text-muted">Note: {order.address["notes"]}</p>
          )}
        </div>
      </div>

      <ul className="mt-5 flex flex-col gap-2 border-t border-border pt-5">
        {order.lines.map((line, index) => (
          <li key={index} className="flex items-center justify-between gap-4">
            <span dir="rtl" className="font-arabic text-sm text-foreground">
              {line.name}
            </span>
            <span className="font-sans text-xs text-muted">
              × {line.quantity} · {formatEGP(line.lineTotal)}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex items-baseline justify-between border-t border-border pt-4">
        <span className="control text-foreground">Total</span>
        <span className="font-sans text-base text-foreground">{formatEGP(order.total)}</span>
      </div>

      {order.paymobTransactionId && (
        <p className="mt-3 font-sans text-xs text-muted">
          Paymob transaction {order.paymobTransactionId}
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-5">
        {FULFILMENT_FLOW.map((status) => (
          <button
            key={status}
            type="button"
            disabled={busy || order.fulfilmentStatus === status}
            onClick={() => move(status)}
            className={cn(
              "border px-3 py-1.5 font-sans text-[11px] uppercase tracking-[0.14em] transition-colors",
              order.fulfilmentStatus === status
                ? "border-signal text-signal"
                : "border-border text-muted hover:border-foreground hover:text-foreground",
              "disabled:cursor-not-allowed",
            )}
          >
            {status}
          </button>
        ))}

        <button
          type="button"
          disabled={busy || order.fulfilmentStatus === "cancelled"}
          onClick={() => {
            // Cancelling returns stock, so it asks first.
            if (window.confirm(`Cancel ${order.orderNumber} and return its stock?`)) {
              void move("cancelled");
            }
          }}
          className="border border-error/50 px-3 py-1.5 font-sans text-[11px] uppercase tracking-[0.14em] text-error transition-colors hover:bg-error hover:text-background disabled:cursor-not-allowed disabled:opacity-40"
        >
          cancel
        </button>
      </div>
    </div>
  );
}

function Badge({
  tone,
  children,
}: {
  tone: "good" | "bad" | "neutral";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "border px-2.5 py-1 font-sans text-[11px] uppercase tracking-[0.12em]",
        tone === "good" && "border-success text-success",
        tone === "bad" && "border-error text-error",
        tone === "neutral" && "border-border text-muted",
      )}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------ shipping */

function ShippingPanel() {
  const [zones, setZones] = useState<AdminZone[] | null>(null);

  const reload = useCallback(() => {
    listZones()
      .then(setZones)
      .catch((error: Error) => toast.error(error.message));
  }, []);

  useEffect(reload, [reload]);

  if (!zones) return <p className="font-sans text-sm text-muted">Loading…</p>;

  const unset = zones.filter((zone) => zone.fee === 0).length;

  return (
    <div className="flex flex-col gap-6">
      {unset > 0 && (
        <p className="border border-border bg-card p-4 font-sans text-sm text-muted">
          {unset} governorate{unset === 1 ? " has" : "s have"} a fee of zero. Those ship free until
          a real fee is entered.
        </p>
      )}

      <div className="overflow-x-auto border border-border">
        <table className="w-full min-w-[42rem] bg-card">
          <thead>
            <tr className="border-b border-border text-left">
              {["Governorate", "Fee (EGP)", "COD", "Min days", "Max days", ""].map((heading) => (
                <th
                  key={heading}
                  className="px-4 py-3 font-sans text-[11px] uppercase tracking-[0.14em] text-muted"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {zones.map((zone) => (
              <ZoneRow key={zone.governorate} zone={zone} onSaved={reload} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ZoneRow({ zone, onSaved }: { zone: AdminZone; onSaved: () => void }) {
  const [fee, setFee] = useState(String(piastresToPounds(zone.fee)));
  const [cod, setCod] = useState(zone.codAvailable);
  const [minDays, setMinDays] = useState(zone.minDays === null ? "" : String(zone.minDays));
  const [maxDays, setMaxDays] = useState(zone.maxDays === null ? "" : String(zone.maxDays));
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await updateZone({
        governorate: zone.governorate,
        fee: poundsToPiastres(Number(fee)),
        codAvailable: cod,
        // Blank means "not known yet", and the storefront shows no estimate
        // rather than inventing a number of days.
        minDays: minDays === "" ? null : Number(minDays),
        maxDays: maxDays === "" ? null : Number(maxDays),
      });
      toast.success(`${zone.governorate} saved.`);
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  const cellInput =
    "h-9 w-24 border border-border bg-background px-2 font-sans text-sm text-foreground outline-none focus:border-signal";

  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-3 font-sans text-sm text-foreground">{zone.governorate}</td>
      <td className="px-4 py-3">
        <input
          type="number"
          min={0}
          step="0.01"
          value={fee}
          aria-label={`Shipping fee for ${zone.governorate}`}
          onChange={(e) => setFee(e.target.value)}
          className={cellInput}
        />
      </td>
      <td className="px-4 py-3">
        <input
          type="checkbox"
          checked={cod}
          aria-label={`Cash on delivery in ${zone.governorate}`}
          onChange={(e) => setCod(e.target.checked)}
          className="h-4 w-4 accent-[#7D252A]"
        />
      </td>
      <td className="px-4 py-3">
        <input
          type="number"
          min={0}
          value={minDays}
          placeholder="—"
          aria-label={`Minimum delivery days for ${zone.governorate}`}
          onChange={(e) => setMinDays(e.target.value)}
          className={cn(cellInput, "w-20")}
        />
      </td>
      <td className="px-4 py-3">
        <input
          type="number"
          min={0}
          value={maxDays}
          placeholder="—"
          aria-label={`Maximum delivery days for ${zone.governorate}`}
          onChange={(e) => setMaxDays(e.target.value)}
          className={cn(cellInput, "w-20")}
        />
      </td>
      <td className="px-4 py-3">
        <Button size="sm" variant="outline" className="h-9" disabled={busy} onClick={save}>
          Save
        </Button>
      </td>
    </tr>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-6 px-5 text-center">
      {typeof children === "string" ? (
        <p className="font-sans text-sm text-muted">{children}</p>
      ) : (
        children
      )}
    </div>
  );
}
