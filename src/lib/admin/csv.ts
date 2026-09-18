/**
 * Orders as a spreadsheet, for handing to a courier.
 *
 * Egyptian couriers -- Bosta, Mylerz, Aramex -- all take a CSV upload, and
 * they all want roughly the same columns: who, where, what to collect. This
 * builds that file from the orders already on screen.
 *
 * Two things this gets right that a naive join-with-commas does not:
 *
 *   1. Escaping. An Egyptian address is full of commas, and a delivery note
 *      can contain a quote or a newline. Any field with one has to be wrapped
 *      and its quotes doubled, or the courier's import silently shifts every
 *      column after it and parcels go to the wrong addresses.
 *   2. The BOM. Excel on Windows assumes the system codepage unless a file
 *      starts with a UTF-8 byte-order mark, and without it every Arabic
 *      product name arrives as mojibake.
 */
import { piastresToPounds } from "@/lib/domain/money";
import type { AdminOrder } from "./api";

/** Columns, in the order couriers generally expect them. */
const HEADERS = [
  "Order number",
  "Customer name",
  "Phone",
  "Street",
  "Building",
  "Floor",
  "Apartment",
  "City / area",
  "Governorate",
  "Items",
  "Cash to collect (EGP)",
  "Payment",
  "Order status",
  "Placed at",
  "Delivery notes",
] as const;

/**
 * Escapes one field.
 *
 * Quotes are doubled and the whole field wrapped whenever it contains a
 * comma, a quote, a newline or a leading/trailing space -- the four things
 * that break a CSV parser.
 */
export function escapeCsvField(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(text) || text !== text.trim()) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsvRow(fields: readonly unknown[]): string {
  return fields.map(escapeCsvField).join(",");
}

/**
 * What the courier collects at the door.
 *
 * Zero for an order already paid online: asking a courier to collect cash on
 * a paid order is how a customer gets charged twice.
 */
export function cashToCollect(order: AdminOrder): number {
  if (order.paymentStatus === "paid") return 0;
  return piastresToPounds(order.total);
}

function describeItems(order: AdminOrder): string {
  return order.lines.map((line) => `${line.name} x${line.quantity}`).join(" + ");
}

export function ordersToCsv(orders: readonly AdminOrder[]): string {
  const rows = [toCsvRow(HEADERS)];

  for (const order of orders) {
    rows.push(
      toCsvRow([
        order.orderNumber,
        order.customerName,
        // Leading apostrophe keeps Excel from eating the leading zero and
        // turning 01012345678 into 1012345678.
        `'${order.customerMobile}`,
        order.address["street"] ?? "",
        order.address["building"] ?? "",
        order.address["floor"] ?? "",
        order.address["apartment"] ?? "",
        order.address["city"] ?? "",
        order.address["governorate"] ?? "",
        describeItems(order),
        cashToCollect(order),
        order.paymentMethod === "cod" ? "Cash on delivery" : `Online (${order.paymentStatus})`,
        order.fulfilmentStatus,
        new Date(order.placedAt).toLocaleString("en-GB"),
        order.address["notes"] ?? "",
      ]),
    );
  }

  // CRLF: what every spreadsheet expects, and what Excel requires.
  return rows.join("\r\n");
}

/** A filename that sorts chronologically and says what it is. */
export function csvFilename(now: Date = new Date()): string {
  const stamp = now.toISOString().slice(0, 10);
  return `tahers-merch-orders-${stamp}.csv`;
}

/**
 * Triggers the download.
 *
 * The BOM is the difference between an Arabic product name opening
 * correctly in Excel and opening as a row of Latin-1 gibberish. It is written
 * as the escape \uFEFF rather than pasted in, because a literal zero-width
 * character in source is invisible to whoever reads this next.
 */
export function downloadOrdersCsv(orders: readonly AdminOrder[]): void {
  const blob = new Blob(["\uFEFF" + ordersToCsv(orders)], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = csvFilename();
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
