import type { DigestFacts } from "@expense/core";
import { z } from "zod";

export const DigestResponseSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
});

export type DigestResponse = z.infer<typeof DigestResponseSchema>;

export function buildDigestPrompt(facts: DigestFacts): string {
  return [
    "Write a warm, concise weekly spending digest email.",
    "Use ONLY the monetary figures provided in the facts JSON below.",
    "Do NOT invent, recompute, or round any dollar amounts.",
    "Do NOT introduce any $ figures that are not already present in the facts.",
    "Percentages and non-dollar numbers in the facts may be referenced as written.",
    "When matchedReceipts, unmatchedReceipts, or chargesMissingReceipts are present,",
    "include a brief honest section about order emails linked (or not linked) to card charges.",
    "Use the pre-written reasonDetail and detail strings — do not invent match explanations.",
    "Return JSON with subject and body (plain text, not HTML).",
    "",
    "Facts JSON:",
    JSON.stringify(facts, null, 2),
  ].join("\n");
}
