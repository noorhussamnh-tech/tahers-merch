/**
 * Paymob payment initialisation. SERVER ONLY.
 *
 * Uses the Unified Intention flow: the server POSTs an intention with the
 * secret key, Paymob returns a `client_secret`, and the customer is sent to
 * the Unified Checkout page built from that secret and the public key.
 *
 * The secret key never leaves this module, and no card data ever enters it.
 * The customer types their card on Paymob's own page; this application never
 * sees, transmits or stores a card number, which is what keeps it out of PCI
 * scope entirely.
 *
 * Endpoints and credential names are configurable through the environment
 * rather than hard-coded, because Paymob runs region-specific hosts (Egypt,
 * Saudi Arabia, the UAE, Oman, Pakistan) and has changed its base URL before.
 * Confirm both against the current documentation before going live --
 * docs/PAYMOB.md lists the pages to check.
 */

/** Where Paymob's API lives. Egypt by default. */
function apiBase(): string {
  return (process.env["PAYMOB_API_BASE"] ?? "https://accept.paymob.com").replace(/\/$/, "");
}

/** Where the customer is sent to type their card. */
function checkoutBase(): string {
  return process.env["PAYMOB_CHECKOUT_URL"] ?? `${apiBase()}/unifiedcheckout/`;
}

export class PaymobNotConfiguredError extends Error {
  constructor(missing: string) {
    super(`${missing} is not set. Online payment is unavailable.`);
    this.name = "PaymobNotConfiguredError";
  }
}

export class PaymobError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "PaymobError";
    this.status = status;
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new PaymobNotConfiguredError(name);
  return value;
}

/** True when online payment can be offered at all. */
export function paymobConfigured(): boolean {
  return Boolean(
    process.env["PAYMOB_SECRET_KEY"] &&
    process.env["PAYMOB_PUBLIC_KEY"] &&
    process.env["PAYMOB_INTEGRATION_ID_CARD"] &&
    process.env["PAYMOB_HMAC_SECRET"],
  );
}

export interface IntentionRequest {
  /** Integer piastres. Paymob calls it `amount_cents`. */
  readonly amountPiastres: number;
  readonly orderNumber: string;
  readonly customer: { fullName: string; mobile: string; email?: string | undefined };
  readonly address: { governorate: string; city: string; street: string; building: string };
  readonly items: readonly { name: string; amountPiastres: number; quantity: number }[];
  /** Where Paymob sends the browser back to when the customer is done. */
  readonly redirectionUrl: string;
  /** Where Paymob POSTs the server-to-server callback. */
  readonly notificationUrl: string;
}

export interface IntentionResult {
  readonly clientSecret: string;
  readonly intentionId: string;
  readonly paymobOrderId: string;
  /** The page to send the customer to. */
  readonly checkoutUrl: string;
}

/**
 * Creates a payment intention and returns where to send the customer.
 *
 * `special_reference` carries our public order number, so a transaction can
 * be traced back to an order from the Paymob dashboard without a lookup
 * table. Paymob requires it to be unique per intention -- a retry on the same
 * order number is rejected -- so a retried payment appends an attempt suffix.
 */
export async function createIntention(request: IntentionRequest): Promise<IntentionResult> {
  const secretKey = requireEnv("PAYMOB_SECRET_KEY");
  const publicKey = requireEnv("PAYMOB_PUBLIC_KEY");
  const integrationId = Number(requireEnv("PAYMOB_INTEGRATION_ID_CARD"));

  if (!Number.isFinite(integrationId)) {
    throw new PaymobNotConfiguredError("PAYMOB_INTEGRATION_ID_CARD (must be a number)");
  }

  // Paymob splits the name into first and last and rejects an empty either
  // side, so a single-word name is padded rather than refused at the gateway.
  const [firstName, ...rest] = request.customer.fullName.trim().split(/\s+/);
  const lastName = rest.join(" ") || firstName || "-";

  const body = {
    amount: request.amountPiastres,
    currency: "EGP",
    payment_methods: [integrationId],
    // A unique reference per attempt: order number, then the clock, so a
    // second attempt on the same order does not collide with the first.
    special_reference: `${request.orderNumber}-${Date.now().toString(36)}`,
    items: request.items.map((item) => ({
      name: item.name,
      amount: item.amountPiastres,
      quantity: item.quantity,
    })),
    billing_data: {
      first_name: firstName || "-",
      last_name: lastName,
      phone_number: request.customer.mobile,
      email: request.customer.email ?? "",
      country: "EG",
      state: request.address.governorate,
      city: request.address.city,
      street: request.address.street,
      building: request.address.building,
      // Paymob rejects an omitted field in billing_data; "NA" is its own
      // documented placeholder for one it does not need.
      apartment: "NA",
      floor: "NA",
      postal_code: "NA",
      shipping_method: "NA",
    },
    // Echoed back on the callback, so the webhook can find the order even if
    // the reference format changes.
    extras: { order_number: request.orderNumber },
    redirection_url: request.redirectionUrl,
    notification_url: request.notificationUrl,
  };

  const response = await fetch(`${apiBase()}/v1/intention/`, {
    method: "POST",
    headers: {
      // Paymob's scheme: the literal word "Token", then the secret key.
      Authorization: `Token ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();

  if (!response.ok) {
    // The gateway's own message goes to the log, never to the customer: it
    // can echo the request back, and the request contains their details.
    console.error("[taher-caps] Paymob intention failed", response.status, text);
    throw new PaymobError("Could not start the payment.", response.status);
  }

  let payload: { client_secret?: string; id?: unknown; intention_order_id?: unknown };
  try {
    payload = JSON.parse(text);
  } catch {
    console.error("[taher-caps] Paymob returned a non-JSON body", text.slice(0, 500));
    throw new PaymobError("Could not start the payment.", 502);
  }

  if (!payload.client_secret) {
    console.error("[taher-caps] Paymob intention had no client_secret", text.slice(0, 500));
    throw new PaymobError("Could not start the payment.", 502);
  }

  const url = new URL(checkoutBase());
  url.searchParams.set("publicKey", publicKey);
  url.searchParams.set("clientSecret", payload.client_secret);

  return {
    clientSecret: payload.client_secret,
    intentionId: String(payload.id ?? ""),
    paymobOrderId: String(payload.intention_order_id ?? ""),
    checkoutUrl: url.toString(),
  };
}
