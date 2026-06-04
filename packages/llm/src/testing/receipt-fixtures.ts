import type { ReceiptExtractionInput } from "@expense/core";

export interface ReceiptEmailFixture {
  readonly name: string;
  readonly input: ReceiptExtractionInput;
  readonly expected: {
    readonly merchantNameContains: string;
    readonly totalMinorUnits: number | null;
    readonly orderId: string | null;
  };
}

export const RECEIPT_EMAIL_FIXTURES: readonly ReceiptEmailFixture[] = [
  {
    name: "amazon order confirmation",
    input: {
      kind: "order_confirmation",
      fromAddress: "Amazon <order-update@amazon.com>",
      subject: "Your Amazon.com order #123-4567890",
      textPlain: [
        "Hello,",
        "",
        "Order #123-4567890",
        "Order Total: $45.99",
        "",
        "Thank you for shopping with us.",
      ].join("\n"),
      textHtml: null,
      receivedAt: new Date("2026-05-20T18:00:00.000Z"),
    },
    expected: {
      merchantNameContains: "amazon",
      totalMinorUnits: 4599,
      orderId: "123-4567890",
    },
  },
  {
    name: "uber ride receipt",
    input: {
      kind: "rideshare",
      fromAddress: "Uber Receipts <noreply@uber.com>",
      subject: "Your Friday evening trip with Uber",
      textPlain: [
        "Thanks for riding, Alex",
        "",
        "Total $18.75",
        "Trip on May 20, 2026",
      ].join("\n"),
      textHtml: null,
      receivedAt: new Date("2026-05-20T23:15:00.000Z"),
    },
    expected: {
      merchantNameContains: "uber",
      totalMinorUnits: 1875,
      orderId: null,
    },
  },
  {
    name: "doordash food delivery",
    input: {
      kind: "food_delivery",
      fromAddress: "DoorDash <no-reply@doordash.com>",
      subject: "Your DoorDash order from Chipotle",
      textPlain: [
        "Your order is confirmed.",
        "Restaurant: Chipotle",
        "Order total: $32.40",
      ].join("\n"),
      textHtml: null,
      receivedAt: new Date("2026-05-19T19:30:00.000Z"),
    },
    expected: {
      merchantNameContains: "doordash",
      totalMinorUnits: 3240,
      orderId: null,
    },
  },
  {
    name: "thank-you without amount",
    input: {
      kind: "order_confirmation",
      fromAddress: "Store <orders@example.com>",
      subject: "Thanks for your purchase",
      textPlain: "Thanks for your purchase. We'll email you when it ships.",
      textHtml: null,
      receivedAt: new Date("2026-05-18T12:00:00.000Z"),
    },
    expected: {
      merchantNameContains: "store",
      totalMinorUnits: null,
      orderId: null,
    },
  },
  {
    name: "netflix subscription renewal",
    input: {
      kind: "subscription_renewal",
      fromAddress: "Netflix <info@account.netflix.com>",
      subject: "Your Netflix subscription receipt",
      textPlain: [
        "Hi Alex,",
        "",
        "Your monthly subscription was renewed.",
        "Amount charged: $15.49",
        "Plan: Standard with ads",
      ].join("\n"),
      textHtml: null,
      receivedAt: new Date("2026-05-01T08:00:00.000Z"),
    },
    expected: {
      merchantNameContains: "netflix",
      totalMinorUnits: 1549,
      orderId: null,
    },
  },
  {
    name: "spotify premium receipt",
    input: {
      kind: "subscription_renewal",
      fromAddress: "Spotify <no-reply@spotify.com>",
      subject: "Receipt for your Spotify Premium subscription",
      textPlain: [
        "Thanks for being a Premium member.",
        "Total: $10.99",
        "Billing date: May 5, 2026",
      ].join("\n"),
      textHtml: null,
      receivedAt: new Date("2026-05-05T09:00:00.000Z"),
    },
    expected: {
      merchantNameContains: "spotify",
      totalMinorUnits: 1099,
      orderId: null,
    },
  },
  {
    name: "delta flight confirmation",
    input: {
      kind: "travel_booking",
      fromAddress: "Delta Air Lines <noreply@delta.com>",
      subject: "Your Delta trip confirmation — SFO to JFK",
      textPlain: [
        "Confirmation number: ABCD12",
        "Passenger: Alex Example",
        "Total fare: $412.80",
        "Thank you for choosing Delta.",
      ].join("\n"),
      textHtml: null,
      receivedAt: new Date("2026-05-10T14:30:00.000Z"),
    },
    expected: {
      merchantNameContains: "delta",
      totalMinorUnits: 41280,
      orderId: "ABCD12",
    },
  },
  {
    name: "ticketmaster event tickets",
    input: {
      kind: "event_ticket",
      fromAddress: "Ticketmaster <order@ticketmaster.com>",
      subject: "Your Ticketmaster order #TM-882910",
      textPlain: [
        "Order #TM-882910",
        "Event: Indie Night Live",
        "Order Total: $89.00",
        "Tickets attached.",
      ].join("\n"),
      textHtml: null,
      receivedAt: new Date("2026-05-15T20:00:00.000Z"),
    },
    expected: {
      merchantNameContains: "ticketmaster",
      totalMinorUnits: 8900,
      orderId: "TM-882910",
    },
  },
  {
    name: "paypal payment sent",
    input: {
      kind: "marketplace_payment",
      fromAddress: "PayPal <service@paypal.com>",
      subject: "You sent a payment of $250.00 USD",
      textPlain: [
        "You sent $250.00 USD to Freelance Studio LLC.",
        "Transaction ID: 9XK12345AB678901C",
      ].join("\n"),
      textHtml: null,
      receivedAt: new Date("2026-05-12T16:45:00.000Z"),
    },
    expected: {
      merchantNameContains: "paypal",
      totalMinorUnits: 25000,
      orderId: "9XK12345AB678901C",
    },
  },
  {
    name: "target order unknown merchant",
    input: {
      kind: "unknown",
      fromAddress: "Target <orders@target.com>",
      subject: "Thanks for your Target order",
      textPlain: [
        "Your order is confirmed.",
        "Order total: $84.12",
        "We'll let you know when it ships.",
      ].join("\n"),
      textHtml: null,
      receivedAt: new Date("2026-05-17T11:20:00.000Z"),
    },
    expected: {
      merchantNameContains: "target",
      totalMinorUnits: 8412,
      orderId: null,
    },
  },
  {
    name: "amazon refund confirmation",
    input: {
      kind: "refund",
      fromAddress: "Amazon <order-update@amazon.com>",
      subject: "Refund confirmation for order #123-4567890",
      textPlain: [
        "We've issued a refund for order #123-4567890.",
        "Refund amount: $12.99",
        "It may take 3-5 business days to appear.",
      ].join("\n"),
      textHtml: null,
      receivedAt: new Date("2026-05-21T10:00:00.000Z"),
    },
    expected: {
      merchantNameContains: "amazon",
      totalMinorUnits: 1299,
      orderId: "123-4567890",
    },
  },
  {
    name: "utility invoice bill",
    input: {
      kind: "invoice_bill",
      fromAddress: "Con Edison <billing@coned.com>",
      subject: "Your Con Edison bill is ready",
      textPlain: [
        "Account number: 1234567890",
        "Amount due: $156.78",
        "Due date: June 1, 2026",
      ].join("\n"),
      textHtml: null,
      receivedAt: new Date("2026-05-08T07:00:00.000Z"),
    },
    expected: {
      merchantNameContains: "con",
      totalMinorUnits: 15678,
      orderId: null,
    },
  },
  {
    name: "lyft ride receipt",
    input: {
      kind: "rideshare",
      fromAddress: "Lyft Receipts <receipts@lyft.com>",
      subject: "Your Lyft ride receipt",
      textPlain: [
        "Thanks for riding with Lyft.",
        "Total charged: $24.60",
        "Ride date: May 19, 2026",
      ].join("\n"),
      textHtml: null,
      receivedAt: new Date("2026-05-19T22:05:00.000Z"),
    },
    expected: {
      merchantNameContains: "lyft",
      totalMinorUnits: 2460,
      orderId: null,
    },
  },
  {
    name: "grubhub html-only receipt",
    input: {
      kind: "food_delivery",
      fromAddress: "Grubhub <no-reply@grubhub.com>",
      subject: "Your Grubhub order from Thai Basil",
      textPlain: null,
      textHtml: [
        "<html><body>",
        "<p>Your order from Thai Basil is on the way.</p>",
        "<p><strong>Order total:</strong> $28.15</p>",
        "</body></html>",
      ].join(""),
      receivedAt: new Date("2026-05-16T19:45:00.000Z"),
    },
    expected: {
      merchantNameContains: "grubhub",
      totalMinorUnits: 2815,
      orderId: null,
    },
  },
  {
    name: "fedex shipping update with declared value",
    input: {
      kind: "shipping_update",
      fromAddress: "FedEx <tracking@fedex.com>",
      subject: "Your package has been delivered",
      textPlain: [
        "Tracking number: 7946 1234 5678",
        "Delivered to: Front door",
        "Declared value: $200.00",
      ].join("\n"),
      textHtml: null,
      receivedAt: new Date("2026-05-22T13:00:00.000Z"),
    },
    expected: {
      merchantNameContains: "fedex",
      totalMinorUnits: 20000,
      orderId: null,
    },
  },
];

/** JSON the mock Claude client should return for a fixture (valid extraction). */
export function fixtureExtractionJson(
  fixture: ReceiptEmailFixture,
): Record<string, unknown> {
  const total =
    fixture.expected.totalMinorUnits === null
      ? null
      : (fixture.expected.totalMinorUnits / 100).toFixed(2);

  return {
    merchantName: fixture.expected.merchantNameContains
      .split(" ")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" "),
    merchantDomain: null,
    orderId: fixture.expected.orderId,
    orderUrl: null,
    totalAmount: total,
    currency: "USD",
    occurredAt: null,
    lineItems: [],
    confidence: 0.9,
  };
}
