import { describe, expect, it } from "vitest";

import { cashToCollect, csvFilename, escapeCsvField, ordersToCsv, toCsvRow } from "./csv";
import type { AdminOrder } from "./api";

function order(overrides: Partial<AdminOrder> = {}): AdminOrder {
  return {
    orderNumber: "TC-ABCDEFGH",
    customerName: "Mohamed Ali",
    customerMobile: "01012345678",
    customerEmail: null,
    address: {
      street: "12 Baghdad St",
      building: "44",
      floor: "5",
      apartment: "9",
      city: "Heliopolis",
      governorate: "Cairo",
    },
    paymentMethod: "cod",
    paymentStatus: "pending",
    fulfilmentStatus: "placed",
    subtotal: 95_000,
    shippingFee: 10_000,
    discount: 0,
    total: 105_000,
    paymobOrderId: null,
    paymobTransactionId: null,
    placedAt: "2026-09-18T10:00:00.000Z",
    lines: [{ name: "تايوان يا ريس", quantity: 1, unitPrice: 95_000, lineTotal: 95_000 }],
    ...overrides,
  };
}

describe("escapeCsvField", () => {
  it("leaves a plain value alone", () => {
    expect(escapeCsvField("Cairo")).toBe("Cairo");
  });

  it("wraps and escapes a field containing a comma", () => {
    // The case that matters: Egyptian addresses are full of commas, and an
    // unescaped one shifts every column after it.
    expect(escapeCsvField("12 Baghdad St, Heliopolis")).toBe('"12 Baghdad St, Heliopolis"');
  });

  it("doubles embedded quotes", () => {
    expect(escapeCsvField('Ring the "back" bell')).toBe('"Ring the ""back"" bell"');
  });

  it("wraps a field containing a newline", () => {
    expect(escapeCsvField("line one\nline two")).toBe('"line one\nline two"');
  });

  it("wraps a field with leading or trailing space, which parsers trim", () => {
    expect(escapeCsvField(" padded ")).toBe('" padded "');
  });

  it("renders null and undefined as empty, not as the words", () => {
    expect(escapeCsvField(null)).toBe("");
    expect(escapeCsvField(undefined)).toBe("");
  });

  it("leaves Arabic untouched", () => {
    expect(escapeCsvField("تايوان يا ريس")).toBe("تايوان يا ريس");
  });
});

describe("cashToCollect", () => {
  it("is the full total for an unpaid cash order", () => {
    expect(cashToCollect(order())).toBe(1050);
  });

  it("is zero once an order is paid, so nobody is charged twice", () => {
    expect(cashToCollect(order({ paymentMethod: "paymob", paymentStatus: "paid" }))).toBe(0);
  });

  it("is the full total for an online order that never completed", () => {
    expect(cashToCollect(order({ paymentMethod: "paymob", paymentStatus: "failed" }))).toBe(1050);
  });
});

describe("ordersToCsv", () => {
  it("starts with a header row", () => {
    const [header] = ordersToCsv([]).split("\r\n");
    expect(header).toContain("Order number");
    expect(header).toContain("Cash to collect (EGP)");
  });

  it("writes one row per order", () => {
    const lines = ordersToCsv([order(), order({ orderNumber: "TC-22222222" })]).split("\r\n");
    expect(lines).toHaveLength(3);
  });

  it("uses CRLF, which is what spreadsheets expect", () => {
    expect(ordersToCsv([order()])).toContain("\r\n");
  });

  it("keeps the leading zero on a mobile number", () => {
    // Without the apostrophe Excel reads it as a number and drops the zero,
    // which makes the phone column useless to a courier.
    expect(ordersToCsv([order()])).toContain("'01012345678");
  });

  it("escapes an address containing a comma", () => {
    const csv = ordersToCsv([
      order({
        address: {
          street: "9 El Nasr St, Apt 3",
          building: "1",
          floor: "2",
          apartment: "3",
          city: "Maadi",
          governorate: "Cairo",
        },
      }),
    ]);
    expect(csv).toContain('"9 El Nasr St, Apt 3"');
  });

  it("escapes a delivery note containing a quote", () => {
    const csv = ordersToCsv([
      order({
        address: { ...order().address, notes: 'Ask for "Hany"' },
      }),
    ]);
    expect(csv).toContain('"Ask for ""Hany"""');
  });

  it("describes multiple items on one line", () => {
    const csv = ordersToCsv([
      order({
        lines: [
          { name: "تايوان يا ريس", quantity: 2, unitPrice: 95_000, lineTotal: 190_000 },
          { name: "العدو ليس بهذه القوة", quantity: 1, unitPrice: 95_000, lineTotal: 95_000 },
        ],
      }),
    ]);
    expect(csv).toContain("تايوان يا ريس x2 + العدو ليس بهذه القوة x1");
  });

  it("copes with an order whose address is missing fields", () => {
    const csv = ordersToCsv([order({ address: {} })]);
    expect(csv.split("\r\n")).toHaveLength(2);
  });

  it("produces only a header for no orders", () => {
    expect(ordersToCsv([]).split("\r\n")).toHaveLength(1);
  });
});

describe("csvFilename", () => {
  it("is dated so files sort chronologically", () => {
    expect(csvFilename(new Date("2026-09-18T12:00:00Z"))).toBe(
      "tahers-merch-orders-2026-09-18.csv",
    );
  });
});

describe("toCsvRow", () => {
  it("joins fields with commas", () => {
    expect(toCsvRow(["a", "b", 1])).toBe("a,b,1");
  });
});
