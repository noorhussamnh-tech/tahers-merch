/**
 * New-order notifications over Telegram. SERVER ONLY.
 *
 * One of the channels behind ./order-notification.server.ts, and not the
 * default -- email is. Kept because it costs nothing to keep, needs no domain,
 * and a group chat is a genuinely good place for this if anybody ever wants it.
 *
 * WhatsApp would be nicer still, but its Business API needs verification, a
 * provider and a per-message fee.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: a notification must never break an
 * order. Telegram being down, rate-limiting, or simply unconfigured has to
 * leave the customer's checkout completely unaffected -- so every path here
 * swallows its own errors and logs them, and the caller is expected not to
 * await it.
 */
import type { OrderNotification } from "./order-notification.server";

const TELEGRAM_API = "https://api.telegram.org";

export function telegramConfigured(): boolean {
  return Boolean(process.env["TELEGRAM_BOT_TOKEN"] && process.env["TELEGRAM_CHAT_ID"]);
}

/** Telegram's HTML mode needs these three escaped, and only these three. */
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildMessage(order: OrderNotification): string {
  const items = order.lines
    .map((line) => `• ${escapeHtml(line.name)} ×${line.quantity}`)
    .join("\n");

  const payment =
    order.paymentMethod === "cod"
      ? `💵 Cash on delivery — collect <b>${(order.total / 100).toLocaleString("en-EG")} EGP</b>`
      : `💳 Paid online — <b>${(order.total / 100).toLocaleString("en-EG")} EGP</b>`;

  return [
    `🧢 <b>New order ${escapeHtml(order.orderNumber)}</b>`,
    "",
    items,
    "",
    `👤 ${escapeHtml(order.customerName)}`,
    `📞 ${escapeHtml(order.customerMobile)}`,
    `📍 ${escapeHtml(order.city)}, ${escapeHtml(order.governorate)}`,
    "",
    payment,
  ].join("\n");
}

/**
 * Sends the notification. Never throws.
 *
 * Call it without awaiting: the customer should not wait on Telegram, and a
 * slow response here would sit directly in the checkout's critical path.
 */
export async function notifyNewOrderTelegram(order: OrderNotification): Promise<void> {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  const chatId = process.env["TELEGRAM_CHAT_ID"];

  // Not configured is a normal state, not an error. The shop works without it.
  if (!token || !chatId) return;

  try {
    const response = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: buildMessage(order),
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      // A notification is not worth holding a request open for. If Telegram
      // has not answered in five seconds, the order has already been placed
      // and somebody will see it in /admin.
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      console.error(
        "[taher-caps] Telegram notification rejected",
        response.status,
        (await response.text()).slice(0, 300),
      );
    }
  } catch (error) {
    // Swallowed on purpose. An order that succeeded must not report failure
    // because a chat message did not arrive.
    console.error("[taher-caps] Telegram notification failed", error);
  }
}
