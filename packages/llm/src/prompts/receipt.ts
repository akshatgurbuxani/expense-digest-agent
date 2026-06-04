import { RECEIPT_KINDS, type ReceiptKind } from "@expense/core";
import { z } from "zod";

const receiptKindEnum = z.enum(
  RECEIPT_KINDS as unknown as [ReceiptKind, ...ReceiptKind[]],
);

const decimalMoney = z
  .string()
  .regex(/^-?\d+(\.\d{2})?$/, "amount must be a decimal string like 45.99");

export const ReceiptExtractionResponseSchema = z.object({
  merchantName: z.string().min(1),
  merchantDomain: z.string().nullable(),
  orderId: z.string().nullable(),
  orderUrl: z.string().nullable(),
  totalAmount: decimalMoney.nullable(),
  currency: z.enum(["USD", "EUR", "GBP"]).default("USD"),
  occurredAt: z.string().nullable(),
  lineItems: z.array(
    z.object({
      description: z.string().min(1),
      quantity: z.number().nullable(),
      amount: decimalMoney.nullable(),
    }),
  ),
  confidence: z.number().min(0).max(1),
});

export type ReceiptExtractionResponse = z.infer<
  typeof ReceiptExtractionResponseSchema
>;

export function buildReceiptExtractionPrompt(input: {
  kind: ReceiptKind;
  fromAddress: string;
  subject: string;
  bodyText: string;
  receivedAt: Date;
}): string {
  return [
    "You extract structured purchase data from a receipt or order confirmation email.",
    "Return JSON only. Do not invent amounts, order IDs, or dates that are not clearly present in the email.",
    "If a field is missing or ambiguous, use null.",
    "totalAmount and line item amounts must be decimal strings like 45.99 (no currency symbol).",
    "occurredAt should be ISO-8601 when an order/purchase date is explicit; otherwise null.",
    "confidence is 0-1 for overall extraction quality.",
    "",
    `Classifier kind: ${input.kind} (one of: ${RECEIPT_KINDS.join(", ")})`,
    `From: ${input.fromAddress}`,
    `Subject: ${input.subject}`,
    `Received: ${input.receivedAt.toISOString()}`,
    "",
    "Email body:",
    input.bodyText || "(empty)",
  ].join("\n");
}

export function receiptBodyText(input: {
  textPlain: string | null;
  textHtml: string | null;
}): string {
  if (input.textPlain?.trim()) return input.textPlain.trim();
  if (!input.textHtml) return "";
  return input.textHtml
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
