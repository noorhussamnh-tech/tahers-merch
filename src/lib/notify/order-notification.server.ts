/**
 * New-order notifications. SERVER ONLY.
 *
 * Email by default, over Resend. Telegram stays supported because it costs
 * nothing to keep and some people prefer it; both fire if both are configured,
 * and the shop is perfectly happy with neither.
 *
 * Resend was chosen over SendGrid or SES for one reason that matters here:
 * it will send from `onboarding@resend.dev` with no domain verification at
 * all, which this shop needs because it does not have a domain yet. See the
 * note on RESEND_FROM below for the limitation that comes with that.
 *
 * THE RULE THIS FILE ENFORCES: a notification must never break an order.
 * Every path swallows its own errors and logs them, nothing here is awaited by
 * the checkout, and "not configured" is a normal state rather than a failure.
 */
import { notifyNewOrderTelegram } from "./telegram.server";

export interface OrderNotification {
  readonly orderNumber: string;
  readonly customerName: string;
  readonly customerMobile: string;
  readonly governorate: string;
  readonly city: string;
  readonly street: string;
  readonly building: string;
  readonly floor: string;
  readonly apartment: string;
  readonly notes?: string | undefined;
  readonly total: number;
  readonly paymentMethod: "cod" | "paymob" | "instapay";
  readonly lines: readonly { name: string; quantity: number }[];
}

function egp(piastres: number): string {
  return `${(piastres / 100).toLocaleString("en-EG")} EGP`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The email body.
 *
 * Written so the important part survives a notification preview on a phone:
 * the order number and what to collect are in the subject and the first line,
 * because that is all you see before opening it.
 *
 * Inline styles rather than a stylesheet -- every email client strips <style>.
 */
export function buildOrderEmail(order: OrderNotification): { subject: string; html: string } {
  const items = order.lines
    .map((line) => `${escapeHtml(line.name)} &times;${line.quantity}`)
    .join("<br />");

  /*
   * The payment line is the one an unpaid transfer has to survive. An Instapay
   * order arrives looking exactly like a paid one -- same total, same address,
   * placed the same way -- and the money has not moved yet. If this line does
   * not say so, somebody packs it and ships it.
   */
  const payment =
    order.paymentMethod === "cod"
      ? `Cash on delivery — <strong>collect ${egp(order.total)}</strong>`
      : order.paymentMethod === "instapay"
        ? `Instapay — <strong style="color:#7d252a;">NOT PAID YET (${egp(order.total)})</strong>. Check the transfer arrived, mark it paid in /admin, and do not ship until you have.`
        : `Paid online — ${egp(order.total)}`;

  const address = [
    `${escapeHtml(order.street)}, Building ${escapeHtml(order.building)}`,
    `Floor ${escapeHtml(order.floor)}, Apt ${escapeHtml(order.apartment)}`,
    `${escapeHtml(order.city)}, ${escapeHtml(order.governorate)}`,
  ].join("<br />");

  const row = (label: string, value: string) =>
    `<tr>
       <td style="padding:10px 16px 10px 0;color:#756c62;font-size:13px;vertical-align:top;white-space:nowrap;">${label}</td>
       <td style="padding:10px 0;color:#17130f;font-size:14px;line-height:1.6;">${value}</td>
     </tr>`;

  return {
    // The subject is the notification. Everything needed to decide whether to
    // act on it right now is here.
    subject:
      order.paymentMethod === "instapay"
        ? `New order ${order.orderNumber} — ${egp(order.total)} — AWAITING TRANSFER — ${order.city}`
        : `New order ${order.orderNumber} — ${egp(order.total)} — ${order.city}`,
    html: `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f5f0e6;font-family:-apple-system,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#fffdf8;border:1px solid #cfc6b9;">
    <div style="background:#17130f;color:#f5f0e6;padding:16px 24px;">
      <div style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;opacity:.7;">Taher&#39;s Merch</div>
      <div style="font-size:20px;margin-top:4px;">New order ${escapeHtml(order.orderNumber)}</div>
    </div>
    <table style="width:100%;border-collapse:collapse;padding:24px;" cellpadding="0" cellspacing="0">
      <tbody style="display:table;width:100%;padding:8px 24px 24px;">
        ${row("Items", items)}
        ${row("Payment", payment)}
        ${row("Customer", escapeHtml(order.customerName))}
        ${row("Phone", `<a href="tel:${escapeHtml(order.customerMobile)}" style="color:#7d252a;">${escapeHtml(order.customerMobile)}</a>`)}
        ${row("Deliver to", address)}
        ${order.notes ? row("Notes", escapeHtml(order.notes)) : ""}
      </tbody>
    </table>
    <div style="padding:16px 24px;border-top:1px solid #cfc6b9;font-size:12px;color:#756c62;">
      Mark it shipped in /admin once the courier has it, or the customer&#39;s
      tracking page will still say &ldquo;Order placed&rdquo;.
    </div>
  </div>
</body></html>`,
  };
}

function recipients(): string[] {
  return (process.env["ORDER_NOTIFICATION_EMAIL"] ?? "")
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);
}

export function emailConfigured(): boolean {
  return Boolean(process.env["RESEND_API_KEY"]) && recipients().length > 0;
}

async function sendEmail(order: OrderNotification): Promise<void> {
  const apiKey = process.env["RESEND_API_KEY"];
  const to = recipients();
  if (!apiKey || to.length === 0) return;

  /*
   * Until a domain is verified with Resend, this must stay as their sandbox
   * sender -- and that sender can only deliver to the address that owns the
   * Resend account. Once a domain exists, verify it and set RESEND_FROM to
   * something like "Taher's Merch <orders@yourdomain.com>", and mail will
   * reach anybody.
   */
  const from = process.env["RESEND_FROM"] ?? "Taher's Merch <onboarding@resend.dev>";
  const { subject, html } = buildOrderEmail(order);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
    // A notification is not worth holding a request open for.
    signal: AbortSignal.timeout(6000),
  });

  if (!response.ok) {
    console.error(
      "[taher-caps] order email rejected",
      response.status,
      (await response.text()).slice(0, 400),
    );
  }
}

/**
 * Sends on every configured channel. Never throws.
 *
 * Call it WITHOUT awaiting: the customer should not wait on an email server,
 * and a slow one would otherwise sit in the checkout's critical path.
 */
export async function notifyNewOrder(order: OrderNotification): Promise<void> {
  // Settled, not all: one channel failing must not stop the other.
  await Promise.allSettled([
    sendEmail(order).catch((error) => {
      console.error("[taher-caps] order email failed", error);
    }),
    notifyNewOrderTelegram(order).catch((error) => {
      console.error("[taher-caps] telegram notification failed", error);
    }),
  ]);
}
