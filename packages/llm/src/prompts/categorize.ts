import { CATEGORIES, type Category } from "@expense/core";
import { z } from "zod";

const categoryEnum = z.enum(CATEGORIES as unknown as [Category, ...Category[]]);

export const CategorizeResponseSchema = z.object({
  merchantName: z.string().min(1),
  category: categoryEnum,
  signals: z.object({
    isSubscription: z.boolean(),
    isRecurring: z.boolean(),
    confidence: z.number().min(0).max(1),
  }),
});

export type CategorizeResponse = z.infer<typeof CategorizeResponseSchema>;

export function buildCategorizePrompt(input: {
  rawName: string;
  plaidPfc: string | null;
  amountHint: string;
}): string {
  const categories = CATEGORIES.join(", ");
  return [
    "You categorize bank transactions for a personal expense digest.",
    `Choose exactly one category from: ${categories}.`,
    "Return JSON only with merchantName (cleaned, human-readable), category, and signals.",
    "signals.isSubscription and signals.isRecurring should reflect whether this looks like a subscription or recurring charge.",
    "signals.confidence is 0-1.",
    "",
    `Raw merchant text: ${input.rawName}`,
    `Plaid category hint: ${input.plaidPfc ?? "none"}`,
    `Amount (context only, do not invent other amounts): ${input.amountHint}`,
  ].join("\n");
}
