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

/**
 * Columns, in the order couriers generally expect them.
 *
 * Date and time are separate columns rather than one timestamp: a courier
 * sorts and filters by day, and a spreadsheet treats "18/09/2026, 21:04" as
 * text while it treats a bare date as a date.
 */
const HEADERS = [
  "Order number",
  "Order date",
  "Order time",
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
  "Payment method",
  "Payment status",
  "Payment reference",
  "Order status",
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
 * Only a cash order is ever collected against. Everything else is zero, and
 * the two reasons are different:
 *
 *   · A PAID order -- online or transfer -- must not be collected on, because
 *     that charges the customer twice.
 *   · An UNPAID TRANSFER must not be collected on either, and this is the
 *     subtle one. The money is supposed to arrive by bank transfer, not at
 *     the door. Putting the total in this column would quietly convert it to
 *     cash on delivery without anyone deciding to, and the customer could end
 *     up paying both ways. An unpaid transfer should not reach a courier at
 *     all -- see `paymentStatusLabel`, which shouts about it.
 */
export function cashToCollect(order: AdminOrder): number {
  if (order.paymentMethod !== "cod") return 0;
  if (order.paymentStatus === "paid") return 0;
  return piastresToPounds(order.total);
}

/** How the customer is paying, in words a courier will understand. */
export function paymentMethodLabel(order: AdminOrder): string {
  switch (order.paymentMethod) {
    case "cod":
      return "Cash on delivery";
    case "instapay":
      return "Instapay transfer";
    case "paymob":
      return "Card online";
  }
}

/**
 * Whether the money is actually in.
 *
 * An unpaid transfer is written in capitals and says what to do, because this
 * file's whole job is to be read in a hurry by somebody about to hand over
 * parcels.
 */
export function paymentStatusLabel(order: AdminOrder): string {
  if (order.paymentMethod === "instapay" && order.paymentStatus !== "paid") {
    return "NOT PAID - DO NOT SHIP";
  }
  return order.paymentStatus === "paid" ? "Paid" : order.paymentStatus;
}

/** Splits the timestamp the way a spreadsheet wants it. */
export function orderDate(order: AdminOrder): string {
  return new Date(order.placedAt).toLocaleDateString("en-GB");
}

export function orderTime(order: AdminOrder): string {
  return new Date(order.placedAt).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
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
        orderDate(order),
        orderTime(order),
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
        paymentMethodLabel(order),
        paymentStatusLabel(order),
        order.paymentReference ?? "",
        order.fulfilmentStatus,
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
